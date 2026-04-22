import { describe, it, expect } from "vitest";

// ── Simulated async store with version-based optimistic locking ───
class EquipmentStore {
  constructor() {
    this.records = new Map();
    this.conflicts = 0;
    this.totalWrites = 0;
  }

  seed(record) {
    this.records.set(record.id, { ...record });
  }

  async read(id) {
    // Simulate async I/O jitter
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 5)));
    const rec = this.records.get(id);
    if (!rec) throw new Error(`Record not found: ${id}`);
    return { ...rec };
  }

  async write(id, patch) {
    await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 10)));
    const current = this.records.get(id);
    if (!current) throw new Error(`Record not found: ${id}`);
    if (patch.version !== current.version) {
      this.conflicts++;
      throw new Error(
        `Version conflict on ${id}: server@${current.version} vs patch@${patch.version}`
      );
    }
    const next = { ...current, ...patch, version: current.version + 1 };
    this.records.set(id, next);
    this.totalWrites++;
    return { ...next };
  }
}

// Retry loop: read → mutate → write, back off on conflict.
// Under heavy contention (20+ concurrent writers), a low retry cap can
// reject writers nondeterministically even when optimistic locking works.
async function optimisticUpdate(store, id, mutateFn, maxRetries = 50) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const current = await store.read(id);
    const patch = mutateFn(current);
    try {
      return await store.write(id, patch);
    } catch (e) {
      if (!e.message.includes("Version conflict") || attempt === maxRetries - 1) {
        throw e;
      }
      // Exponential back-off with jitter
      await new Promise((r) => setTimeout(r, 5 * (attempt + 1) + Math.random() * 5));
    }
  }
}

describe("Concurrent Increment — No Lost Updates", () => {
  it(`All 20 optimistic updates eventually succeeded`, async () => {
    const store1 = new EquipmentStore();
    store1.seed({ id: "eq-1", counter: 0, version: 1 });

    const N = 20;
    const incrementFn = (rec) => ({ version: rec.version, counter: rec.counter + 1 });

    const results1 = await Promise.allSettled(
      Array.from({ length: N }, () => optimisticUpdate(store1, "eq-1", incrementFn))
    );

    const ok1 = results1.filter((r) => r.status === "fulfilled").length;
    expect(ok1).toBe(N);
  }, 30000);

  it("No writers were permanently rejected", async () => {
    const store1 = new EquipmentStore();
    store1.seed({ id: "eq-1", counter: 0, version: 1 });

    const N = 20;
    const incrementFn = (rec) => ({ version: rec.version, counter: rec.counter + 1 });

    const results1 = await Promise.allSettled(
      Array.from({ length: N }, () => optimisticUpdate(store1, "eq-1", incrementFn))
    );

    const err1 = results1.filter((r) => r.status === "rejected").length;
    expect(err1).toBe(0);
  }, 30000);

  it(`Counter = 20 (no lost updates)`, async () => {
    const store1 = new EquipmentStore();
    store1.seed({ id: "eq-1", counter: 0, version: 1 });

    const N = 20;
    const incrementFn = (rec) => ({ version: rec.version, counter: rec.counter + 1 });

    await Promise.allSettled(
      Array.from({ length: N }, () => optimisticUpdate(store1, "eq-1", incrementFn))
    );

    const final1 = store1.records.get("eq-1");
    expect(final1.counter).toBe(N);
  }, 30000);

  it(`Version = 21`, async () => {
    const store1 = new EquipmentStore();
    store1.seed({ id: "eq-1", counter: 0, version: 1 });

    const N = 20;
    const incrementFn = (rec) => ({ version: rec.version, counter: rec.counter + 1 });

    await Promise.allSettled(
      Array.from({ length: N }, () => optimisticUpdate(store1, "eq-1", incrementFn))
    );

    const final1 = store1.records.get("eq-1");
    expect(final1.version).toBe(N + 1);
  }, 30000);
});

describe("Isolated Concurrent Writes — No Cross-Contamination", () => {
  it("Each isolated record reaches correct count and version", async () => {
    const store2 = new EquipmentStore();
    const ids = ["eq-a", "eq-b", "eq-c", "eq-d"];
    ids.forEach((id) => store2.seed({ id, count: 0, version: 1 }));

    const WRITERS_PER_ID = 5;
    await Promise.all(
      ids.flatMap((id) =>
        Array.from({ length: WRITERS_PER_ID }, () =>
          optimisticUpdate(store2, id, (rec) => ({ version: rec.version, count: rec.count + 1 }))
        )
      )
    );

    for (const id of ids) {
      const rec = store2.records.get(id);
      expect(rec.count).toBe(WRITERS_PER_ID);
      expect(rec.version).toBe(WRITERS_PER_ID + 1);
    }
  }, 30000);
});

describe("Read-Your-Writes Consistency", () => {
  it("After each write, read returns written value", async () => {
    const store3 = new EquipmentStore();
    store3.seed({ id: "eq-ryw", value: 0, version: 1 });

    let prev = store3.records.get("eq-ryw");
    for (let i = 1; i <= 5; i++) {
      const result = await store3.write("eq-ryw", { version: prev.version, value: i * 10 });
      const read = await store3.read("eq-ryw");
      expect(read.value).toBe(result.value);
      prev = result;
    }
  });

  it("Final value = 50", async () => {
    const store3 = new EquipmentStore();
    store3.seed({ id: "eq-ryw", value: 0, version: 1 });

    let prev = store3.records.get("eq-ryw");
    for (let i = 1; i <= 5; i++) {
      prev = await store3.write("eq-ryw", { version: prev.version, value: i * 10 });
    }

    expect(store3.records.get("eq-ryw").value).toBe(50);
  });

  it("Final version = 6", async () => {
    const store3 = new EquipmentStore();
    store3.seed({ id: "eq-ryw", value: 0, version: 1 });

    let prev = store3.records.get("eq-ryw");
    for (let i = 1; i <= 5; i++) {
      prev = await store3.write("eq-ryw", { version: prev.version, value: i * 10 });
    }

    expect(store3.records.get("eq-ryw").version).toBe(6);
  });
});

describe("Conflict Detection — Conflicts Observed Under Contention", () => {
  it("At least 1 write wins the race", async () => {
    const store4 = new EquipmentStore();
    store4.seed({ id: "eq-hot", counter: 0, version: 1 });

    const rawWrites = await Promise.allSettled(
      Array.from({ length: 10 }, async () => {
        const rec = await store4.read("eq-hot");
        return store4.write("eq-hot", { version: rec.version, counter: rec.counter + 1 });
      })
    );

    const rawOk = rawWrites.filter((r) => r.status === "fulfilled").length;
    expect(rawOk).toBeGreaterThanOrEqual(1);
  });

  it("At least 1 conflict detected (proves locking works)", async () => {
    const store4 = new EquipmentStore();
    store4.seed({ id: "eq-hot", counter: 0, version: 1 });

    const rawWrites = await Promise.allSettled(
      Array.from({ length: 10 }, async () => {
        const rec = await store4.read("eq-hot");
        return store4.write("eq-hot", { version: rec.version, counter: rec.counter + 1 });
      })
    );

    const rawErr = rawWrites.filter((r) => r.status === "rejected").length;
    expect(rawErr).toBeGreaterThanOrEqual(1);
  });

  it("All 10 outcomes accounted for", async () => {
    const store4 = new EquipmentStore();
    store4.seed({ id: "eq-hot", counter: 0, version: 1 });

    const rawWrites = await Promise.allSettled(
      Array.from({ length: 10 }, async () => {
        const rec = await store4.read("eq-hot");
        return store4.write("eq-hot", { version: rec.version, counter: rec.counter + 1 });
      })
    );

    const rawOk = rawWrites.filter((r) => r.status === "fulfilled").length;
    const rawErr = rawWrites.filter((r) => r.status === "rejected").length;
    expect(rawOk + rawErr).toBe(10);
  });
});
