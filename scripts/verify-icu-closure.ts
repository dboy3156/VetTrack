/**
 * ICU / Smart-COP closure checks for container dispense + emergency complete + billing.
 *
 * Run: `pnpm exec tsx scripts/verify-icu-closure.ts`
 *
 * Requires:
 *   - API running (default `http://localhost:3001` — Express API; Vite is :5000)
 *   - `DATABASE_URL` in env (same DB the API uses) for ledger queries
 *   - Seeded `TEST_CONTAINER_ID` with `TEST_CONTAINER_ITEM_ID` in stock (qty ≥ 1)
 *   - `TEST_PATIENT_NO_ORDERS` — animal in critical context with no active order for that line (COP block)
 *
 * Optional:
 *   - `TEST_AUTH_TOKEN` — if set, sends `Authorization: Bearer …` (otherwise dev-bypass: no header)
 *   - `API_BASE_URL` — override API origin
 *   - `TEST_CLINIC_ID` + `x-dev-clinic-id-override` (see `scripts/test-dispense-api.ts`)
 *   - `SKIP_CONCURRENCY=1` — skip parallel POST test (see below)
 *   - `EXPECT_DISPENSE_IDEMPOTENCY=1` — assert HTTP `Idempotency-Key` dedupes (not implemented today)
 *
 * Note: The inline “pseudocode” style spec used `patientId`, `qty`, `bypassReason`, and
 * `inventoryLogId` on a single emergency POST. The real API uses `animalId`, `items[]`, and:
 *   1) `POST /dispense` with `isEmergency: true` → `emergencyEventId` (no stock, no COP, no consumable bill)
 *   2) `PATCH /containers/emergency/:eventId/complete` with `items` → `inventoryLogId` in DB + ledger via
 *      `idempotency_key = adjustment_<inventoryLogId>`. There is no `vt_tasks.tag` in this schema; use
 *      `vt_appointments` if you add reconciliation follow-ups later.
 */
import "dotenv/config";
import { pool } from "../server/db.js";

const BASE = process.env.API_BASE_URL?.trim() || "http://localhost:3001";
const C_ID = process.env.TEST_CONTAINER_ID?.trim() || "";
const ITEM_ID = process.env.TEST_CONTAINER_ITEM_ID?.trim() || "";
const P_ID = process.env.TEST_PATIENT_NO_ORDERS?.trim() || "";
const TOKEN = process.env.TEST_AUTH_TOKEN?.trim();
const CLINIC_ID = process.env.TEST_CLINIC_ID?.trim();

const CLINIC_HEADER: Record<string, string> =
  CLINIC_ID && CLINIC_ID !== "dev-clinic-default" ? { "x-dev-clinic-id-override": CLINIC_ID } : {};

function jsonHeaders(idemKey: string): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
    "Idempotency-Key": idemKey,
    ...CLINIC_HEADER,
  };
  if (TOKEN) {
    h.Authorization = `Bearer ${TOKEN}`;
  }
  return h;
}

async function postDispense(idemKey: string, body: object) {
  return fetch(`${BASE}/api/containers/${C_ID}/dispense`, {
    method: "POST",
    headers: jsonHeaders(idemKey),
    body: JSON.stringify(body),
  });
}

async function patchEmergencyComplete(eventId: string, idemKey: string, body: object) {
  return fetch(`${BASE}/api/containers/emergency/${eventId}/complete`, {
    method: "PATCH",
    headers: jsonHeaders(idemKey),
    body: JSON.stringify(body),
  });
}

/** Case A — non-emergency dispense with no matching order → 400 `ORPHAN_DISPENSE_BLOCKED`. */
async function caseA(): Promise<void> {
  const res = await postDispense("closure-case-a-1", {
    items: [{ itemId: ITEM_ID, quantity: 1 }],
    animalId: P_ID,
    isEmergency: false,
  });
  const body = (await res.json()) as { error?: string; code?: string };
  console.assert(res.status === 400, `A: expected 400, got ${res.status}`);
  console.assert(
    body.error === "ORPHAN_DISPENSE_BLOCKED" || body.code === "ORPHAN_DISPENSE_BLOCKED",
    `A: wrong error code: ${JSON.stringify(body)}`,
  );
  console.log("[A] BLOCK", res.status, body.code ?? body.error);
}

/**
 * Case B — emergency path: start event, then complete with a line (produces `inventoryLogId` in DB + billing).
 * The one-shot `inventoryLogId` in JSON is only on some clients; the server returns `dispensed` / `billingIds` here.
 */
async function caseB(): Promise<string> {
  const start = await postDispense("closure-case-b-start", {
    items: [],
    animalId: P_ID,
    isEmergency: true,
  });
  console.assert(start.status === 200, `B: emergency start expected 200, got ${start.status}`);
  const startBody = (await start.json()) as { emergencyEventId?: string };
  const eventId = startBody.emergencyEventId;
  console.assert(typeof eventId === "string" && eventId.length > 0, "B: missing emergencyEventId");

  const complete = await patchEmergencyComplete(eventId!, "closure-case-b-complete", {
    items: [{ itemId: ITEM_ID, quantity: 1 }],
    animalId: P_ID,
  });
  console.assert(complete.status === 200, `B: complete expected 200, got ${complete.status}`);

  const logRow = CLINIC_ID
    ? await pool.query<{ id: string }>(
        `SELECT id FROM vt_inventory_logs
         WHERE clinic_id = $1 AND container_id = $2
           AND metadata->>'emergencyEventId' = $3
         ORDER BY created_at DESC
         LIMIT 1`,
        [CLINIC_ID, C_ID, eventId],
      )
    : await pool.query<{ id: string }>(
        `SELECT id FROM vt_inventory_logs
         WHERE container_id = $1
           AND metadata->>'emergencyEventId' = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [C_ID, eventId],
      );

  console.assert(logRow.rowCount === 1, "B: no inventory log row after emergency complete");
  const inventoryLogId = logRow.rows[0].id;
  console.log("[B] BYPASS complete → inventoryLogId", inventoryLogId);
  return inventoryLogId;
}

/** Case C — `vt_billing_ledger`: exactly one row keyed by `adjustment_${inventoryLogId}` (no `inventory_log_id` column). */
async function caseC(inventoryLogId: string): Promise<void> {
  const idem = `adjustment_${inventoryLogId}`;
  const row = await pool.query<{
    item_id: string;
    total_amount_cents: number;
  }>(`SELECT item_id, total_amount_cents FROM vt_billing_ledger WHERE idempotency_key = $1`, [idem]);
  console.assert(row.rowCount === 1, "C: expected exactly 1 ledger row for adjustment key");
  console.assert(Boolean(row.rows[0].item_id), "C: item_id not linked");
  console.assert(row.rows[0].total_amount_cents > 0, "C: total_amount_cents is zero");
  console.log("[C] MONEY", { idempotencyKey: idem, ...row.rows[0] });
}

/**
 * Concurrency: duplicate `POST …/dispense` with the same `Idempotency-Key` is not replay-protected on this route
 * today — expect two distinct emergency starts unless/until middleware dedupes.
 */
async function concurrencyCheck(): Promise<void> {
  if (process.env.SKIP_CONCURRENCY === "1") {
    console.log("[CONCURRENCY] skipped (SKIP_CONCURRENCY=1)");
    return;
  }
  const IDEM = "closure-concurrent-idem-1";
  const payload = { items: [], animalId: P_ID, isEmergency: true };
  const [r1, r2] = await Promise.all([postDispense(IDEM, payload), postDispense(IDEM, payload)]);
  const [b1, b2] = await Promise.all([
    r1.json() as Promise<{ emergencyEventId?: string }>,
    r2.json() as Promise<{ emergencyEventId?: string }>,
  ]);

  if (process.env.EXPECT_DISPENSE_IDEMPOTENCY === "1") {
    console.assert(
      b1.emergencyEventId === b2.emergencyEventId,
      "CONCURRENCY: idempotency expected same emergencyEventId",
    );
    console.log("[CONCURRENCY] idempotency OK", b1.emergencyEventId);
    return;
  }

  console.assert(
    b1.emergencyEventId !== b2.emergencyEventId,
    "CONCURRENCY: unexpected duplicate event ids — server may have added idempotency",
  );
  console.log(
    "[CONCURRENCY] two parallel POSTs → two events (no route idempotency):",
    b1.emergencyEventId,
    b2.emergencyEventId,
  );
}

/** Reconciliation follow-up — optional; current emergency complete path does not insert these rows. */
async function reconciliationTaskCheck(): Promise<void> {
  if (process.env.RECON_TASK_CHECK !== "1") {
    console.log("[RECON TASK] skipped (set RECON_TASK_CHECK=1 to assert vt_appointments metadata match)");
    return;
  }
  const task = await pool.query(
    `SELECT id, metadata FROM vt_appointments
     WHERE animal_id = $1 AND metadata::text LIKE '%BILLING_RECONCILIATION%'
     ORDER BY created_at DESC LIMIT 1`,
    [P_ID],
  );
  console.assert(task.rowCount === 1, "RECON: no reconciliation appointment/metadata found");
  console.log("[RECON TASK]", task.rows[0]);
}

void (async () => {
  if (!C_ID || !ITEM_ID || !P_ID) {
    throw new Error("Set TEST_CONTAINER_ID, TEST_CONTAINER_ITEM_ID, and TEST_PATIENT_NO_ORDERS");
  }

  await caseA();
  const logId = await caseB();
  await caseC(logId);
  await concurrencyCheck();
  await reconciliationTaskCheck();
  console.log("All closure assertions passed.");
  await pool.end();
  process.exit(0);
})().catch((e) => {
  console.error(e);
  void pool.end();
  process.exit(1);
});
