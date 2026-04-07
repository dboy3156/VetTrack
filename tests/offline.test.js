"use strict";

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

function section(name) {
  console.log(`\n── ${name}`);
}

// ── Infrastructure ────────────────────────────────────────────────

class ServerState {
  constructor() {
    this.records = new Map();
  }
  seed(record) {
    this.records.set(record.id, { ...record });
  }
  get(id) {
    const r = this.records.get(id);
    return r ? { ...r } : null;
  }
  apply(id, patch) {
    const current = this.records.get(id);
    if (!current) throw new Error(`Record not found: ${id}`);
    if (patch.version !== current.version)
      throw new Error(
        `Conflict on ${id}: server@${current.version} vs patch@${patch.version}`
      );
    const next = { ...current, ...patch, version: current.version + 1 };
    this.records.set(id, next);
    return { ...next };
  }
  // Force-apply without version check (last-write-wins rebase)
  forceApply(id, patch) {
    const current = this.records.get(id);
    if (!current) throw new Error(`Record not found: ${id}`);
    const next = { ...current, ...patch, version: current.version + 1 };
    this.records.set(id, next);
    return { ...next };
  }
}

class OfflineQueue {
  constructor(userId) {
    this.userId = userId;
    this.queue = [];
  }
  enqueue(op) {
    if (!op.id || !op.patch) throw new Error("Op must have id and patch");
    this.queue.push({ ...op, userId: this.userId, enqueuedAt: Date.now() });
  }
  drain() {
    const ops = [...this.queue];
    this.queue = [];
    return ops;
  }
  get size() {
    return this.queue.length;
  }
}

// Sync engine: apply drained queue onto server state
function syncQueue(ops, server, strategy = "server-wins") {
  const result = { applied: 0, conflicts: 0, skipped: [] };
  for (const op of ops) {
    try {
      server.apply(op.id, op.patch);
      result.applied++;
    } catch (e) {
      if (e.message.includes("Conflict")) {
        result.conflicts++;
        if (strategy === "last-write-wins") {
          // Rebase the patch onto current server state
          const { version: _v, ...fields } = op.patch;
          server.forceApply(op.id, fields);
          result.applied++;
        } else {
          result.skipped.push({ op, reason: e.message });
        }
      } else {
        throw e; // unexpected error — surface it
      }
    }
  }
  return result;
}

async function runOfflineTests() {
  // ── Scenario 1: Clean offline → sync, no conflict ─────────────
  section("Scenario 1: Offline Update Syncs Without Conflict");

  const s1 = new ServerState();
  const q1 = new OfflineQueue("user-A");
  s1.seed({ id: "eq-1", status: "ok", location: "Room A", version: 1 });

  const snap1 = s1.get("eq-1");
  q1.enqueue({ id: "eq-1", patch: { version: snap1.version, location: "Room B" } });
  console.log("  [User A] Went offline. Queued: location → Room B");

  assert(q1.size === 1, "1 op in queue");

  const ops1 = q1.drain();
  assert(q1.size === 0, "Queue empty after drain");

  const sync1 = syncQueue(ops1, s1);
  const final1 = s1.get("eq-1");

  assert(sync1.applied === 1, `1 op applied, got ${sync1.applied}`);
  assert(sync1.conflicts === 0, "0 conflicts");
  assert(final1.location === "Room B", `Location = Room B, got ${final1.location}`);
  assert(final1.version === 2, `Version = 2, got ${final1.version}`);

  // ── Scenario 2: Conflict → server-wins ────────────────────────
  section("Scenario 2: Conflicting Updates — Server Wins");

  const s2 = new ServerState();
  const q2 = new OfflineQueue("user-A");
  s2.seed({ id: "eq-2", status: "ok", location: "Lab 1", version: 1 });

  const snap2 = s2.get("eq-2"); // User A snapshots @v1
  q2.enqueue({ id: "eq-2", patch: { version: snap2.version, location: "Lab 2 (offline)" } });
  console.log("  [User A] Offline snapshot @v1. Queued: location → Lab 2 (offline)");

  s2.apply("eq-2", { version: 1, location: "Lab 3 (online)" }); // User B @v1 → v2
  console.log("  [User B] Online: location → Lab 3 (online), now @v2");

  const sync2 = syncQueue(q2.drain(), s2, "server-wins");
  const final2 = s2.get("eq-2");

  assert(sync2.conflicts === 1, `1 conflict detected, got ${sync2.conflicts}`);
  assert(sync2.applied === 0, `0 ops applied (server wins), got ${sync2.applied}`);
  assert(sync2.skipped.length === 1, "Skipped list has 1 entry");
  assert(
    final2.location === "Lab 3 (online)",
    `Server value preserved, got ${final2.location}`
  );
  assert(final2.version === 2, `Version remains 2, got ${final2.version}`);

  // ── Scenario 3: Conflict → last-write-wins ────────────────────
  section("Scenario 3: Conflicting Updates — Last Write Wins");

  const s3 = new ServerState();
  const q3 = new OfflineQueue("user-A");
  s3.seed({ id: "eq-3", status: "ok", location: "Bay 1", version: 1 });

  const snap3 = s3.get("eq-3");
  q3.enqueue({ id: "eq-3", patch: { version: snap3.version, location: "Bay 2 (offline)" } });
  console.log("  [User A] Offline snapshot @v1. Queued: location → Bay 2 (offline)");

  s3.apply("eq-3", { version: 1, location: "Bay 3 (online)" });
  console.log("  [User B] Online: location → Bay 3 (online), now @v2");

  const sync3 = syncQueue(q3.drain(), s3, "last-write-wins");
  const final3 = s3.get("eq-3");

  assert(sync3.conflicts === 1, `1 conflict, got ${sync3.conflicts}`);
  assert(sync3.applied === 1, `1 op applied (rebased), got ${sync3.applied}`);
  assert(
    final3.location === "Bay 2 (offline)",
    `Offline value wins, got ${final3.location}`
  );
  assert(final3.version === 3, `Version advanced to 3 (1 + 2), got ${final3.version}`);

  // ── Scenario 4: Multi-op queue applied in order ───────────────
  section("Scenario 4: Ordered Multi-Operation Offline Queue");

  const s4 = new ServerState();
  const q4 = new OfflineQueue("user-A");
  s4.seed({ id: "eq-4", status: "ok", location: "Start", checkedOutById: null, version: 1 });

  const snap4 = s4.get("eq-4");
  // Op 1: check out
  q4.enqueue({ id: "eq-4", patch: { version: snap4.version, checkedOutById: "user-A" } });
  // Op 2: move — expects version after op 1
  q4.enqueue({ id: "eq-4", patch: { version: snap4.version + 1, location: "OR-3" } });
  console.log("  [User A] Queued 2 ops offline: checkout → move to OR-3");

  assert(q4.size === 2, "2 ops in queue");

  const sync4 = syncQueue(q4.drain(), s4);
  const final4 = s4.get("eq-4");

  assert(sync4.applied === 2, `Both ops applied, got ${sync4.applied}`);
  assert(sync4.conflicts === 0, "No conflicts");
  assert(final4.checkedOutById === "user-A", `Checkout applied, got ${final4.checkedOutById}`);
  assert(final4.location === "OR-3", `Location applied, got ${final4.location}`);
  assert(final4.version === 3, `Version = 3 (1 + 2), got ${final4.version}`);

  // ── Scenario 5: Two users offline simultaneously, both sync ───
  section("Scenario 5: Two Users Offline, Non-Overlapping Fields");

  const s5 = new ServerState();
  const qA = new OfflineQueue("user-A");
  const qB = new OfflineQueue("user-B");
  s5.seed({ id: "eq-5", status: "ok", location: "Bay 1", notes: "", version: 1 });

  const snap5 = s5.get("eq-5");
  // User A updates location
  qA.enqueue({ id: "eq-5", patch: { version: snap5.version, location: "Bay 2" } });
  // User B updates notes (different field — same version base)
  qB.enqueue({ id: "eq-5", patch: { version: snap5.version, notes: "Calibrated 2025" } });
  console.log("  [User A] Offline: location → Bay 2");
  console.log("  [User B] Offline: notes → 'Calibrated 2025'");

  // User A syncs first
  const syncA = syncQueue(qA.drain(), s5);
  assert(syncA.applied === 1, `User A: 1 op applied, got ${syncA.applied}`);
  assert(s5.get("eq-5").version === 2, "After User A sync, version = 2");

  // User B syncs — conflict on version (snap @v1, server now @v2)
  // Use last-write-wins to merge the note
  const syncB = syncQueue(qB.drain(), s5, "last-write-wins");
  assert(syncB.conflicts === 1, `User B: 1 conflict, got ${syncB.conflicts}`);
  assert(syncB.applied === 1, `User B: 1 op applied (rebased), got ${syncB.applied}`);

  const final5 = s5.get("eq-5");
  assert(final5.location === "Bay 2", `Location from A preserved, got ${final5.location}`);
  assert(final5.notes === "Calibrated 2025", `Notes from B applied, got ${final5.notes}`);
  assert(final5.version === 3, `Final version = 3, got ${final5.version}`);
}

runOfflineTests()
  .then(() => {
    console.log(`\n${"─".repeat(48)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.error(`\n❌ offline.test.js FAILED (${failed} assertion(s) failed)`);
      process.exit(1);
    }
    console.log("\n✅ offline.test.js PASSED");
  })
  .catch((err) => {
    console.error("\n💥 offline.test.js threw an unexpected error:", err.message);
    process.exit(1);
  });
