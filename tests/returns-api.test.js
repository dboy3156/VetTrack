"use strict";

/**
 * Returns API tests.
 * Run with: node tests/returns-api.test.js
 * Requires: dev server running on http://localhost:3001
 */

const BASE = "http://localhost:3001";
const RUN_ID = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const CLINIC_ALPHA = `returns-api-clinic-alpha-${RUN_ID}`;
const CLINIC_BETA = `returns-api-clinic-beta-${RUN_ID}`;

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
      name: `Returns API ${nameSuffix}`,
      serialNumber: `RA-${nameSuffix}-${Date.now()}`,
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

async function createReturn(clinicId, equipmentId, body, role = "admin") {
  return post(
    "/api/returns",
    {
      equipmentId,
      ...body,
    },
    buildDevHeaders({ clinicId, role }),
  );
}

async function postWithRetry(path, body, headers, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const res = await post(path, body, headers);
    if (res.status !== 429) return res;
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  return post(path, body, headers);
}

async function patchWithRetry(path, body, headers, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const res = await patch(path, body, headers);
    if (res.status !== 429) return res;
    await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
  }
  return patch(path, body, headers);
}

async function cleanupEquipment(idsByClinic) {
  for (const [clinicId, ids] of Object.entries(idsByClinic)) {
    for (const id of ids) {
      await remove(`/api/equipment/${id}`, buildDevHeaders({ clinicId, role: "admin" }));
    }
  }
}

async function run() {
  console.log("=== Returns API tests ===");
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

    const noAuthCreate = await postWithRetry("/api/returns", {
      equipmentId: alphaItem.id,
      isPluggedIn: true,
      }, {
      "x-dev-bypass-auth": "false",
    });
    assert(
      [401, 404].includes(noAuthCreate.status),
      "Unauthenticated POST /api/returns is rejected",
      `expected 401/404 got ${noAuthCreate.status}`,
    );

    const createWithDefaultDeadline = await createReturn(CLINIC_ALPHA, alphaItem.id, {
      isPluggedIn: true,
    });
    assert(
      createWithDefaultDeadline.status === 201,
      "POST /api/returns accepts isPluggedIn boolean field",
      `expected 201 got ${createWithDefaultDeadline.status}`,
    );
    const createdDefault = await createWithDefaultDeadline.json();
    assert(
      createdDefault.isPluggedIn === true,
      "POST /api/returns persists isPluggedIn value",
      `expected true got ${createdDefault.isPluggedIn}`,
    );
    assert(
      createdDefault.plugInDeadlineMinutes === 30,
      "POST /api/returns defaults plugInDeadlineMinutes to 30",
      `expected 30 got ${createdDefault.plugInDeadlineMinutes}`,
    );

    const createWithCustomDeadline = await createReturn(CLINIC_ALPHA, alphaItem.id, {
      isPluggedIn: false,
      plugInDeadlineMinutes: 45,
    });
    assert(
      createWithCustomDeadline.status === 201,
      "POST /api/returns accepts optional plugInDeadlineMinutes",
      `expected 201 got ${createWithCustomDeadline.status}`,
    );
    const createdCustom = await createWithCustomDeadline.json();
    assert(
      createdCustom.plugInDeadlineMinutes === 45,
      "POST /api/returns stores custom plugInDeadlineMinutes",
      `expected 45 got ${createdCustom.plugInDeadlineMinutes}`,
    );

    const patchCrossClinic = await patchWithRetry(
      `/api/returns/${createdCustom.id}`,
      { isPluggedIn: true },
      buildDevHeaders({ clinicId: CLINIC_BETA, role: "admin" }),
    );
    assert(
      patchCrossClinic.status === 404,
      "PATCH /api/returns/:id rejects requests from a different clinic",
      `expected 404 got ${patchCrossClinic.status}`,
    );

    const patchSameClinic = await patchWithRetry(
      `/api/returns/${createdCustom.id}`,
      { isPluggedIn: true },
      buildDevHeaders({ clinicId: CLINIC_ALPHA, role: "admin" }),
    );
    assert(
      patchSameClinic.status === 200,
      "PATCH /api/returns/:id allows same-clinic updates",
      `expected 200 got ${patchSameClinic.status}`,
    );
    const updated = await patchSameClinic.json();
    assert(
      updated.isPluggedIn === true,
      "PATCH /api/returns/:id updates isPluggedIn",
      `expected true got ${updated.isPluggedIn}`,
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
