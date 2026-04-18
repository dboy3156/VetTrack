"use strict";

/**
 * Expiry check worker tests.
 * Run with: node tests/expiry-check-worker.test.js
 * Requires: dev server running on http://localhost:3001
 */

const BASE = "http://localhost:3001";
const RUN_ID = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const CLINIC_ALPHA = `expiry-worker-clinic-alpha-${RUN_ID}`;
const CLINIC_BETA = `expiry-worker-clinic-beta-${RUN_ID}`;

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ PASS: ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

async function request(path, init = {}) {
  return fetch(`${BASE}${path}`, init);
}

async function get(path, headers = {}) {
  return request(path, {
    method: "GET",
    headers,
  });
}

async function post(path, body = {}, headers = {}) {
  return request(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function patch(path, body = {}, headers = {}) {
  return request(path, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

async function remove(path, headers = {}) {
  return request(path, {
    method: "DELETE",
    headers,
  });
}

function buildDevHeaders({ clinicId, role = "admin", userId = "dev-user-alpha" } = {}) {
  return {
    ...(clinicId ? { "x-dev-clinic-id-override": clinicId } : {}),
    "x-dev-role-override": role,
    "x-dev-user-id-override": userId,
  };
}

function formatIsoDateDaysFromNow(daysFromNow) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  return date.toISOString().slice(0, 10);
}

async function createEquipmentForClinic(clinicId, nameSuffix) {
  const createRes = await post(
    "/api/equipment",
    {
      name: `Expiry Worker ${nameSuffix}`,
      serialNumber: `EW-${nameSuffix}-${Date.now()}`,
      model: "Monitor",
      location: `Ward-${nameSuffix}`,
    },
    buildDevHeaders({ clinicId, role: "admin" }),
  );

  if (!createRes.ok) {
    throw new Error(`Failed to create equipment (${createRes.status})`);
  }
  return createRes.json();
}

async function updateEquipmentExpiry(clinicId, equipmentId, expiryDate) {
  const res = await patch(
    `/api/equipment/${equipmentId}`,
    { expiryDate },
    buildDevHeaders({ clinicId, role: "admin" }),
  );
  if (!res.ok) {
    const payload = await res.text();
    throw new Error(`Failed to set expiryDate (${res.status}) ${payload}`);
  }
  return res.json();
}

async function triggerExpiryWorker() {
  return post(
    "/api/test/expiry-check/run",
    {},
    buildDevHeaders({ role: "admin", userId: "dev-user-alpha" }),
  );
}

async function fetchEquipment(clinicId, equipmentId) {
  const res = await get(
    `/api/equipment/${equipmentId}`,
    buildDevHeaders({ clinicId, role: "admin" }),
  );
  if (!res.ok) return null;
  return res.json();
}

async function cleanupEquipment(idsByClinic) {
  for (const [clinicId, ids] of Object.entries(idsByClinic)) {
    for (const id of ids) {
      await remove(`/api/equipment/${id}`, buildDevHeaders({ clinicId, role: "admin" }));
    }
  }
}

async function run() {
  console.log("=== Expiry worker tests ===");
  const createdIds = {
    [CLINIC_ALPHA]: [],
    [CLINIC_BETA]: [],
  };

  try {
    const health = await get("/api/healthz");
    if (!health.ok) {
      throw new Error(`healthz returned ${health.status}`);
    }
  } catch (err) {
    console.error("Dev server is not reachable on :3001.", err);
    process.exit(1);
  }

  try {
    const alphaWithin7 = await createEquipmentForClinic(CLINIC_ALPHA, "ALPHA-WITHIN-7");
    const alphaBeyond7 = await createEquipmentForClinic(CLINIC_ALPHA, "ALPHA-BEYOND-7");
    const alphaNoDate = await createEquipmentForClinic(CLINIC_ALPHA, "ALPHA-NO-DATE");
    const betaWithin7 = await createEquipmentForClinic(CLINIC_BETA, "BETA-WITHIN-7");

    createdIds[CLINIC_ALPHA].push(alphaWithin7.id, alphaBeyond7.id, alphaNoDate.id);
    createdIds[CLINIC_BETA].push(betaWithin7.id);

    await updateEquipmentExpiry(CLINIC_ALPHA, alphaWithin7.id, formatIsoDateDaysFromNow(3));
    await updateEquipmentExpiry(CLINIC_ALPHA, alphaBeyond7.id, formatIsoDateDaysFromNow(9));
    await updateEquipmentExpiry(CLINIC_BETA, betaWithin7.id, formatIsoDateDaysFromNow(2));

    const firstRun = await triggerExpiryWorker();
    assert(firstRun.status === 200, "Expiry worker trigger endpoint returns 200");
    const firstPayload = await firstRun.json();
    const firstNotified = firstPayload?.notifiedCount;
    assert(
      Number.isInteger(firstNotified) && firstNotified === 2,
      "Worker notifies equipment expiring within 7 days only",
      `expected notifiedCount = 2 got ${firstNotified}`,
    );

    const alphaWithinAfterFirst = await fetchEquipment(CLINIC_ALPHA, alphaWithin7.id);
    const alphaBeyondAfterFirst = await fetchEquipment(CLINIC_ALPHA, alphaBeyond7.id);
    const alphaNoDateAfterFirst = await fetchEquipment(CLINIC_ALPHA, alphaNoDate.id);
    const betaWithinAfterFirst = await fetchEquipment(CLINIC_BETA, betaWithin7.id);

    assert(
      Boolean(alphaWithinAfterFirst?.expiryNotifiedAt),
      "Worker sets expiryNotifiedAt for alpha equipment within 7 days",
    );
    assert(
      !alphaBeyondAfterFirst?.expiryNotifiedAt,
      "Worker does not notify equipment expiring in 8+ days",
    );
    assert(
      !alphaNoDateAfterFirst?.expiryNotifiedAt,
      "Worker ignores equipment with null expiryDate",
    );
    assert(
      Boolean(betaWithinAfterFirst?.expiryNotifiedAt),
      "Worker groups equipment by clinicId before sending notifications",
    );

    const secondRun = await triggerExpiryWorker();
    assert(secondRun.status === 200, "Second expiry worker trigger returns 200");
    const secondPayload = await secondRun.json();
    const secondNotified = secondPayload?.notifiedCount;
    assert(
      Number.isInteger(secondNotified) && secondNotified === 0,
      "Worker does not re-notify equipment where expiryNotifiedAt is already set",
      `expected notifiedCount = 0 got ${secondNotified}`,
    );
  } catch (err) {
    fail("Unexpected test runner error", err instanceof Error ? err.message : String(err));
  } finally {
    await cleanupEquipment(createdIds);
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error("Test process failed", err);
  process.exit(1);
});
