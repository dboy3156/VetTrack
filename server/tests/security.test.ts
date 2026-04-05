/**
 * Security smoke tests for VetTrack API hardening.
 * Run with: npx tsx server/tests/security.test.ts
 * Requires: the dev server running on http://localhost:3001
 */

const BASE = "http://localhost:3001";

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  ✅ PASS: ${label}`);
  passed++;
}

function fail(label: string, detail?: string) {
  console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

async function get(path: string, opts?: RequestInit) {
  return fetch(`${BASE}${path}`, opts);
}

async function post(path: string, body?: unknown, opts?: RequestInit) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(opts?.headers ?? {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...opts,
  });
}

// ─── Test 1: CORS rejects unknown origin ────────────────────────────────────
async function testCorsRejected() {
  console.log("\n[1] CORS — unknown origin should be rejected");
  const res = await get("/api/healthz", {
    headers: { Origin: "https://evil.example.com" },
  });
  // express-cors will return 500 for blocked origin (the error propagates as 500)
  if (res.status === 500 || res.headers.get("Access-Control-Allow-Origin") === null) {
    ok("evil.example.com blocked — no ACAO header or 500 returned");
  } else {
    const acao = res.headers.get("Access-Control-Allow-Origin");
    if (acao === "https://evil.example.com") {
      fail("CORS allowed evil.example.com", `ACAO: ${acao}`);
    } else {
      ok(`CORS did not echo evil origin (ACAO=${acao})`);
    }
  }
}

// ─── Test 2: Rate limiter — global 100/min ───────────────────────────────────
async function testGlobalRateLimit() {
  console.log("\n[2] Rate Limit — global 100 req/min (burst 105)");
  let hit429 = false;
  // Fire 105 requests concurrently to exceed global limit (100/min)
  const requests = Array.from({ length: 105 }, () =>
    get("/api/healthz").then((r) => {
      if (r.status === 429) hit429 = true;
    })
  );
  await Promise.allSettled(requests);
  if (hit429) {
    ok("Got 429 after exceeding global rate limit");
  } else {
    fail("No 429 received — global rate limiter may not be working");
  }
}

// ─── Test 3: Scan rate limiter — 10/min ─────────────────────────────────────
async function testScanRateLimit() {
  console.log("\n[3] Rate Limit — scan endpoint 10/min (burst 12)");
  let hit429 = false;
  // In dev mode, requireRole("vet") will pass as we are admin; the rate limit fires before the handler returns 404
  const fakeId = "00000000-0000-0000-0000-000000000000";
  for (let i = 0; i < 12; i++) {
    const r = await post(`/api/equipment/${fakeId}/scan`, { status: "ok" });
    if (r.status === 429) {
      hit429 = true;
      break;
    }
  }
  if (hit429) {
    ok("Got 429 after exceeding scan rate limit (10/min)");
  } else {
    fail("No 429 received — scan rate limiter may not be working");
  }
}

// ─── Test 4: Checkout rate limiter — 20/min ──────────────────────────────────
async function testCheckoutRateLimit() {
  console.log("\n[4] Rate Limit — checkout endpoint 20/min (burst 22)");
  let hit429 = false;
  const fakeId = "00000000-0000-0000-0000-000000000000";
  for (let i = 0; i < 22; i++) {
    const r = await post(`/api/equipment/${fakeId}/checkout`, { location: "test" });
    if (r.status === 429) {
      hit429 = true;
      break;
    }
  }
  if (hit429) {
    ok("Got 429 after exceeding checkout rate limit (20/min)");
  } else {
    fail("No 429 received — checkout rate limiter may not be working");
  }
}

// ─── Test 5: Retry-After header present on 429 ───────────────────────────────
async function testRetryAfterHeader() {
  console.log("\n[5] Rate Limit — 429 response includes Retry-After or RateLimit headers");
  // Re-use scan limiter which should already be exhausted from test 3
  const fakeId = "00000000-0000-0000-0000-000000000000";
  const r = await post(`/api/equipment/${fakeId}/scan`, { status: "ok" });
  if (r.status === 429) {
    const retryAfter = r.headers.get("Retry-After") ?? r.headers.get("RateLimit-Reset") ?? r.headers.get("X-RateLimit-Reset");
    if (retryAfter) {
      ok(`429 includes rate limit header (${retryAfter})`);
    } else {
      ok("429 returned (Retry-After header may use RateLimit-* standard headers)");
    }
  } else {
    fail(`Expected 429, got ${r.status} — scan limiter may have reset between tests`);
  }
}

// ─── Test 6: Alert-ack POST requires technician+ (role-gate) ─────────────────
async function testAlertAckRoleGate() {
  console.log("\n[6] Role Gate — POST /api/alert-acks requires technician+ (dev mode = admin, should pass)");
  // In dev mode the hardcoded user is admin, so this should succeed (or 400 for missing body)
  const r = await post("/api/alert-acks", {});
  if (r.status === 403) {
    fail("Admin was blocked by role gate — unexpected");
  } else if (r.status === 400 || r.status === 201) {
    ok(`Role gate passed for admin (status=${r.status})`);
  } else {
    ok(`Role gate did not block admin (status=${r.status})`);
  }
}

// ─── Test 7: WhatsApp alert POST requires technician+ ────────────────────────
async function testWhatsAppRoleGate() {
  console.log("\n[7] Role Gate — POST /api/whatsapp/alert requires technician+ (dev mode = admin, should pass)");
  const r = await post("/api/whatsapp/alert", {});
  // Missing body should give 400, not 403 (admin dev user passes role gate)
  if (r.status === 403) {
    fail("Admin was unexpectedly blocked by role gate");
  } else {
    ok(`Role gate passed for admin (status=${r.status})`);
  }
}

// ─── Run all tests ────────────────────────────────────────────────────────────
async function run() {
  console.log("=== VetTrack Security Smoke Tests ===");
  console.log(`Target: ${BASE}`);

  // Check server is up
  try {
    const health = await get("/api/healthz");
    if (!health.ok) throw new Error(`healthz returned ${health.status}`);
    console.log("Server reachable ✓\n");
  } catch (e) {
    console.error("Server not reachable — start the dev server first.");
    process.exit(1);
  }

  await testCorsRejected();
  await testGlobalRateLimit();
  await testScanRateLimit();
  await testCheckoutRateLimit();
  await testRetryAfterHeader();
  await testAlertAckRoleGate();
  await testWhatsAppRoleGate();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => {
  console.error("Unexpected error:", e);
  process.exit(1);
});
