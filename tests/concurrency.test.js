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

async function runConcurrencyTests() {
  // ── Test 1: N concurrent writers, no lost updates ─────────────
  section("Concurrent Increment — No Lost Updates");

  const store1 = new EquipmentStore();
  store1.seed({ id: "eq-1", counter: 0, version: 1 });

  const N = 20;
  const incrementFn = (rec) => ({ version: rec.version, counter: rec.counter + 1 });

  const results1 = await Promise.allSettled(
    Array.from({ length: N }, () => optimisticUpdate(store1, "eq-1", incrementFn))
  );

  const ok1 = results1.filter((r) => r.status === "fulfilled").length;
  const err1 = results1.filter((r) => r.status === "rejected").length;
  const final1 = store1.records.get("eq-1");

  console.log(
    `  ${N} writers → ${ok1} succeeded, ${err1} rejected, ` +
    `${store1.conflicts} conflicts detected internally`
  );

  assert(ok1 === N, `All ${N} optimistic updates eventually succeeded (got ${ok1})`);
  assert(err1 === 0, "No writers were permanently rejected");
  assert(
    final1.counter === N,
    `Counter = ${N} (no lost updates), got ${final1.counter}`
  );
  assert(
    final1.version === N + 1,
    `Version = ${N + 1}, got ${final1.version}`
  );

  // ── Test 2: Concurrent writes to independent records don't cross ─
  section("Isolated Concurrent Writes — No Cross-Contamination");

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
    assert(
      rec.count === WRITERS_PER_ID,
      `${id}: count = ${WRITERS_PER_ID}, got ${rec.count}`
    );
    assert(
      rec.version === WRITERS_PER_ID + 1,
      `${id}: version = ${WRITERS_PER_ID + 1}, got ${rec.version}`
    );
  }

  // ── Test 3: Read-your-writes consistency ──────────────────────
  section("Read-Your-Writes Consistency");

  const store3 = new EquipmentStore();
  store3.seed({ id: "eq-ryw", value: 0, version: 1 });

  // Sequential chain: each write reads the result of the previous
  let prev = store3.records.get("eq-ryw");
  for (let i = 1; i <= 5; i++) {
    const result = await store3.write("eq-ryw", { version: prev.version, value: i * 10 });
    const read = await store3.read("eq-ryw");
    assert(
      read.value === result.value,
      `After write ${i}: read returns written value (${result.value}), got ${read.value}`
    );
    prev = result;
  }

  const finalRyw = store3.records.get("eq-ryw");
  assert(finalRyw.value === 50, `Final value = 50, got ${finalRyw.value}`);
  assert(finalRyw.version === 6, `Final version = 6, got ${finalRyw.version}`);

  // ── Test 4: Conflict rate is non-zero under true concurrency ──
  section("Conflict Detection — Conflicts Observed Under Contention");

  const store4 = new EquipmentStore();
  store4.seed({ id: "eq-hot", counter: 0, version: 1 });

  // Fire all writes simultaneously without retry — expect conflicts
  const rawWrites = await Promise.allSettled(
    Array.from({ length: 10 }, async () => {
      const rec = await store4.read("eq-hot");
      // Intentional: don't retry; all will race on the same version
      return store4.write("eq-hot", { version: rec.version, counter: rec.counter + 1 });
    })
  );

  const rawOk = rawWrites.filter((r) => r.status === "fulfilled").length;
  const rawErr = rawWrites.filter((r) => r.status === "rejected").length;
  console.log(`  10 unretried concurrent writers → ${rawOk} succeeded, ${rawErr} conflicted`);

  assert(rawOk >= 1, "At least 1 write wins the race");
  assert(rawErr >= 1, "At least 1 conflict detected (proves locking works)");
  assert(rawOk + rawErr === 10, "All 10 outcomes accounted for");
}

runConcurrencyTests()
  .then(() => {
    console.log(`\n${"─".repeat(48)}`);
    console.log(`Results: ${passed} passed, ${failed} failed`);
    if (failed > 0) {
      console.error(`\n❌ concurrency.test.js FAILED (${failed} assertion(s) failed)`);
      process.exit(1);
    }
    console.log("\n✅ concurrency.test.js PASSED");
  })
  .catch((err) => {
    console.error("\n💥 concurrency.test.js threw an unexpected error:", err.message);
    process.exit(1);
  });
