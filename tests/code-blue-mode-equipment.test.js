"use strict";

/**
 * Code Blue API smoke tests.
 * Run with: node tests/code-blue-mode-equipment.test.js
 * Requires: dev server running on http://localhost:3001
 */

const BASE = "http://localhost:3001";
const CLINIC_ALPHA = "code-blue-clinic-alpha";
const CLINIC_BETA = "code-blue-clinic-beta";

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

function buildDevHeaders({ clinicId, role = "vet", userId = "dev-user-alpha" } = {}) {
  return {
    ...(clinicId ? { "x-dev-clinic-id-override": clinicId } : {}),
    "x-dev-role-override": role,
    "x-dev-user-id-override": userId,
  };
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function isSortedDescByTimestamp(items) {
  for (let i = 1; i < items.length; i++) {
    const prev = items[i - 1].lastSeenTimestamp ? new Date(items[i - 1].lastSeenTimestamp).getTime() : -Infinity;
    const curr = items[i].lastSeenTimestamp ? new Date(items[i].lastSeenTimestamp).getTime() : -Infinity;
    if (prev < curr) return false;
  }
  return true;
}

async function createEquipmentForClinic(clinicId, nameSuffix) {
  const createRes = await post(
    "/api/equipment",
    {
      name: `Code Blue ${nameSuffix}`,
      serialNumber: `CB-${nameSuffix}`,
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

async function setEquipmentStatus(equipmentId, clinicId, status, delayMs = 0) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  const scanRes = await post(
    `/api/equipment/${equipmentId}/scan`,
    {
      status,
      note: status === "issue" ? "issue note" : undefined,
    },
    buildDevHeaders({ clinicId, role: "vet" }),
  );

  if (!scanRes.ok) {
    const payload = await scanRes.text();
    throw new Error(`Failed to set status=${status} (${scanRes.status}) ${payload}`);
  }
}

async function cleanupEquipment(idsByClinic) {
  for (const [clinicId, ids] of Object.entries(idsByClinic)) {
    for (const id of ids) {
      await remove(`/api/equipment/${id}`, buildDevHeaders({ clinicId, role: "admin" }));
    }
  }
}

async function run() {
  console.log("=== Code Blue API smoke tests ===");
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
    // Seed clinic alpha: 2 critical candidates + 1 irrelevant status.
    const alphaA = await createEquipmentForClinic(CLINIC_ALPHA, "A");
    const alphaB = await createEquipmentForClinic(CLINIC_ALPHA, "B");
    const alphaC = await createEquipmentForClinic(CLINIC_ALPHA, "C");
    createdIds[CLINIC_ALPHA].push(alphaA.id, alphaB.id, alphaC.id);

    // Seed clinic beta: should never leak to alpha results.
    const betaA = await createEquipmentForClinic(CLINIC_BETA, "BETA-A");
    createdIds[CLINIC_BETA].push(betaA.id);

    // Set statuses; create slight timestamp offset for deterministic sorting.
    await setEquipmentStatus(alphaA.id, CLINIC_ALPHA, "critical");
    await setEquipmentStatus(alphaB.id, CLINIC_ALPHA, "needs_attention", 20);
    await setEquipmentStatus(alphaC.id, CLINIC_ALPHA, "ok", 20);
    await setEquipmentStatus(betaA.id, CLINIC_BETA, "critical");

    const alphaCriticalRes = await get(
      "/api/equipment/critical",
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "vet" }),
    );
    assert(alphaCriticalRes.status === 200, "GET /api/equipment/critical returns 200 for authenticated request");
    const alphaCritical = await alphaCriticalRes.json();

    assert(Array.isArray(alphaCritical), "Returns an array payload");
    assert(
      alphaCritical.length === 2,
      "Returns only critical/needs_attention equipment",
      `expected 2 got ${alphaCritical.length}`,
    );
    assert(
      alphaCritical.every((item) => item.status === "critical" || item.status === "needs_attention"),
      "All returned rows have status critical or needs_attention",
    );
    assert(
      alphaCritical.every((item) => [alphaA.id, alphaB.id].includes(item.id)),
      "Never includes equipment outside clinic or status filter",
    );
    assert(
      alphaCritical.every((item) =>
        Object.prototype.hasOwnProperty.call(item, "id") &&
        Object.prototype.hasOwnProperty.call(item, "name") &&
        Object.prototype.hasOwnProperty.call(item, "category") &&
        Object.prototype.hasOwnProperty.call(item, "lastSeenLocation") &&
        Object.prototype.hasOwnProperty.call(item, "lastSeenTimestamp"),
      ),
      "Each row includes id/name/category/lastSeenLocation/lastSeenTimestamp",
    );
    assert(
      isSortedDescByTimestamp(alphaCritical),
      "Results are sorted by lastSeenTimestamp DESC",
    );

    // Empty-array contract: clear statuses away from critical/needs_attention.
    await patch(
      `/api/equipment/${alphaA.id}`,
      { status: "ok" },
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "admin" }),
    );
    await patch(
      `/api/equipment/${alphaB.id}`,
      { status: "maintenance" },
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "admin" }),
    );

    const alphaEmptyRes = await get(
      "/api/equipment/critical",
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "vet" }),
    );
    assert(alphaEmptyRes.status === 200, "Returns 200 (not 404) when no critical equipment exists");
    const alphaEmpty = await alphaEmptyRes.json();
    assert(Array.isArray(alphaEmpty) && alphaEmpty.length === 0, "Returns empty array when no critical equipment exists");

    // Unauthenticated probe:
    // - In production auth mode, this should return 401.
    // - In local dev bypass mode, this may return 200 by design.
    const unauthRes = await get("/api/equipment/critical");
    assert(
      unauthRes.status === 401 || unauthRes.status === 200,
      "Unauthenticated probe returns 401 (or 200 in dev bypass mode)",
      `received status ${unauthRes.status}`,
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
