"use strict";

// ── Assertions ───────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (!condition) {
    console.error(`  ❌ FAIL: ${label}`);
    failed++;
  } else {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  }
}

function assertThrows(fn, expectedFragment, label) {
  try {
    fn();
    console.error(`  ❌ FAIL: ${label} — expected throw, but did not throw`);
    failed++;
  } catch (e) {
    if (expectedFragment && !e.message.includes(expectedFragment)) {
      console.error(
        `  ❌ FAIL: ${label} — threw but message "${e.message}" missing "${expectedFragment}"`
      );
      failed++;
    } else {
      console.log(`  ✅ PASS: ${label}`);
      passed++;
    }
  }
}

function section(name) {
  console.log(`\n── ${name}`);
}

// ── 1. SERVER LOGIC ───────────────────────────────────────────────
//
// updateEquipment(currentState, incomingUpdate)
// Rules:
//   - If incoming.version !== current.version → throw
//   - Otherwise apply update and increment version

function updateEquipment(currentState, incomingUpdate) {
  if (incomingUpdate.version !== currentState.version) {
    throw new Error(
      `Version mismatch: server is at v${currentState.version}, ` +
      `incoming update carries v${incomingUpdate.version}. Update rejected.`
    );
  }
  return {
    ...currentState,
    ...incomingUpdate,
    version: currentState.version + 1,
  };
}

// ── 2. CLIENT LOGIC ───────────────────────────────────────────────

class Client {
  constructor(name, initialState) {
    this.name = name;
    this.localState = { ...initialState };
    this.offlineQueue = [];
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

  // Perform a local update (always succeeds locally)
  localUpdate(patch) {
    const prev = { ...this.localState };
    this.localState = {
      ...this.localState,
      ...patch,
      // Keep the version at snapshot time; the server will validate it
    };

    if (!this.online) {
      this.offlineQueue.push({
        patch,
        version: prev.version, // version at time of local change
        enqueuedAt: Date.now(),
      });
      console.log(
        `  [${this.name}] Offline update queued: ${JSON.stringify(patch)} ` +
        `(based on v${prev.version})`
      );
    }

    return this.localState;
  }

  // Sync pending offline queue to server
  // Returns array of sync results
  sync(server) {
    if (!this.online) throw new Error("Cannot sync while offline");
    const ops = [...this.offlineQueue];
    this.offlineQueue = [];

    const results = [];

    for (const op of ops) {
      try {
        const newServerState = server.applyUpdate({
          ...op.patch,
          version: op.version,
        });

        // Success: align local state with server
        this.localState = { ...newServerState };
        console.log(
          `  [${this.name}] Sync succeeded: server now at v${newServerState.version}`
        );
        results.push({ status: "applied", serverState: newServerState });
      } catch (e) {
        // Rejection: rollback and fetch true server state
        const trueState = server.getState();
        const rolledBackFrom = { ...this.localState };
        this.localState = { ...trueState };

        const conflict = {
          status: "rejected",
          reason: e.message,
          rolledBackFrom,
          trueServerState: trueState,
        };
        this.conflictLog.push(conflict);

        console.log(`  [${this.name}] Sync REJECTED: ${e.message}`);
        console.log(
          `  [${this.name}] Rollback: local state restored to server truth ` +
          `(status=${trueState.status}, v${trueState.version})`
        );

        results.push(conflict);
      }
    }

    return results;
  }
}

// Simulated server
class Server {
  constructor(initialState) {
    this.state = { ...initialState };
  }

  applyUpdate(incomingUpdate) {
    this.state = updateEquipment(this.state, incomingUpdate);
    return { ...this.state };
  }

  getState() {
    return { ...this.state };
  }
}

// ── TESTS ─────────────────────────────────────────────────────────

section("Unit: updateEquipment — version enforcement");

const s0 = { id: "eq-1", status: "AVAILABLE", version: 1 };

// Correct version → accept
const s1 = updateEquipment(s0, { version: 1, status: "IN_USE" });
assert(s1.status === "IN_USE", "Correct version: status updated to IN_USE");
assert(s1.version === 2, "Correct version: version incremented to 2");
assert(s0.version === 1, "Original state not mutated");

// Stale version → reject
assertThrows(
  () => updateEquipment(s1, { version: 1, status: "IN_USE" }),
  "Version mismatch",
  "Stale version (v1 against server v2) throws version mismatch"
);

// Future version → reject
assertThrows(
  () => updateEquipment(s1, { version: 99, status: "AVAILABLE" }),
  "Version mismatch",
  "Future version (v99 against server v2) throws version mismatch"
);

// ── MAIN SCENARIO ─────────────────────────────────────────────────
section("Scenario: Technician A offline vs Technician B online");

console.log("\n  Initial state: status=AVAILABLE, version=1");

const INITIAL = { id: "eq-1", status: "AVAILABLE", version: 1 };
const server = new Server(INITIAL);
const clientA = new Client("Technician A", INITIAL);
const clientB = new Client("Technician B", INITIAL);

// Step 1: A goes offline
clientA.goOffline();

// Step 2: B performs online update (AVAILABLE → IN_USE)
console.log('\n  [Technician B] Online update: AVAILABLE → IN_USE');
const serverAfterB = server.applyUpdate({ version: 1, status: "IN_USE" });
clientB.localState = { ...serverAfterB };

assert(
  serverAfterB.status === "IN_USE",
  "Server: B's update accepted — status = IN_USE"
);
assert(
  serverAfterB.version === 2,
  "Server: version incremented to 2 after B's update"
);

// Step 3: A (still offline) performs the same update locally
console.log('\n  [Technician A] Local (offline) update: AVAILABLE → IN_USE');
clientA.localUpdate({ status: "IN_USE" });

assert(
  clientA.offlineQueue.length === 1,
  "Client A: 1 op in offline queue"
);
assert(
  clientA.offlineQueue[0].version === 1,
  "Client A: queued op carries version 1 (snapshot version)"
);

// Step 4: A reconnects and attempts to sync
console.log('\n  [Technician A] Reconnecting and syncing...');
clientA.goOnline();
const syncResults = clientA.sync(server);

// ── CRITICAL ASSERTIONS ───────────────────────────────────────────
section("Critical: Server must reject A's stale update");

assert(
  syncResults.length === 1,
  "Sync produced exactly 1 result"
);

const result = syncResults[0];

assert(
  result.status === "rejected",
  "Server REJECTED A's stale update (version mismatch)"
);

assert(
  result.reason.includes("Version mismatch"),
  "Rejection reason explains version mismatch"
);

assert(
  clientA.conflictLog.length === 1,
  "Client A logged 1 conflict"
);

// No overwrite: server still holds B's state
const finalServer = server.getState();
assert(
  finalServer.status === "IN_USE",
  "Server final status = IN_USE (B's update preserved, not overwritten)"
);
assert(
  finalServer.version === 2,
  "Server final version = 2 (unchanged after rejection)"
);

// Rollback: A's local state now reflects true server state
assert(
  clientA.localState.status === "IN_USE",
  "Client A local status rolled back to server truth (IN_USE)"
);
assert(
  clientA.localState.version === 2,
  "Client A local version rolled back to 2"
);

// Queue drained
assert(
  clientA.offlineQueue.length === 0,
  "Client A offline queue is empty after sync"
);

// ── INVALID OUTCOME GUARD ─────────────────────────────────────────
section("Guard: Invalid outcomes must not exist");

// The server must not have accepted A's update (which would push version to 3)
assert(
  finalServer.version !== 3,
  "Server version is NOT 3 (A's overwrite did not happen)"
);

// The system must not be in a split state
assert(
  clientA.localState.version === finalServer.version,
  "Client A and server are in sync (no inconsistency)"
);

assert(
  clientB.localState.version === finalServer.version,
  "Client B and server are in sync"
);

// ── CONFLICT LOG DETAIL ───────────────────────────────────────────
section("Conflict log content");

const conflictEntry = clientA.conflictLog[0];
assert(
  conflictEntry.trueServerState.status === "IN_USE",
  "Conflict log records true server status = IN_USE"
);
assert(
  conflictEntry.trueServerState.version === 2,
  "Conflict log records true server version = 2"
);
assert(
  typeof conflictEntry.reason === "string" && conflictEntry.reason.length > 0,
  "Conflict log contains a non-empty reason string"
);

console.log(`\n  Conflict explanation: "${conflictEntry.reason}"`);

// ── Summary ───────────────────────────────────────────────────────
console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ conflict.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ conflict.test.js PASSED");
console.log('   Proven: "Stale offline updates can NEVER override newer server state"');
