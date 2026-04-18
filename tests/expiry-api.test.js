"use strict";

/**
 * Expiry API tests for PATCH /api/equipment/:id
 * Run with: node tests/expiry-api.test.js
 * Requires: dev server running on http://localhost:3001
 */

const BASE = "http://localhost:3001";
const CLINIC_ALPHA = "expiry-api-clinic-alpha";
const CLINIC_BETA = "expiry-api-clinic-beta";

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
  return request(path, { method: "GET", headers });
}

async function post(path, body = {}, headers = {}) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function patch(path, body = {}, headers = {}) {
  return request(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

async function remove(path, headers = {}) {
  return request(path, { method: "DELETE", headers });
}

function buildDevHeaders({ clinicId, role = "admin", userId = "dev-user-alpha" } = {}) {
  return {
    ...(clinicId ? { "x-dev-clinic-id-override": clinicId } : {}),
    "x-dev-role-override": role,
    "x-dev-user-id-override": userId,
  };
}

async function createEquipmentForClinic(clinicId, nameSuffix) {
  const createRes = await post(
    "/api/equipment",
    {
      name: `Expiry API ${nameSuffix}`,
      serialNumber: `EA-${nameSuffix}-${Date.now()}`,
      model: "Pump",
      location: `Room-${nameSuffix}`,
    },
    buildDevHeaders({ clinicId, role: "admin" }),
  );
  if (!createRes.ok) {
    throw new Error(`Failed to create equipment (${createRes.status})`);
  }
  return createRes.json();
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
  console.log("=== Expiry API tests ===");
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
    const alphaItem = await createEquipmentForClinic(CLINIC_ALPHA, "ALPHA");
    const betaItem = await createEquipmentForClinic(CLINIC_BETA, "BETA");
    createdIds[CLINIC_ALPHA].push(alphaItem.id);
    createdIds[CLINIC_BETA].push(betaItem.id);

    const validPatch = await patch(
      `/api/equipment/${alphaItem.id}`,
      { expiryDate: "2030-12-25" },
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "admin" }),
    );
    assert(validPatch.status === 200, "PATCH accepts valid ISO date string for expiryDate");

    const alphaAfterValid = await fetchEquipment(CLINIC_ALPHA, alphaItem.id);
    assert(
      alphaAfterValid?.expiryDate === "2030-12-25",
      "expiryDate persists when valid ISO date is patched",
      `expected 2030-12-25 got ${alphaAfterValid?.expiryDate}`,
    );

    const clearPatch = await patch(
      `/api/equipment/${alphaItem.id}`,
      { expiryDate: null },
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "admin" }),
    );
    assert(clearPatch.status === 200, "PATCH accepts null to clear expiryDate");

    const alphaAfterClear = await fetchEquipment(CLINIC_ALPHA, alphaItem.id);
    assert(
      alphaAfterClear?.expiryDate === null,
      "expiryDate is cleared to null",
      `expected null got ${alphaAfterClear?.expiryDate}`,
    );

    const malformedPatch = await patch(
      `/api/equipment/${alphaItem.id}`,
      { expiryDate: "2026/11/15" },
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "admin" }),
    );
    assert(
      malformedPatch.status === 400,
      "PATCH rejects malformed expiryDate with 400",
      `expected 400 got ${malformedPatch.status}`,
    );

    const crossClinicPatch = await patch(
      `/api/equipment/${betaItem.id}`,
      { expiryDate: "2031-01-01" },
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "admin" }),
    );
    assert(
      crossClinicPatch.status === 404,
      "clinicId ownership is enforced for PATCH expiryDate",
      `expected 404 got ${crossClinicPatch.status}`,
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
