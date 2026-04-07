"use strict";

// ── Hard assertions — throw immediately on failure ─────────────────
function assert(condition, label) {
  if (!condition) {
    throw new Error(`ASSERTION FAILED: ${label}`);
  }
  console.log(`  ✅ ${label}`);
}

function assertThrows(fn, expectedFragment, label) {
  let threw = false;
  let caughtMessage = "";
  try {
    fn();
  } catch (e) {
    threw = true;
    caughtMessage = e.message;
  }
  if (!threw) {
    throw new Error(`ASSERTION FAILED: ${label} — expected throw, got none`);
  }
  if (expectedFragment && !caughtMessage.includes(expectedFragment)) {
    throw new Error(
      `ASSERTION FAILED: ${label} — threw but message "${caughtMessage}" ` +
      `does not contain "${expectedFragment}"`
    );
  }
  console.log(`  ✅ ${label}`);
}

function section(name) {
  console.log(`\n── ${name}`);
}

// ── 1. SERVER LOGIC ───────────────────────────────────────────────
//
// If incoming.version !== current.version → THROW immediately
// Otherwise apply update and increment version

function updateEquipment(current, incoming) {
  if (incoming.version !== current.version) {
    throw new Error(
      `VERSION_MISMATCH: server is at v${current.version}, ` +
      `incoming update carries v${incoming.version}. Update rejected.`
    );
  }
  return {
    ...current,
    ...incoming,
    version: current.version + 1,
  };
}

// ── 2. CLIENT LOGIC ───────────────────────────────────────────────

class OfflineQueue {
  constructor() {
    this.items = [];
  }
  enqueue(op) {
    if (!op || op.version === undefined) {
      throw new Error("Op must carry the version at time of local snapshot");
    }
    this.items.push({ ...op, enqueuedAt: Date.now() });
  }
  drain() {
    const ops = [...this.items];
    this.items = [];
    return ops;
  }
  get size() {
    return this.items.length;
  }
}

class Client {
  constructor(name, initialState) {
    this.name = name;
    this.localState = { ...initialState };
    this.queue = new OfflineQueue();
    this.online = true;
    this.conflictLog = [];
  }

  goOffline() {
    this.online = false;
    console.log(`  [${this.name}] Gone offline.`);
  }

  goOnline() {
    this.online = true;
    console.log(`  [${this.name}] Back online.`);
  }

  // Optimistic local update — queues op when offline
  localUpdate(patch) {
    const snapshotVersion = this.localState.version;
    this.localState = { ...this.localState, ...patch };
    if (!this.online) {
      this.queue.enqueue({ patch, version: snapshotVersion });
      console.log(
        `  [${this.name}] Offline op queued: ` +
        `${JSON.stringify(patch)} (snapshot v${snapshotVersion})`
      );
    }
  }

  // Replay queue against server on reconnect
  // Returns array of { status, reason?, trueServerState? }
  sync(server) {
    if (!this.online) {
      throw new Error(`[${this.name}] Cannot sync while offline`);
    }

    const ops = this.queue.drain();
    const results = [];

    for (const op of ops) {
      try {
        const newState = server.applyUpdate({ ...op.patch, version: op.version });
        this.localState = { ...newState };
        console.log(
          `  [${this.name}] Sync OK — server at v${newState.version}`
        );
        results.push({ status: "applied", serverState: newState });
      } catch (e) {
        // Rejection: rollback, fetch truth, log
        const trueState = server.getState();
        const staleState = { ...this.localState };
        this.localState = { ...trueState }; // rollback

        const entry = {
          status: "rejected",
          reason: e.message,
          staleLocalState: staleState,
          trueServerState: trueState,
        };
        this.conflictLog.push(entry);

        console.log(`  [${this.name}] Sync REJECTED: ${e.message}`);
        console.log(
          `  [${this.name}] Rolled back → ` +
          `status=${trueState.status}, v${trueState.version}`
        );

        results.push(entry);
      }
    }

    return results;
  }
}

class Server {
  constructor(initialState) {
    this.state = { ...initialState };
  }
  applyUpdate(incoming) {
    this.state = updateEquipment(this.state, incoming);
    return { ...this.state };
  }
  getState() {
    return { ...this.state };
  }
}

// ═══════════════════════════════════════════════════════════════════
// UNIT TESTS: updateEquipment
// ═══════════════════════════════════════════════════════════════════

section("Unit: updateEquipment — version enforcement");

const base = { id: "eq-1", status: "AVAILABLE", version: 1 };

// Valid update
const afterValid = updateEquipment(base, { version: 1, status: "IN_USE" });
assert(afterValid.status === "IN_USE",  "Valid update: status becomes IN_USE");
assert(afterValid.version === 2,        "Valid update: version increments to 2");
assert(base.version === 1,              "Original state is not mutated");

// Stale version must throw
assertThrows(
  () => updateEquipment(afterValid, { version: 1, status: "AVAILABLE" }),
  "VERSION_MISMATCH",
  "Stale version (v1 vs server v2) throws VERSION_MISMATCH"
);

// Future version must throw
assertThrows(
  () => updateEquipment(afterValid, { version: 99, status: "AVAILABLE" }),
  "VERSION_MISMATCH",
  "Future version (v99 vs server v2) throws VERSION_MISMATCH"
);

// Zero version must throw
assertThrows(
  () => updateEquipment(afterValid, { version: 0, status: "AVAILABLE" }),
  "VERSION_MISMATCH",
  "Zero version (v0 vs server v2) throws VERSION_MISMATCH"
);

// ═══════════════════════════════════════════════════════════════════
// INTEGRATION SCENARIO
// ═══════════════════════════════════════════════════════════════════

section("Scenario: Technician A (offline) vs Technician B (online)");

console.log("\n  Initial: { status: AVAILABLE, version: 1 }");

const INITIAL = { id: "eq-1", status: "AVAILABLE", version: 1 };
const server  = new Server(INITIAL);
const clientA = new Client("Technician A", INITIAL);
const clientB = new Client("Technician B", INITIAL);

// ── Step 1: A goes offline ─────────────────────────────────────────
clientA.goOffline();

// ── Step 2: B updates online ───────────────────────────────────────
console.log("\n  [Technician B] Online: AVAILABLE → IN_USE");
const afterB = server.applyUpdate({ version: 1, status: "IN_USE" });
clientB.localState = { ...afterB };

assert(afterB.status === "IN_USE", "B: server accepted — status = IN_USE");
assert(afterB.version === 2,       "B: server version incremented to 2");

// ── Step 3: A updates locally while offline ────────────────────────
console.log("\n  [Technician A] Offline local update: AVAILABLE → IN_USE");
clientA.localUpdate({ status: "IN_USE" });

assert(clientA.queue.size === 1,              "A: 1 op in offline queue");
assert(clientA.queue.items[0].version === 1,  "A: queued op carries snapshot version 1");

// ── Step 4: A reconnects and syncs ────────────────────────────────
console.log("\n  [Technician A] Reconnecting...");
clientA.goOnline();
const syncResults = clientA.sync(server);

// ═══════════════════════════════════════════════════════════════════
// MANDATORY ASSERTIONS
// ═══════════════════════════════════════════════════════════════════

section("Mandatory assertions");

// 1. Server rejected A's stale update
assert(syncResults.length === 1,              "Sync produced exactly 1 result");
assert(syncResults[0].status === "rejected",  "Server REJECTED A's stale update");

// 2. Error/reason is explicitly present (not silent)
assert(
  typeof syncResults[0].reason === "string" && syncResults[0].reason.length > 0,
  "Rejection carries a non-empty reason (not silent)"
);
assert(
  syncResults[0].reason.includes("VERSION_MISMATCH"),
  "Rejection reason identifies VERSION_MISMATCH"
);

// 3. Rollback occurred — client A's local state must reflect server truth
assert(
  clientA.localState.status === "IN_USE",
  "Rollback: client A local status = IN_USE (server truth)"
);
assert(
  clientA.localState.version === 2,
  "Rollback: client A local version = 2 (server truth)"
);

// 4. Final server state is correct
const finalServer = server.getState();
assert(finalServer.status === "IN_USE", "Final server status = IN_USE");
assert(finalServer.version === 2,       "Final server version = 2");

// 5. No overwrite — version must NOT have advanced beyond 2
assert(
  finalServer.version !== 3,
  "No overwrite: server version is NOT 3 (A did not overwrite B)"
);

// 6. Conflict was logged
assert(clientA.conflictLog.length === 1,                    "A's conflict log has 1 entry");
assert(clientA.conflictLog[0].trueServerState.version === 2, "Conflict log records server v2");
assert(
  clientA.conflictLog[0].trueServerState.status === "IN_USE",
  "Conflict log records server status = IN_USE"
);

// 7. Queue is drained — nothing pending
assert(clientA.queue.size === 0, "A's offline queue is empty after sync");

// 8. All clients consistent with server
assert(
  clientA.localState.version === finalServer.version,
  "Client A and server are consistent"
);
assert(
  clientB.localState.version === finalServer.version,
  "Client B and server are consistent"
);

// ═══════════════════════════════════════════════════════════════════
// OVERWRITE DETECTION — explicit overwrite test
// If updateEquipment allowed stale writes, this block would NOT throw
// ═══════════════════════════════════════════════════════════════════

section("Overwrite detection: system must make overwrite impossible");

// Simulate what would happen if A's stale op were applied directly —
// the server function MUST throw; if it does not, the test fails.
let overwroteServer = false;
try {
  updateEquipment(
    { id: "eq-1", status: "IN_USE", version: 2 },
    { version: 1, status: "IN_USE" } // stale op from A
  );
  overwroteServer = true; // should never reach here
} catch (e) {
  // expected
}

if (overwroteServer) {
  throw new Error(
    "CRITICAL: updateEquipment accepted a stale version — overwrite is possible. " +
    "System has a correctness bug."
  );
}
console.log("  ✅ Overwrite correctly prevented at the server logic level");

// ═══════════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════════

console.log(`\n${"─".repeat(56)}`);
console.log("✅ conflict.test.js PASSED — all hard assertions satisfied");
console.log('   Proven: "Stale offline updates can NEVER override newer server state"');
