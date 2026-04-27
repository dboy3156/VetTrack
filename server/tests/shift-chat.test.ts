const BASE = "http://localhost:3001";

let passed = 0;
let failed = 0;

function ok(label: string) { console.log(`  ✅ PASS: ${label}`); passed++; }
function fail(label: string, detail?: string) { console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`); failed++; }

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

async function testGetMessagesRequiresAuth() {
  console.log("\n[Test] GET /api/shift-chat/messages — requires auth");
  const res = await get("/api/shift-chat/messages");
  if (res.status === 401) {
    ok("Unauthenticated request returns 401");
  } else {
    fail(`Expected 401, got ${res.status}`);
  }
}

async function testGetMessagesStudentDenied() {
  console.log("\n[Test] GET /api/shift-chat/messages — student gets 403");
  const res = await get("/api/shift-chat/messages", {
    headers: { "x-dev-role-override": "student" },
  });
  if (res.status === 403) {
    ok("Student correctly denied");
  } else {
    fail(`Expected 403, got ${res.status}`);
  }
}

async function testGetMessagesReturnsShape() {
  console.log("\n[Test] GET /api/shift-chat/messages — returns correct shape");
  const res = await get("/api/shift-chat/messages", {
    headers: { "x-dev-role-override": "technician" },
  });
  if (!res.ok) { fail(`Expected 200, got ${res.status}`); return; }
  const body = await res.json();
  if (
    Array.isArray(body.messages) &&
    ("pinnedMessage" in body) &&
    Array.isArray(body.typing) &&
    Array.isArray(body.onlineUserIds)
  ) {
    ok("Response has correct shape");
  } else {
    fail("Response missing required fields", JSON.stringify(body));
  }
}

async function run() {
  console.log("=== Shift Chat Tests ===");
  try {
    const health = await get("/api/health");
    if (!health.ok) throw new Error(`health ${health.status}`);
    console.log("Server reachable ✓\n");
  } catch {
    console.error("Server not reachable — start with: pnpm dev");
    process.exit(1);
  }

  await testGetMessagesRequiresAuth();
  await testGetMessagesStudentDenied();
  await testGetMessagesReturnsShape();

  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((e) => { console.error(e); process.exit(1); });
