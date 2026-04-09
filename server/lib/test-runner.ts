import { logAction } from "./stability-log.js";
import { STABILITY_TOKEN } from "./stability-token.js";

const PORT = Number(process.env.PORT) || 3001;
const BASE = `http://localhost:${PORT}`;

export type TestStatus = "pass" | "fail" | "warn" | "skip";

export interface TestResult {
  id: string;
  suite: "functional" | "stress" | "edge";
  name: string;
  status: TestStatus;
  durationMs: number;
  expected?: string;
  actual?: string;
  detail?: string;
}

export interface TestRunReport {
  runId: string;
  startedAt: string;
  finishedAt: string | null;
  status: "idle" | "running" | "done" | "error";
  results: TestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warned: number;
    skipped: number;
    avgLatencyMs: number;
    maxLatencyMs: number;
  };
}

let currentReport: TestRunReport = makeEmptyReport();
let isRunning = false;
let scheduleTimer: ReturnType<typeof setInterval> | null = null;
let scheduleIntervalHours = 0;
export let testModeEnabled = false;

function makeEmptyReport(): TestRunReport {
  return {
    runId: "",
    startedAt: "",
    finishedAt: null,
    status: "idle",
    results: [],
    summary: { total: 0, passed: 0, failed: 0, warned: 0, skipped: 0, avgLatencyMs: 0, maxLatencyMs: 0 },
  };
}

export function getReport(): TestRunReport {
  return currentReport;
}

export function isTestRunning(): boolean {
  return isRunning;
}

export function getScheduleHours(): number {
  return scheduleIntervalHours;
}

export function setTestMode(enabled: boolean): void {
  testModeEnabled = enabled;
  logAction(
    enabled ? "warn" : "info",
    "system",
    enabled ? "Testing mode enabled" : "Testing mode disabled",
    enabled ? "Test data will be tagged with __TEST__ prefix and cleaned up after runs" : undefined
  );
}

export function setSchedule(hours: number): void {
  if (scheduleTimer) {
    clearInterval(scheduleTimer);
    scheduleTimer = null;
  }
  scheduleIntervalHours = hours;
  if (hours > 0) {
    scheduleTimer = setInterval(() => {
      if (!isRunning) runAllTests().catch(() => {});
    }, hours * 60 * 60 * 1000);
    logAction("info", "scheduler", `Scheduled test runs every ${hours} hour(s)`);
  } else {
    logAction("info", "scheduler", "Scheduled test runs disabled");
  }
}

async function apiGet(path: string): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: { "x-stability-token": STABILITY_TOKEN },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, ms: Date.now() - t0 };
  } catch (err) {
    return { status: 0, body: { error: String(err) }, ms: Date.now() - t0 };
  }
}

async function apiPost(path: string, payload: unknown): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-stability-token": STABILITY_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, ms: Date.now() - t0 };
  } catch (err) {
    return { status: 0, body: { error: String(err) }, ms: Date.now() - t0 };
  }
}

async function apiDelete(path: string): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "DELETE",
      headers: { "x-stability-token": STABILITY_TOKEN },
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, ms: Date.now() - t0 };
  } catch (err) {
    return { status: 0, body: { error: String(err) }, ms: Date.now() - t0 };
  }
}

async function apiPatch(path: string, payload: unknown): Promise<{ status: number; body: unknown; ms: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${BASE}${path}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-stability-token": STABILITY_TOKEN,
      },
      body: JSON.stringify(payload),
    });
    const body = await res.json().catch(() => null);
    return { status: res.status, body, ms: Date.now() - t0 };
  } catch (err) {
    return { status: 0, body: { error: String(err) }, ms: Date.now() - t0 };
  }
}

function makeResult(
  id: string,
  suite: TestResult["suite"],
  name: string,
  status: TestStatus,
  ms: number,
  expected?: string,
  actual?: string,
  detail?: string
): TestResult {
  return { id, suite, name, status, durationMs: ms, expected, actual, detail };
}

async function runFunctionalTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // 1. Health / metrics
  {
    const r = await apiGet("/api/metrics");
    const ok = r.status === 200 && r.body && typeof (r.body as Record<string, unknown>).uptime === "number";
    results.push(makeResult("fn-metrics", "functional", "Server health check", ok ? "pass" : "fail", r.ms,
      "200 + uptime number", `${r.status}`, ok ? undefined : JSON.stringify(r.body)));
    logAction(ok ? "success" : "error", "functional", "Health check", `${r.ms}ms`, r.ms);
  }

  // 2. Equipment list
  {
    const r = await apiGet("/api/equipment");
    const body = r.body as Record<string, unknown> | null;
    const ok = r.status === 200 && (
      Array.isArray(r.body) ||
      (body !== null && Array.isArray(body.items))
    );
    results.push(makeResult("fn-equipment-list", "functional", "Equipment list fetch", ok ? "pass" : "fail", r.ms,
      "200 + array or {items:array}", `${r.status}`, ok ? undefined : JSON.stringify(r.body)));
    logAction(ok ? "success" : "error", "functional", "Equipment list", `${r.ms}ms`, r.ms);
  }

  // 3. Folders list
  {
    const r = await apiGet("/api/folders");
    const ok = r.status === 200 && Array.isArray(r.body);
    results.push(makeResult("fn-folders", "functional", "Folders list fetch", ok ? "pass" : "fail", r.ms,
      "200 + array", `${r.status}`));
    logAction(ok ? "success" : "error", "functional", "Folders list", `${r.ms}ms`, r.ms);
  }

  // 4. Analytics
  {
    const r = await apiGet("/api/analytics");
    const ok = r.status === 200 && r.body && typeof r.body === "object";
    results.push(makeResult("fn-analytics", "functional", "Analytics fetch", ok ? "pass" : "fail", r.ms,
      "200 + object", `${r.status}`));
    logAction(ok ? "success" : "error", "functional", "Analytics", `${r.ms}ms`, r.ms);
  }

  // 5. Activity feed
  {
    const r = await apiGet("/api/activity");
    const body = r.body as Record<string, unknown> | null;
    const ok = r.status === 200 && (
      Array.isArray(r.body) ||
      (body !== null && typeof body === "object" &&
        (Array.isArray(body.items) || Array.isArray(body.activities) || Array.isArray(body.entries) || Array.isArray(body.data)))
    );
    results.push(makeResult("fn-activity", "functional", "Activity feed fetch", ok ? "pass" : "fail", r.ms,
      "200 + array or {items/activities/entries/data:array}", `${r.status}`, ok ? undefined : JSON.stringify(r.body)));
    logAction(ok ? "success" : "error", "functional", "Activity feed", `${r.ms}ms`, r.ms);
  }

  // 6. Users list
  {
    const r = await apiGet("/api/users");
    const body = r.body as Record<string, unknown> | null;
    const ok = r.status === 200 && (
      Array.isArray(r.body) ||
      (body !== null && Array.isArray(body.items))
    );
    results.push(makeResult("fn-users", "functional", "Users list fetch", ok ? "pass" : "fail", r.ms,
      "200 + array or {items:array}", `${r.status}`, ok ? undefined : JSON.stringify(r.body)));
    logAction(ok ? "success" : "error", "functional", "Users list", `${r.ms}ms`, r.ms);
  }

  // 7. Equipment CRUD in test mode
  if (testModeEnabled) {
    const testName = `__TEST__Equipment-${Date.now()}`;
    let createdId: string | null = null;

    // Create
    {
      const r = await apiPost("/api/equipment", { name: testName, status: "ok", location: "Test-Lab" });
      const ok = r.status === 201 && (r.body as Record<string, unknown>)?.id;
      if (ok) createdId = (r.body as Record<string, unknown>).id as string;
      results.push(makeResult("fn-create", "functional", "Create equipment (test mode)", ok ? "pass" : "fail", r.ms,
        "201 + id", `${r.status}`));
      logAction(ok ? "success" : "error", "functional", "Create equipment [TEST]", createdId ?? "none", r.ms);
    }

    if (createdId) {
      // Read
      {
        const r = await apiGet(`/api/equipment/${createdId}`);
        const ok = r.status === 200 && (r.body as Record<string, unknown>)?.id === createdId;
        results.push(makeResult("fn-read", "functional", "Read equipment (test mode)", ok ? "pass" : "fail", r.ms,
          "200 + matching id", `${r.status}`));
      }

      // Update
      {
        const r = await apiPatch(`/api/equipment/${createdId}`, { location: "Test-Lab-Updated" });
        const ok = r.status === 200;
        results.push(makeResult("fn-update", "functional", "Update equipment (test mode)", ok ? "pass" : "fail", r.ms,
          "200", `${r.status}`));
      }

      // Scan
      {
        const r = await apiPost(`/api/equipment/${createdId}/scan`, { status: "ok", note: "test scan" });
        const ok = r.status === 200 || r.status === 201;
        results.push(makeResult("fn-scan", "functional", "Scan equipment (test mode)", ok ? "pass" : "fail", r.ms,
          "200 or 201", `${r.status}`));
        logAction(ok ? "success" : "error", "functional", "Scan equipment [TEST]", `status ${r.status}`, r.ms);
      }

      // Delete (cleanup)
      {
        const r = await apiDelete(`/api/equipment/${createdId}`);
        const ok = r.status === 200 || r.status === 204;
        results.push(makeResult("fn-delete", "functional", "Delete equipment (test mode)", ok ? "pass" : "fail", r.ms,
          "200 or 204", `${r.status}`));
        logAction(ok ? "success" : "error", "functional", "Delete equipment [TEST]", `id ${createdId}`, r.ms);
      }
    }
  } else {
    results.push(makeResult("fn-crud", "functional", "Equipment CRUD (skipped — enable testing mode)", "skip", 0,
      "testing mode on", "off"));
  }

  return results;
}

async function runStressTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // 1. Concurrent equipment list (5 parallel)
  {
    const CONCURRENCY = 5;
    const t0 = Date.now();
    const requests = Array.from({ length: CONCURRENCY }, () => apiGet("/api/equipment"));
    const responses = await Promise.all(requests);
    const total = Date.now() - t0;
    const latencies = responses.map((r) => r.ms);
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const max = Math.max(...latencies);
    const allOk = responses.every((r) => r.status === 200);
    const status: TestStatus = !allOk ? "fail" : max > 3000 ? "warn" : "pass";
    results.push(makeResult(
      "stress-concurrent", "stress",
      `Concurrent requests (${CONCURRENCY}x equipment list)`,
      status, total,
      "all 200, max < 3000ms",
      `all ok: ${allOk}, avg: ${avg}ms, max: ${max}ms`,
      max > 3000 ? `Latency spike detected: ${max}ms max` : undefined
    ));
    logAction(status === "fail" ? "error" : status === "warn" ? "warn" : "success",
      "stress", "Concurrent requests", `avg ${avg}ms, max ${max}ms`, avg);
  }

  // 2. Rapid sequential requests (10 in a row)
  {
    const COUNT = 10;
    const latencies: number[] = [];
    let allOk = true;
    for (let i = 0; i < COUNT; i++) {
      const r = await apiGet("/api/equipment");
      latencies.push(r.ms);
      if (r.status !== 200) allOk = false;
    }
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const max = Math.max(...latencies);
    const first = latencies[0];
    const last = latencies[latencies.length - 1];
    const degradation = last > first * 3;
    const status: TestStatus = !allOk ? "fail" : degradation ? "warn" : "pass";
    results.push(makeResult(
      "stress-rapid", "stress",
      `Rapid sequential requests (${COUNT}x equipment list)`,
      status, latencies.reduce((a, b) => a + b, 0),
      "no degradation >3x, all 200",
      `avg: ${avg}ms, max: ${max}ms, first: ${first}ms, last: ${last}ms`,
      degradation ? `Possible degradation: first ${first}ms → last ${last}ms` : undefined
    ));
    logAction(status === "fail" ? "error" : status === "warn" ? "warn" : "success",
      "stress", "Rapid sequential requests", `avg ${avg}ms, max ${max}ms`, avg);
  }

  // 3. Concurrent analytics (heavy endpoint)
  {
    const CONCURRENCY = 3;
    const t0 = Date.now();
    const requests = Array.from({ length: CONCURRENCY }, () => apiGet("/api/analytics"));
    const responses = await Promise.all(requests);
    const total = Date.now() - t0;
    const latencies = responses.map((r) => r.ms);
    const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
    const max = Math.max(...latencies);
    const allOk = responses.every((r) => r.status === 200);
    const status: TestStatus = !allOk ? "fail" : max > 5000 ? "warn" : "pass";
    results.push(makeResult(
      "stress-analytics", "stress",
      `Concurrent analytics (${CONCURRENCY}x)`,
      status, total,
      "all 200, max < 5000ms",
      `allOk: ${allOk}, avg: ${avg}ms, max: ${max}ms`,
      max > 5000 ? `Analytics latency spike: ${max}ms` : undefined
    ));
    logAction(allOk ? "success" : "error", "stress", "Concurrent analytics", `avg ${avg}ms`, avg);
  }

  return results;
}

async function runEdgeCaseTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  // 1. Missing required field
  {
    const r = await apiPost("/api/equipment", { status: "ok" });
    const ok = r.status === 400;
    results.push(makeResult("edge-missing-name", "edge", "POST equipment with missing name → 400",
      ok ? "pass" : "warn", r.ms, "400", `${r.status}`,
      !ok ? "Server accepted equipment with no name — validation gap" : undefined));
    logAction(ok ? "success" : "warn", "edge", "Missing required field", `got ${r.status}`, r.ms);
  }

  // 2. Invalid equipment ID
  {
    const r = await apiGet("/api/equipment/does-not-exist-12345678");
    const ok = r.status === 404;
    results.push(makeResult("edge-not-found", "edge", "GET nonexistent equipment → 404",
      ok ? "pass" : "fail", r.ms, "404", `${r.status}`));
    logAction(ok ? "success" : "error", "edge", "Nonexistent equipment ID", `got ${r.status}`, r.ms);
  }

  // 3. Invalid scan status
  {
    const r = await apiPost("/api/equipment/does-not-exist/scan", { status: "INVALID_STATUS" });
    const ok = r.status === 400 || r.status === 404 || r.status === 422;
    results.push(makeResult("edge-invalid-scan", "edge", "POST scan with invalid status → 4xx",
      ok ? "pass" : "warn", r.ms, "400/404/422", `${r.status}`,
      !ok ? "Server accepted invalid scan status" : undefined));
    logAction(ok ? "success" : "warn", "edge", "Invalid scan status", `got ${r.status}`, r.ms);
  }

  // 4. Empty body POST
  {
    const r = await apiPost("/api/equipment", {});
    const ok = r.status === 400;
    results.push(makeResult("edge-empty-body", "edge", "POST equipment with empty body → 400",
      ok ? "pass" : "warn", r.ms, "400", `${r.status}`,
      !ok ? "Server accepted empty equipment body" : undefined));
    logAction(ok ? "success" : "warn", "edge", "Empty POST body", `got ${r.status}`, r.ms);
  }

  // 5. Very long field value (XSS / overflow check)
  {
    const longName = "A".repeat(5000);
    const r = await apiPost("/api/equipment", { name: longName, status: "ok" });
    const ok = r.status === 400 || r.status === 413 || r.status === 422;
    const body = r.body as Record<string, unknown>;
    const sanitized = body?.name && typeof body.name === "string" && body.name.length < longName.length;
    const finalStatus: TestStatus = ok || sanitized ? "pass" : "warn";
    results.push(makeResult("edge-long-field", "edge", "POST equipment with 5000-char name",
      finalStatus, r.ms, "400 or truncated", `${r.status} / sanitized: ${sanitized}`,
      finalStatus === "warn" ? "Extremely long input accepted without truncation" : undefined));
    if (ok && r.status !== 400) {
      await apiDelete(`/api/equipment/${(body as Record<string, unknown>)?.id as string}`).catch(() => {});
    }
    logAction(finalStatus === "warn" ? "warn" : "success", "edge", "Long field value", `got ${r.status}`, r.ms);
  }

  // 6. Double-scan same equipment (idempotency)
  if (testModeEnabled) {
    const create = await apiPost("/api/equipment", { name: `__TEST__dupe-${Date.now()}`, status: "ok" });
    const createdId = (create.body as Record<string, unknown>)?.id as string | undefined;
    if (createdId) {
      const r1 = await apiPost(`/api/equipment/${createdId}/scan`, { status: "ok", note: "first" });
      const r2 = await apiPost(`/api/equipment/${createdId}/scan`, { status: "ok", note: "second" });
      const ok = r1.status === 200 && r2.status === 200;
      results.push(makeResult("edge-dupe-scan", "edge", "Duplicate scan (idempotency, test mode)",
        ok ? "pass" : "fail", r1.ms + r2.ms, "both 200", `r1:${r1.status} r2:${r2.status}`));
      await apiDelete(`/api/equipment/${createdId}`).catch(() => {});
      logAction(ok ? "success" : "error", "edge", "Duplicate scan", `r1:${r1.status} r2:${r2.status}`, r1.ms + r2.ms);
    }
  } else {
    results.push(makeResult("edge-dupe-scan", "edge", "Duplicate scan (skipped — enable testing mode)", "skip", 0));
  }

  return results;
}

export async function runAllTests(): Promise<TestRunReport> {
  if (isRunning) throw new Error("Test run already in progress");
  isRunning = true;
  const runId = `run-${Date.now()}`;
  currentReport = {
    runId,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "running",
    results: [],
    summary: { total: 0, passed: 0, failed: 0, warned: 0, skipped: 0, avgLatencyMs: 0, maxLatencyMs: 0 },
  };

  logAction("info", "runner", "Test suite started", `runId: ${runId}`);

  try {
    const [functional, stress, edge] = await Promise.all([
      runFunctionalTests(),
      runStressTests(),
      runEdgeCaseTests(),
    ]);

    const allResults = [...functional, ...stress, ...edge];
    const passed = allResults.filter((r) => r.status === "pass").length;
    const failed = allResults.filter((r) => r.status === "fail").length;
    const warned = allResults.filter((r) => r.status === "warn").length;
    const skipped = allResults.filter((r) => r.status === "skip").length;
    const latencies = allResults.filter((r) => r.durationMs > 0).map((r) => r.durationMs);
    const avgLatencyMs = latencies.length
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;
    const maxLatencyMs = latencies.length ? Math.max(...latencies) : 0;

    currentReport = {
      runId,
      startedAt: currentReport.startedAt,
      finishedAt: new Date().toISOString(),
      status: "done",
      results: allResults,
      summary: { total: allResults.length, passed, failed, warned, skipped, avgLatencyMs, maxLatencyMs },
    };

    logAction(
      failed > 0 ? "error" : warned > 0 ? "warn" : "success",
      "runner",
      "Test suite completed",
      `${passed} passed, ${failed} failed, ${warned} warned`
    );
  } catch (err) {
    currentReport = {
      ...currentReport,
      finishedAt: new Date().toISOString(),
      status: "error",
    };
    logAction("error", "runner", "Test suite crashed", String(err));
  } finally {
    isRunning = false;
  }

  return currentReport;
}
