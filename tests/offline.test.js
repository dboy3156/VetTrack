import { describe, it, expect } from "vitest";

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

describe("Scenario 1: Offline Update Syncs Without Conflict", () => {
  const s1 = new ServerState();
  const q1 = new OfflineQueue("user-A");
  s1.seed({ id: "eq-1", status: "ok", location: "Room A", version: 1 });

  const snap1 = s1.get("eq-1");
  q1.enqueue({ id: "eq-1", patch: { version: snap1.version, location: "Room B" } });

  it("1 op in queue", () => {
    expect(q1.size).toBe(1);
  });

  it("Queue empty after drain", () => {
    const ops1 = q1.drain();
    expect(q1.size).toBe(0);

    const sync1 = syncQueue(ops1, s1);
    const final1 = s1.get("eq-1");

    expect(sync1.applied).toBe(1);
    expect(sync1.conflicts).toBe(0);
    expect(final1.location).toBe("Room B");
    expect(final1.version).toBe(2);
  });
});

describe("Scenario 2: Conflicting Updates — Server Wins", () => {
  it("Server value preserved on conflict with server-wins strategy", () => {
    const s2 = new ServerState();
    const q2 = new OfflineQueue("user-A");
    s2.seed({ id: "eq-2", status: "ok", location: "Lab 1", version: 1 });

    const snap2 = s2.get("eq-2");
    q2.enqueue({ id: "eq-2", patch: { version: snap2.version, location: "Lab 2 (offline)" } });

    s2.apply("eq-2", { version: 1, location: "Lab 3 (online)" });

    const sync2 = syncQueue(q2.drain(), s2, "server-wins");
    const final2 = s2.get("eq-2");

    expect(sync2.conflicts).toBe(1);
    expect(sync2.applied).toBe(0);
    expect(sync2.skipped.length).toBe(1);
    expect(final2.location).toBe("Lab 3 (online)");
    expect(final2.version).toBe(2);
  });
});

describe("Scenario 3: Conflicting Updates — Last Write Wins", () => {
  it("Offline value wins and version advances under last-write-wins strategy", () => {
    const s3 = new ServerState();
    const q3 = new OfflineQueue("user-A");
    s3.seed({ id: "eq-3", status: "ok", location: "Bay 1", version: 1 });

    const snap3 = s3.get("eq-3");
    q3.enqueue({ id: "eq-3", patch: { version: snap3.version, location: "Bay 2 (offline)" } });

    s3.apply("eq-3", { version: 1, location: "Bay 3 (online)" });

    const sync3 = syncQueue(q3.drain(), s3, "last-write-wins");
    const final3 = s3.get("eq-3");

    expect(sync3.conflicts).toBe(1);
    expect(sync3.applied).toBe(1);
    expect(final3.location).toBe("Bay 2 (offline)");
    expect(final3.version).toBe(3);
  });
});

describe("Scenario 4: Ordered Multi-Operation Offline Queue", () => {
  it("Both ops applied in order with correct final state", () => {
    const s4 = new ServerState();
    const q4 = new OfflineQueue("user-A");
    s4.seed({ id: "eq-4", status: "ok", location: "Start", checkedOutById: null, version: 1 });

    const snap4 = s4.get("eq-4");
    q4.enqueue({ id: "eq-4", patch: { version: snap4.version, checkedOutById: "user-A" } });
    q4.enqueue({ id: "eq-4", patch: { version: snap4.version + 1, location: "OR-3" } });

    expect(q4.size).toBe(2);

    const sync4 = syncQueue(q4.drain(), s4);
    const final4 = s4.get("eq-4");

    expect(sync4.applied).toBe(2);
    expect(sync4.conflicts).toBe(0);
    expect(final4.checkedOutById).toBe("user-A");
    expect(final4.location).toBe("OR-3");
    expect(final4.version).toBe(3);
  });
});

describe("Scenario 5: Two Users Offline, Non-Overlapping Fields", () => {
  it("Both users sync with correct final merged state", () => {
    const s5 = new ServerState();
    const qA = new OfflineQueue("user-A");
    const qB = new OfflineQueue("user-B");
    s5.seed({ id: "eq-5", status: "ok", location: "Bay 1", notes: "", version: 1 });

    const snap5 = s5.get("eq-5");
    qA.enqueue({ id: "eq-5", patch: { version: snap5.version, location: "Bay 2" } });
    qB.enqueue({ id: "eq-5", patch: { version: snap5.version, notes: "Calibrated 2025" } });

    const syncA = syncQueue(qA.drain(), s5);
    expect(syncA.applied).toBe(1);
    expect(s5.get("eq-5").version).toBe(2);

    const syncB = syncQueue(qB.drain(), s5, "last-write-wins");
    expect(syncB.conflicts).toBe(1);
    expect(syncB.applied).toBe(1);

    const final5 = s5.get("eq-5");
    expect(final5.location).toBe("Bay 2");
    expect(final5.notes).toBe("Calibrated 2025");
    expect(final5.version).toBe(3);
  });
});
