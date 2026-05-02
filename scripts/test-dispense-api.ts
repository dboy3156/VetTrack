/**
 * Integration stress script for `POST /api/containers/:id/dispense`.
 *
 * Prerequisites:
 *   - API running (default `http://localhost:3001` — Vite is :5000, Express API is :3001)
 *   - `DATABASE_URL` (same DB the API uses) for ledger / stock assertions
 *   - Dev auth: unset `CLERK_SECRET_KEY` or use a valid session; dev-bypass allows unauthenticated
 *     requests as the default dev user when `NODE_ENV` is not production
 *   - Seeded data matching the env IDs below
 *
 * Run:
 *   pnpm exec tsx scripts/test-dispense-api.ts
 *
 * Optional env:
 *   - `API_BASE_URL` — default `http://localhost:3001`
 *   - `VETTRACK_TEST_FORCE_BILLING_FAIL=1` on the **server** for atomic rollback test (header `X-Test-Force-Billing-Fail: 1`)
 *   - `X-Dev-Clinic-Id-Override` — if your seed rows use a clinic other than `dev-clinic-default`, set
 *     `TEST_CLINIC_ID` and the script sends `x-dev-clinic-id-override` (dev-bypass only)
 *   - `SKIP_CONCEALMENT=1` — skip allowlist test (e.g. when ER mode not enforced in DB)
 *   - `SKIP_BILLING=1` — skip billing + idempotency sections if you have no COP-aligned patient+item seed
 */
import "dotenv/config";
import { pool } from "../server/db.js";

const BASE_URL = process.env.API_BASE_URL?.trim() || "http://localhost:3001";

/** Animal (patient) with no active medication order for the container under test — for Smart COP orphan + emergency paths. */
const PATIENT_NO_ORDERS = process.env.TEST_PATIENT_NO_ORDERS?.trim() || "";
/** Inventory item id that exists in `TEST_CONTAINER_ID` with sufficient quantity (used for non-emergency / COP tests). */
const CONTAINER_ITEM_ID = process.env.TEST_CONTAINER_ITEM_ID?.trim() || "";
const CONTAINER_ID = process.env.TEST_CONTAINER_ID?.trim() || "";
/** Optional seed metadata for docs — dispense body today uses `animalId` + `items`, not `hospitalizationId`. */

/** Animal with open hospitalization + active medication appointment aligned to `CONTAINER_ID` + `CONTAINER_ITEM_ID` (for billing + idempotency). */
const PATIENT_WITH_ORDER = process.env.TEST_PATIENT_WITH_ORDER?.trim() || "";

const CLINIC_HEADER =
  process.env.TEST_CLINIC_ID?.trim() && process.env.TEST_CLINIC_ID !== "dev-clinic-default"
    ? { "x-dev-clinic-id-override": process.env.TEST_CLINIC_ID.trim() }
    : {};

function jsonHeaders(idemKey: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Idempotency-Key": idemKey,
    ...CLINIC_HEADER,
    ...extra,
  };
}

async function testConcealmentAllowlist(): Promise<void> {
  if (process.env.SKIP_CONCEALMENT === "1") {
    console.log("skip concealment (SKIP_CONCEALMENT=1)");
    return;
  }
  // Under ER concealment, non-allowlisted routes return 404 (not 403). `/containers` is on the allowlist.
  const res = await fetch(`${BASE_URL}/api/containers/${CONTAINER_ID}/dispense`, {
    method: "POST",
    headers: jsonHeaders("concealment-test-1"),
    body: JSON.stringify({ items: [], isEmergency: true, bypassReason: "EMERGENCY_CPR" }),
  });
  if (res.status === 404) {
    const j = (await res.json().catch(() => ({}))) as { reason?: string };
    if (j.reason === "ER_MODE_CONCEALMENT") {
      throw new Error(
        "Concealment returned 404 — /api/containers is not allowlisted for this clinic or ER state mismatch. " +
          "Confirm `ER_MODE_API_PATH_PREFIX_ALLOWLIST` includes `/containers` and clinic ER mode state.",
      );
    }
  }
  console.assert(res.status !== 403, "FAIL concealment allowlist — 403 (should be 404 or success, not 403)");
  console.log("concealment allowlist", res.status);
}

/** Smart COP: non-emergency dispense with no matching order → 400 `ORPHAN_DISPENSE_BLOCKED`. */
async function testCOPEnforcement_noOrder(): Promise<void> {
  if (!PATIENT_NO_ORDERS || !CONTAINER_ITEM_ID) {
    throw new Error("Set TEST_PATIENT_NO_ORDERS and TEST_CONTAINER_ITEM_ID for COP tests");
  }
  const res = await fetch(`${BASE_URL}/api/containers/${CONTAINER_ID}/dispense`, {
    method: "POST",
    headers: jsonHeaders("cop-no-order-1"),
    body: JSON.stringify({
      items: [{ itemId: CONTAINER_ITEM_ID, quantity: 1 }],
      animalId: PATIENT_NO_ORDERS,
      isEmergency: false,
    }),
  });
  const body = (await res.json()) as { code?: string };
  console.assert(res.status === 400, `FAIL — expected 400, got ${res.status}`);
  console.assert(
    body.code === "ORPHAN_DISPENSE_BLOCKED",
    `FAIL — expected ORPHAN_DISPENSE_BLOCKED, got ${body.code}`,
  );
  console.log("COP no-order", res.status, body.code);
}

/**
 * Emergency **start** path: no stock change, no consumable billing; response uses `emergencyEventId` (not `inventoryLogId`).
 * Smart COP / `evaluateDispenseAgainstOrders` is not run for this branch.
 */
async function testCOPBypass_emergency(): Promise<string> {
  if (!PATIENT_NO_ORDERS) {
    throw new Error("Set TEST_PATIENT_NO_ORDERS");
  }
  const res = await fetch(`${BASE_URL}/api/containers/${CONTAINER_ID}/dispense`, {
    method: "POST",
    headers: jsonHeaders("cop-emergency-1"),
    body: JSON.stringify({
      items: [],
      animalId: PATIENT_NO_ORDERS,
      isEmergency: true,
      bypassReason: "EMERGENCY_CPR",
    }),
  });
  console.assert(res.status === 200, `FAIL — expected 200 on emergency start, got ${res.status}`);
  const body = (await res.json()) as { emergencyEventId?: string };
  console.assert(typeof body.emergencyEventId === "string" && body.emergencyEventId.length > 0, "missing emergencyEventId");
  console.log("COP emergency bypass (start event)", res.status, body.emergencyEventId);
  return body.emergencyEventId!;
}

/** After a **normal** successful dispense, billing uses `${httpIdempotencyKey}:adj:${inventoryLogId}` when Idempotency-Key was sent. */
async function testBillingLedgerForInventoryLog(inventoryLogId: string, httpIdempotencyKey: string): Promise<void> {
  const idem = `${httpIdempotencyKey}:adj:${inventoryLogId}`;
  const row = await pool.query<{
    total_amount_cents: number;
    idempotency_key: string;
  }>(`SELECT total_amount_cents, idempotency_key FROM vt_billing_ledger WHERE idempotency_key = $1`, [idem]);
  console.assert(row.rowCount === 1, "FAIL — no billing ledger row for idempotency key");
  const cents = row.rows[0].total_amount_cents;
  console.assert(cents > 0, "FAIL — billing amount is zero");
  console.log("billing ledger", { idempotencyKey: row.rows[0].idempotency_key, totalAmountCents: cents });
}

/**
 * Run a valid non-emergency dispense (patient with order + item line) and return a new `inventoryLogId` from the DB.
 */
async function runValidDispenseForBilling(idemKey: string): Promise<string> {
  if (!PATIENT_WITH_ORDER || !CONTAINER_ITEM_ID) {
    throw new Error("Set TEST_PATIENT_WITH_ORDER (hospitalized + med order) and TEST_CONTAINER_ITEM_ID for billing tests");
  }
  const res = await fetch(`${BASE_URL}/api/containers/${CONTAINER_ID}/dispense`, {
    method: "POST",
    headers: jsonHeaders(idemKey),
    body: JSON.stringify({
      items: [{ itemId: CONTAINER_ITEM_ID, quantity: 1 }],
      animalId: PATIENT_WITH_ORDER,
      isEmergency: false,
    }),
  });
  if (res.status !== 200) {
    const errBody = await res.text();
    throw new Error(`valid dispense failed: ${res.status} ${errBody}`);
  }
  const clinicId = process.env.TEST_CLINIC_ID?.trim();
  const r = clinicId
    ? await pool.query<{ id: string }>(
        `SELECT id FROM vt_inventory_logs
         WHERE container_id = $1 AND clinic_id = $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [CONTAINER_ID, clinicId],
      )
    : await pool.query<{ id: string }>(
        `SELECT id FROM vt_inventory_logs
         WHERE container_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [CONTAINER_ID],
      );
  if (r.rowCount === 0) throw new Error("no inventory log after dispense");
  return r.rows[0].id;
}

async function getStockForItem(): Promise<number> {
  const r = await pool.query<{ quantity: number }>(
    `SELECT quantity FROM vt_container_items WHERE container_id = $1 AND item_id = $2 LIMIT 1`,
    [CONTAINER_ID, CONTAINER_ITEM_ID],
  );
  if (r.rowCount === 0) return -1;
  return r.rows[0].quantity;
}

/** Transaction atomicity: force failure inside `captureConsumableBillingForDispenseLine` (server must have `VETTRACK_TEST_FORCE_BILLING_FAIL=1`). */
async function testAtomicRollback(): Promise<void> {
  if (process.env.VETTRACK_TEST_FORCE_BILLING_FAIL !== "1") {
    console.log("skip atomic rollback (set VETTRACK_TEST_FORCE_BILLING_FAIL=1 on the API process)");
    return;
  }
  if (!PATIENT_WITH_ORDER) {
    console.log("skip atomic rollback (TEST_PATIENT_WITH_ORDER not set)");
    return;
  }
  const stockBefore = await getStockForItem();
  const res = await fetch(`${BASE_URL}/api/containers/${CONTAINER_ID}/dispense`, {
    method: "POST",
    headers: jsonHeaders("rollback-test-1", { "X-Test-Force-Billing-Fail": "1" }),
    body: JSON.stringify({
      items: [{ itemId: CONTAINER_ITEM_ID, quantity: 1 }],
      animalId: PATIENT_WITH_ORDER,
      isEmergency: false,
    }),
  });
  console.assert(res.status === 500, `FAIL — expected 500 on forced billing fail, got ${res.status}`);
  const stockAfter = await getStockForItem();
  console.assert(stockBefore === stockAfter, "FAIL — stock changed despite billing failure (transaction not rolled back)");
  console.log("atomicity", res.status, "stock unchanged:", stockAfter);
}

/** Same `Idempotency-Key` + body → second POST replays cached JSON without duplicating stock moves. */
async function testDoubleSubmitBehavior(): Promise<void> {
  if (process.env.SKIP_BILLING === "1" || !PATIENT_WITH_ORDER) {
    console.log("skip double-submit (SKIP_BILLING=1 or no TEST_PATIENT_WITH_ORDER)");
    return;
  }
  const IDEM_KEY = "idem-test-fixed-key";
  const payload = JSON.stringify({
    items: [{ itemId: CONTAINER_ITEM_ID, quantity: 1 }],
    animalId: PATIENT_WITH_ORDER,
    isEmergency: false,
  });
  const headers = jsonHeaders(IDEM_KEY);

  const stockBefore = await getStockForItem();

  const r1 = await fetch(`${BASE_URL}/api/containers/${CONTAINER_ID}/dispense`, {
    method: "POST",
    headers,
    body: payload,
  });
  const stockAfterFirst = await getStockForItem();

  const r2 = await fetch(`${BASE_URL}/api/containers/${CONTAINER_ID}/dispense`, {
    method: "POST",
    headers,
    body: payload,
  });
  const stockAfterSecond = await getStockForItem();

  const j1 = (await r1.json()) as Record<string, unknown>;
  const j2 = (await r2.json()) as Record<string, unknown>;

  console.assert(r1.status === 200 && r2.status === 200, `expected two 200s, got ${r1.status} / ${r2.status}`);
  console.assert(JSON.stringify(j1) === JSON.stringify(j2), "FAIL — idempotent replay should return the same JSON body");
  console.assert(
    stockBefore - stockAfterFirst === 1 && stockAfterFirst === stockAfterSecond,
    "FAIL — second request should not deduct stock again",
  );
  console.log("double-submit: replayed cached response; stock moved once only");
}

void (async () => {
  if (!CONTAINER_ID) {
    throw new Error("Set TEST_CONTAINER_ID");
  }

  await testConcealmentAllowlist();
  await testCOPEnforcement_noOrder();
  await testCOPBypass_emergency();

  if (process.env.SKIP_BILLING !== "1" && PATIENT_WITH_ORDER) {
    const billingIdemKey = "billing-check-1";
    const logId = await runValidDispenseForBilling(billingIdemKey);
    await testBillingLedgerForInventoryLog(logId, billingIdemKey);
  } else {
    console.log("skip billing ledger (SKIP_BILLING=1 or TEST_PATIENT_WITH_ORDER unset)");
  }

  await testAtomicRollback();
  await testDoubleSubmitBehavior();

  await pool.end();
  console.log("All assertions complete.");
})().catch((e) => {
  console.error(e);
  void pool.end();
  process.exit(1);
});
