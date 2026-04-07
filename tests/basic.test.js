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

// ── 1. Data integrity ─────────────────────────────────────────────
section("Data Integrity");

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

try {
  assert(
    validateEquipment({ id: "eq-1", name: "Scalpel", status: "ok" }),
    "Valid equipment passes validation"
  );
} catch (e) {
  assert(false, `Valid equipment passes — threw: ${e.message}`);
}

try {
  validateEquipment({ id: "", name: "Scalpel", status: "ok" });
  assert(false, "Empty id should throw");
} catch (e) {
  assert(e.message.includes("non-empty"), "Empty id throws with correct message");
}

try {
  validateEquipment({ id: "eq-2", name: "Scalpel", status: "lost" });
  assert(false, "Invalid status should throw");
} catch (e) {
  assert(e.message.includes("Status must be"), "Invalid status throws with correct message");
}

try {
  validateEquipment({ id: "eq-3", name: "", status: "ok" });
  assert(false, "Empty name should throw");
} catch (e) {
  assert(e.message.includes("non-empty"), "Empty name throws with correct message");
}

// ── 2. Optimistic concurrency — version counter ───────────────────
section("Optimistic Concurrency — Version Counter");

function applyUpdate(record, update) {
  if (update.version !== record.version)
    throw new Error(
      `Version conflict: expected ${record.version}, got ${update.version}`
    );
  return { ...record, ...update, version: record.version + 1 };
}

const base = { id: "eq-1", name: "Scalpel", status: "ok", version: 1 };
const updated = applyUpdate(base, { version: 1, status: "maintenance" });
assert(updated.version === 2, "Version increments on successful update");
assert(updated.status === "maintenance", "Status applied correctly");
assert(base.version === 1, "Original record is not mutated");

try {
  applyUpdate(base, { version: 99, status: "retired" });
  assert(false, "Stale version should throw");
} catch (e) {
  assert(e.message.includes("Version conflict"), "Stale version throws version conflict");
}

try {
  applyUpdate(base, { version: 0, status: "retired" });
  assert(false, "Past version should throw");
} catch (e) {
  assert(e.message.includes("Version conflict"), "Past version throws version conflict");
}

// ── 3. Timestamp ordering ─────────────────────────────────────────
section("Timestamp Ordering");

function sortByTimestamp(records) {
  return [...records].sort((a, b) => a.timestamp - b.timestamp);
}

const records = [
  { id: "c", timestamp: 300 },
  { id: "a", timestamp: 100 },
  { id: "b", timestamp: 200 },
];
const sorted = sortByTimestamp(records);
assert(
  sorted[0].id === "a" && sorted[1].id === "b" && sorted[2].id === "c",
  "Records sort by timestamp ascending"
);
assert(records[0].id === "c", "Original array is not mutated by sort");

// ── 4. Role-based access control ─────────────────────────────────
section("Role-Based Access Control");

function canEdit(user, resource) {
  if (user.role === "admin") return true;
  if (user.role === "technician" && resource.checkedOutById === user.id) return true;
  return false;
}

assert(
  canEdit({ role: "admin", id: "u-1" }, { checkedOutById: "u-2" }),
  "Admin can edit any resource"
);
assert(
  canEdit({ role: "technician", id: "u-2" }, { checkedOutById: "u-2" }),
  "Technician can edit their own checked-out resource"
);
assert(
  !canEdit({ role: "technician", id: "u-3" }, { checkedOutById: "u-2" }),
  "Technician cannot edit another user's resource"
);
assert(
  !canEdit({ role: "technician", id: "u-1" }, { checkedOutById: null }),
  "Technician cannot edit unchecked resource"
);

// ── 5. Sync queue integrity ───────────────────────────────────────
section("Sync Queue Integrity");

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

const q = new SyncQueue();
q.enqueue({ id: "eq-1", type: "CHECKOUT", payload: { userId: "u-1" } });
q.enqueue({ id: "eq-1", type: "MOVE", payload: { location: "OR-2" } });
assert(q.size === 2, "Queue holds 2 items");

const drained = q.drain();
assert(drained.length === 2, "Drain returns all items");
assert(q.size === 0, "Queue is empty after drain");
assert(drained[0].type === "CHECKOUT", "First op is CHECKOUT");
assert(drained[1].type === "MOVE", "Second op is MOVE");

try {
  q.enqueue({ id: "eq-1" });
  assert(false, "Op without type should throw");
} catch (e) {
  assert(e.message.includes("type"), "Op without type throws");
}

// ── Summary ───────────────────────────────────────────────────────
console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ basic.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ basic.test.js PASSED");
