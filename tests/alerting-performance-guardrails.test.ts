import assert from "node:assert/strict";
import {
  evaluateAlerts,
  getAlertEngineSnapshot,
  resetAlertEngineForTests,
} from "../server/lib/alert-engine.js";
import {
  getAccessDeniedMetricsWindowSnapshot,
  recordAccessDenied,
  resetAccessDeniedMetricsWindow,
} from "../server/lib/access-denied.js";
import { createLogLimiter } from "../server/lib/log-safety.js";
import {
  runSystemWatchdogTick,
  stopSystemWatchdogForTests,
} from "../server/lib/system-watchdog.js";

type FakeRequest = {
  originalUrl: string;
  path: string;
  method: string;
  clinicId?: string | null;
  authUser?: { id?: string | null };
};

function makeReq(): FakeRequest {
  return {
    originalUrl: "/api/equipment",
    path: "/api/equipment",
    method: "GET",
    clinicId: "clinic_1",
    authUser: { id: "user_1" },
  };
}

async function testAccessDeniedSpikeAlert(): Promise<void> {
  resetAlertEngineForTests();
  resetAccessDeniedMetricsWindow();
  const req = makeReq();
  for (let i = 0; i < 12; i += 1) {
    recordAccessDenied({
      req: req as never,
      reason: "TENANT_MISMATCH",
      statusCode: 403,
      source: "test",
    });
  }

  await evaluateAlerts({
    thresholds: { accessDeniedPerMinute: 10 },
    dataIntegrityChecker: async () => ({
      status: "ok",
      totals: { nullClinicIdRows: 0, crossTenantMismatches: 0, orphanRelations: 0 },
    }),
  });

  const snapshot = getAlertEngineSnapshot();
  assert.equal(snapshot.counts.ACCESS_DENIED_SPIKE, 1, "should trigger ACCESS_DENIED_SPIKE");
}

async function testDataCorruptionAlert(): Promise<void> {
  resetAlertEngineForTests();
  resetAccessDeniedMetricsWindow();

  await evaluateAlerts({
    thresholds: { accessDeniedPerMinute: 9999 },
    dataIntegrityChecker: async () => ({
      status: "degraded",
      totals: { nullClinicIdRows: 1, crossTenantMismatches: 0, orphanRelations: 2 },
    }),
  });

  const snapshot = getAlertEngineSnapshot();
  assert.equal(snapshot.counts.DATA_CORRUPTION, 1, "should trigger DATA_CORRUPTION alert");
  assert.equal(snapshot.isDegraded, true, "should mark system degraded for critical corruption");
}

async function testWatchdogNoOverlap(): Promise<void> {
  stopSystemWatchdogForTests();
  let runs = 0;
  const runChecks = async () => {
    runs += 1;
    await new Promise((resolve) => setTimeout(resolve, 80));
  };

  const first = runSystemWatchdogTick({ runChecks, timeoutMs: 500 });
  const second = runSystemWatchdogTick({ runChecks, timeoutMs: 500 });
  const [firstResult, secondResult] = await Promise.all([first, second]);

  assert.equal(firstResult, true, "first watchdog tick should run");
  assert.equal(secondResult, false, "second overlapping watchdog tick should be skipped");
  assert.equal(runs, 1, "watchdog should execute checks only once");
}

function testMetricsReset(): void {
  resetAccessDeniedMetricsWindow();
  const req = makeReq();
  recordAccessDenied({
    req: req as never,
    reason: "MISSING_CLINIC_ID",
    statusCode: 403,
    source: "test",
  });
  const beforeReset = getAccessDeniedMetricsWindowSnapshot();
  assert.equal(beforeReset.MISSING_CLINIC_ID, 1, "window metrics should include the recorded event");

  resetAccessDeniedMetricsWindow();
  const afterReset = getAccessDeniedMetricsWindowSnapshot();
  assert.equal(afterReset.MISSING_CLINIC_ID, 0, "window metrics should reset to zero");
}

function testRecordAccessDeniedWithoutHeaders(): void {
  resetAccessDeniedMetricsWindow();
  const req = makeReq();
  recordAccessDenied({
    req: req as never,
    reason: "TENANT_CONTEXT_MISSING",
    statusCode: 403,
    source: "test",
  });
  const snapshot = getAccessDeniedMetricsWindowSnapshot();
  assert.equal(
    snapshot.TENANT_CONTEXT_MISSING,
    1,
    "recordAccessDenied should handle requests without headers and still count metrics",
  );
}

function testLogExplosionProtection(): void {
  const limiter = createLogLimiter({ dedupeWindowMs: 10_000, sampleRate: 1, maxEntries: 5 });
  let allowed = 0;
  for (let i = 0; i < 50; i += 1) {
    if (limiter.shouldLog("same-error-key")) {
      allowed += 1;
    }
  }

  const snapshot = limiter.getSnapshot();
  assert.equal(allowed, 1, "repeated identical logs should be deduplicated");
  assert.ok(snapshot.suppressedLogs >= 49, "suppressed logs count should increase");
}

async function run(): Promise<void> {
  await testAccessDeniedSpikeAlert();
  await testDataCorruptionAlert();
  await testWatchdogNoOverlap();
  testMetricsReset();
  testRecordAccessDeniedWithoutHeaders();
  testLogExplosionProtection();
  stopSystemWatchdogForTests();
  console.log("✅ alerting-performance-guardrails.test.ts PASSED");
}

void run().catch((error) => {
  console.error("❌ alerting-performance-guardrails.test.ts FAILED");
  console.error(error);
  process.exit(1);
});
