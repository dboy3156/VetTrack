import { describe, it, expect } from "vitest";

// ── 1. Data integrity ─────────────────────────────────────────────

function validateEquipment(eq) {
  if (!eq || typeof eq !== "object") throw new Error("Invalid equipment object");
  if (!eq.id || typeof eq.id !== "string" || eq.id.trim() === "")
    throw new Error("Equipment must have a non-empty string id");
  if (!eq.name || typeof eq.name !== "string" || eq.name.trim() === "")
    throw new Error("Equipment must have a non-empty string name");
  const validStatuses = ["ok", "maintenance", "retired", "checked_out"];
  if (!validStatuses.includes(eq.status))
    throw new Error(`Status must be one of: ${validStatuses.join(", ")}`);
  return true;
}

describe("Data Integrity", () => {
  it("Valid equipment passes validation", () => {
    expect(validateEquipment({ id: "eq-1", name: "Scalpel", status: "ok" })).toBeTruthy();
  });

  it("Empty id throws with correct message", () => {
    expect(() => validateEquipment({ id: "", name: "Scalpel", status: "ok" })).toThrow("non-empty");
  });

  it("Invalid status throws with correct message", () => {
    expect(() => validateEquipment({ id: "eq-2", name: "Scalpel", status: "lost" })).toThrow("Status must be");
  });

  it("Empty name throws with correct message", () => {
    expect(() => validateEquipment({ id: "eq-3", name: "", status: "ok" })).toThrow("non-empty");
  });
});

// ── 2. Optimistic concurrency — version counter ───────────────────

function applyUpdate(record, update) {
  if (update.version !== record.version)
    throw new Error(
      `Version conflict: expected ${record.version}, got ${update.version}`
    );
  return { ...record, ...update, version: record.version + 1 };
}

describe("Optimistic Concurrency — Version Counter", () => {
  const base = { id: "eq-1", name: "Scalpel", status: "ok", version: 1 };
  const updated = applyUpdate(base, { version: 1, status: "maintenance" });

  it("Version increments on successful update", () => {
    expect(updated.version).toBe(2);
  });

  it("Status applied correctly", () => {
    expect(updated.status).toBe("maintenance");
  });

  it("Original record is not mutated", () => {
    expect(base.version).toBe(1);
  });

  it("Stale version throws version conflict", () => {
    expect(() => applyUpdate(base, { version: 99, status: "retired" })).toThrow("Version conflict");
  });

  it("Past version throws version conflict", () => {
    expect(() => applyUpdate(base, { version: 0, status: "retired" })).toThrow("Version conflict");
  });
});

// ── 3. Timestamp ordering ─────────────────────────────────────────

function sortByTimestamp(records) {
  return [...records].sort((a, b) => a.timestamp - b.timestamp);
}

describe("Timestamp Ordering", () => {
  const records = [
    { id: "c", timestamp: 300 },
    { id: "a", timestamp: 100 },
    { id: "b", timestamp: 200 },
  ];
  const sorted = sortByTimestamp(records);

  it("Records sort by timestamp ascending", () => {
    expect(sorted[0].id === "a" && sorted[1].id === "b" && sorted[2].id === "c").toBeTruthy();
  });

  it("Original array is not mutated by sort", () => {
    expect(records[0].id).toBe("c");
  });
});

// ── 4. Role-based access control ─────────────────────────────────

function canEdit(user, resource) {
  if (user.role === "admin") return true;
  if (user.role === "technician" && resource.checkedOutById === user.id) return true;
  return false;
}

describe("Role-Based Access Control", () => {
  it("Admin can edit any resource", () => {
    expect(canEdit({ role: "admin", id: "u-1" }, { checkedOutById: "u-2" })).toBeTruthy();
  });

  it("Technician can edit their own checked-out resource", () => {
    expect(canEdit({ role: "technician", id: "u-2" }, { checkedOutById: "u-2" })).toBeTruthy();
  });

  it("Technician cannot edit another user's resource", () => {
    expect(!canEdit({ role: "technician", id: "u-3" }, { checkedOutById: "u-2" })).toBeTruthy();
  });

  it("Technician cannot edit unchecked resource", () => {
    expect(!canEdit({ role: "technician", id: "u-1" }, { checkedOutById: null })).toBeTruthy();
  });
});

// ── 5. Sync queue integrity ───────────────────────────────────────

class SyncQueue {
  constructor() { this.items = []; }
  enqueue(op) {
    if (!op.id || !op.type) throw new Error("Op must have id and type");
    this.items.push({ ...op, enqueuedAt: Date.now() });
  }
  drain() {
    const ops = [...this.items];
    this.items = [];
    return ops;
  }
  get size() { return this.items.length; }
}

describe("Sync Queue Integrity", () => {
  it("Queue holds 2 items", () => {
    const q = new SyncQueue();
    q.enqueue({ id: "eq-1", type: "CHECKOUT", payload: { userId: "u-1" } });
    q.enqueue({ id: "eq-1", type: "MOVE", payload: { location: "OR-2" } });
    expect(q.size).toBe(2);
  });

  it("Drain returns all items", () => {
    const q = new SyncQueue();
    q.enqueue({ id: "eq-1", type: "CHECKOUT", payload: { userId: "u-1" } });
    q.enqueue({ id: "eq-1", type: "MOVE", payload: { location: "OR-2" } });
    const drained = q.drain();
    expect(drained.length).toBe(2);
  });

  it("Queue is empty after drain", () => {
    const q = new SyncQueue();
    q.enqueue({ id: "eq-1", type: "CHECKOUT", payload: { userId: "u-1" } });
    q.drain();
    expect(q.size).toBe(0);
  });

  it("First op is CHECKOUT", () => {
    const q = new SyncQueue();
    q.enqueue({ id: "eq-1", type: "CHECKOUT", payload: { userId: "u-1" } });
    q.enqueue({ id: "eq-1", type: "MOVE", payload: { location: "OR-2" } });
    const drained = q.drain();
    expect(drained[0].type).toBe("CHECKOUT");
  });

  it("Second op is MOVE", () => {
    const q = new SyncQueue();
    q.enqueue({ id: "eq-1", type: "CHECKOUT", payload: { userId: "u-1" } });
    q.enqueue({ id: "eq-1", type: "MOVE", payload: { location: "OR-2" } });
    const drained = q.drain();
    expect(drained[1].type).toBe("MOVE");
  });

  it("Op without type throws", () => {
    const q = new SyncQueue();
    expect(() => q.enqueue({ id: "eq-1" })).toThrow("type");
  });
});
