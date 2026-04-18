"use strict";

/**
 * Charge alert worker tests.
 * Run with: node tests/charge-alert-worker.test.js
 * Requires: dev server running on http://localhost:3001 (TEST_MODE=true)
 */

const BASE = "http://localhost:3001";
const RUN_ID = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const CLINIC = `charge-worker-clinic-${RUN_ID}`;

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postWithRateLimitRetry(path, body, headers, maxAttempts = 5) {
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt += 1;
    const res = await post(path, body, headers);
    if (res.status !== 429) {
      return res;
    }
    await sleep(1200);
  }
  return post(path, body, headers);
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

async function createEquipment(nameSuffix) {
  const createRes = await post(
    "/api/equipment",
    {
      name: `Charge Worker ${nameSuffix}`,
      serialNumber: `CW-${nameSuffix}-${Date.now()}`,
      model: "Pump",
      location: `Room-${nameSuffix}`,
    },
    buildDevHeaders({ clinicId: CLINIC }),
  );
  if (!createRes.ok) {
    throw new Error(`Failed to create equipment (${createRes.status})`);
  }
  return createRes.json();
}

async function checkoutEquipment(equipmentId) {
  const res = await postWithRateLimitRetry(
    `/api/equipment/${equipmentId}/checkout`,
    {},
    buildDevHeaders({ clinicId: CLINIC, role: "technician" }),
  );
  if (!res.ok) {
    throw new Error(`Failed to checkout equipment (${res.status})`);
  }
}

async function returnEquipment(equipmentId) {
  const res = await postWithRateLimitRetry(
    `/api/equipment/${equipmentId}/return`,
    {},
    buildDevHeaders({ clinicId: CLINIC, role: "technician" }),
  );
  if (!res.ok) {
    throw new Error(`Failed to return equipment (${res.status})`);
  }
}

async function createReturn(equipmentId, payload) {
  const res = await post(
    "/api/returns",
    { equipmentId, ...payload },
    buildDevHeaders({ clinicId: CLINIC, role: "technician" }),
  );
  if (!res.ok) {
    throw new Error(`Failed to create return (${res.status})`);
  }
  return res.json();
}

async function updateReturn(returnId, payload) {
  const res = await patch(
    `/api/returns/${returnId}`,
    payload,
    buildDevHeaders({ clinicId: CLINIC, role: "technician" }),
  );
  if (!res.ok) {
    throw new Error(`Failed to update return (${res.status})`);
  }
  return res.json();
}

async function runChargeAlert(returnId) {
  return post(
    "/api/test/charge-alert/run",
    { returnId },
    buildDevHeaders({ clinicId: CLINIC, role: "admin" }),
  );
}

async function fetchReturn(returnId) {
  const res = await get(
    `/api/test/returns/${returnId}`,
    buildDevHeaders({ clinicId: CLINIC, role: "admin" }),
  );
  if (!res.ok) {
    throw new Error(`Failed to fetch return (${res.status})`);
  }
  return res.json();
}

async function cleanupEquipment(ids) {
  for (const id of ids) {
    await remove(`/api/equipment/${id}`, buildDevHeaders({ clinicId: CLINIC }));
  }
}

async function run() {
  console.log("=== Charge alert worker tests ===");
  const createdEquipmentIds = [];

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
    const eqA = await createEquipment("A");
    const eqB = await createEquipment("B");
    const eqC = await createEquipment("C");
    createdEquipmentIds.push(eqA.id, eqB.id, eqC.id);

    await checkoutEquipment(eqA.id);
    await checkoutEquipment(eqB.id);
    await checkoutEquipment(eqC.id);

    await returnEquipment(eqA.id);
    await returnEquipment(eqB.id);
    await returnEquipment(eqC.id);

    const returnA = await createReturn(eqA.id, {
      isPluggedIn: false,
      plugInDeadlineMinutes: 30,
    });
    const returnB = await createReturn(eqB.id, {
      isPluggedIn: true,
      plugInDeadlineMinutes: 30,
    });
    const returnC = await createReturn(eqC.id, {
      isPluggedIn: false,
      plugInDeadlineMinutes: 45,
    });

    assert(
      typeof returnA.chargeAlertJobId === "string" && returnA.chargeAlertJobId.includes(returnA.id),
      "Delayed job id is set when return is created with isPluggedIn=false",
      `jobId=${returnA.chargeAlertJobId}`,
    );

    assert(
      returnB.chargeAlertJobId === null,
      "No delayed job when return is created with isPluggedIn=true",
      `jobId=${returnB.chargeAlertJobId}`,
    );

    const runAFirst = await runChargeAlert(returnA.id);
    assert(runAFirst.status === 200, "Manual charge alert run endpoint returns 200");
    const runAFirstPayload = await runAFirst.json();
    assert(
      runAFirstPayload.alerted === true,
      "Worker sends alert when item is still unplugged",
      `payload=${JSON.stringify(runAFirstPayload)}`,
    );

    const returnAAfterFirst = await fetchReturn(returnA.id);
    assert(
      Boolean(returnAAfterFirst.return?.plugInAlertSentAt),
      "Worker sets plugInAlertSentAt after sending alert",
    );

    const runASecond = await runChargeAlert(returnA.id);
    assert(runASecond.status === 200, "Second manual charge alert run returns 200");
    const runASecondPayload = await runASecond.json();
    assert(
      runASecondPayload.alerted === false,
      "Worker does not alert twice when plugInAlertSentAt already exists",
      `payload=${JSON.stringify(runASecondPayload)}`,
    );

    const runB = await runChargeAlert(returnB.id);
    assert(runB.status === 200, "Manual run for plugged item returns 200");
    const runBPayload = await runB.json();
    assert(
      runBPayload.alerted === false,
      "Worker does nothing when isPluggedIn=true",
      `payload=${JSON.stringify(runBPayload)}`,
    );

    const patchedC = await updateReturn(returnC.id, { isPluggedIn: true });
    assert(
      patchedC.isPluggedIn === true && patchedC.chargeAlertJobId === null,
      "PATCH isPluggedIn=true cancels pending BullMQ job id",
      `payload=${JSON.stringify(patchedC)}`,
    );
  } catch (err) {
    fail("Unexpected test runner error", err instanceof Error ? err.message : String(err));
  } finally {
    await cleanupEquipment(createdEquipmentIds);
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
