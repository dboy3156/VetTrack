import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import { billingLedger, db, pool } from "../db.js";
import { requireAuth, requireAdmin, requireEffectiveRole } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { enqueueBillingWebhookJob } from "../lib/queue.js";
import { logAudit, resolveAuditActorRole } from "../lib/audit.js";

const router = Router();

function resolveRequestId(
  res: { getHeader: (n: string) => unknown; setHeader?: (n: string, v: string) => void },
  incoming: unknown,
): string {
  const incomingStr = typeof incoming === "string" ? incoming.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incomingStr || fromRes || randomUUID();
  if (typeof res.setHeader === "function") res.setHeader("x-request-id", requestId);
  return requestId;
}

function apiError(params: { code: string; reason: string; message: string; requestId: string }) {
  return {
    code: params.code,
    error: params.code,
    reason: params.reason,
    message: params.message,
    requestId: params.requestId,
  };
}

const createChargeSchema = z.object({
  animalId: z.string().min(1).optional(),
  itemType: z.enum(["EQUIPMENT", "CONSUMABLE"]),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
  note: z.string().max(500).optional(),
});

// GET /api/billing — list ledger entries for the clinic
router.get("/", requireAuth, requireEffectiveRole("vet"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { animalId, status, from, to, limit = "100", offset = "0" } = req.query as Record<string, string>;

    const conditions = [eq(billingLedger.clinicId, clinicId)];
    if (animalId) conditions.push(eq(billingLedger.animalId, animalId));
    if (status) conditions.push(eq(billingLedger.status, status as "pending" | "synced" | "voided"));
    if (from) conditions.push(gte(billingLedger.createdAt, new Date(from)));
    if (to) conditions.push(lte(billingLedger.createdAt, new Date(to)));

    const rows = await db
      .select()
      .from(billingLedger)
      .where(and(...conditions))
      .orderBy(desc(billingLedger.createdAt))
      .limit(Math.min(Number(limit) || 100, 500))
      .offset(Number(offset) || 0);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "BILLING_LIST_FAILED",
        message: "Failed to list billing entries",
        requestId,
      }),
    );
  }
});

// GET /api/billing/summary — aggregate summary for the billing dashboard
router.get("/summary", requireAuth, requireEffectiveRole("vet"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { from, to } = req.query as Record<string, string>;

    const dateConditions = [eq(billingLedger.clinicId, clinicId)];
    if (from) dateConditions.push(gte(billingLedger.createdAt, new Date(from)));
    if (to) dateConditions.push(lte(billingLedger.createdAt, new Date(to)));

    const rows = await db
      .select()
      .from(billingLedger)
      .where(and(...dateConditions));

    const nonVoided = rows.filter((r) => r.status !== "voided");
    const pending = rows.filter((r) => r.status === "pending");
    const synced = rows.filter((r) => r.status === "synced");
    const voided = rows.filter((r) => r.status === "voided");

    const totalCents = nonVoided.reduce((s, r) => s + r.totalAmountCents, 0);
    const pendingCents = pending.reduce((s, r) => s + r.totalAmountCents, 0);
    const syncedCents = synced.reduce((s, r) => s + r.totalAmountCents, 0);
    const voidedCents = voided.reduce((s, r) => s + r.totalAmountCents, 0);

    const byType = {
      EQUIPMENT: nonVoided.filter((r) => r.itemType === "EQUIPMENT").reduce((s, r) => s + r.totalAmountCents, 0),
      CONSUMABLE: nonVoided.filter((r) => r.itemType === "CONSUMABLE").reduce((s, r) => s + r.totalAmountCents, 0),
    };

    // Build last-30-days by-day breakdown
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const dayMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(thirtyDaysAgo.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, 0);
    }
    for (const r of nonVoided) {
      const key = new Date(r.createdAt).toISOString().slice(0, 10);
      if (dayMap.has(key)) {
        dayMap.set(key, (dayMap.get(key) ?? 0) + r.totalAmountCents);
      }
    }
    const byDay = Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, totalCents]) => ({ date, totalCents }));

    res.json({ totalCents, pendingCents, syncedCents, voidedCents, byType, byDay });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "BILLING_SUMMARY_FAILED",
        message: "Failed to compute billing summary",
        requestId,
      }),
    );
  }
});

// GET /api/billing/leakage-report — dispense vs. billing gap analysis
router.get("/leakage-report", requireAuth, requireEffectiveRole("vet"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const { from: fromParam, to: toParam } = req.query as Record<string, string>;
    const fromDate = fromParam ? new Date(fromParam) : thirtyDaysAgo;
    const toDate = toParam ? new Date(toParam) : now;

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json(
        apiError({
          code: "INVALID_DATE_RANGE",
          reason: "INVALID_DATE_RANGE",
          message: "Invalid from or to date",
          requestId,
        }),
      );
    }

    // Query dispenses (quantity_added < 0) joined to billing items via containers
    // and left-joined to billing ledger CONSUMABLE entries for the same window
    const result = await pool.query(
      `WITH dispenses AS (
        SELECT
          bi.id            AS item_id,
          bi.description   AS item_name,
          bi.unit_price_cents,
          SUM(ABS(il.quantity_added)) AS dispensed_qty
        FROM vt_inventory_logs il
        JOIN vt_containers c ON c.id = il.container_id
        JOIN vt_billing_items bi ON bi.id = c.billing_item_id
        LEFT JOIN vt_items vi ON vi.id = (il.metadata->>'itemId')
        WHERE il.clinic_id = $1
          AND il.quantity_added < 0
          AND il.created_at >= $2
          AND il.created_at <= $3
          AND c.billing_item_id IS NOT NULL
          AND (vi.is_billable IS NULL OR vi.is_billable = true)
        GROUP BY bi.id, bi.description, bi.unit_price_cents
      ),
      billed AS (
        SELECT
          item_id,
          SUM(quantity) AS billed_qty
        FROM vt_billing_ledger
        WHERE clinic_id = $1
          AND item_type = 'CONSUMABLE'
          AND status != 'voided'
          AND created_at >= $2
          AND created_at <= $3
        GROUP BY item_id
      )
      SELECT
        d.item_id,
        d.item_name,
        d.unit_price_cents,
        d.dispensed_qty,
        COALESCE(b.billed_qty, 0) AS billed_qty,
        d.dispensed_qty - COALESCE(b.billed_qty, 0) AS gap_qty,
        (d.dispensed_qty - COALESCE(b.billed_qty, 0)) * d.unit_price_cents AS gap_value_cents
      FROM dispenses d
      LEFT JOIN billed b ON b.item_id = d.item_id
      ORDER BY gap_value_cents DESC`,
      [clinicId, fromDate, toDate],
    );

    const items = result.rows.map((r) => ({
      itemId: r.item_id as string,
      itemName: r.item_name as string,
      unitPriceCents: Number(r.unit_price_cents),
      dispensedQty: Number(r.dispensed_qty),
      billedQty: Number(r.billed_qty),
      gapQty: Number(r.gap_qty),
      gapValueCents: Number(r.gap_value_cents),
    }));

    const totalDispensedQty = items.reduce((s, i) => s + i.dispensedQty, 0);
    const totalBilledQty = items.reduce((s, i) => s + i.billedQty, 0);
    const totalGapQty = items.reduce((s, i) => s + i.gapQty, 0);
    const totalGapValueCents = items.reduce((s, i) => s + i.gapValueCents, 0);
    const gapRatePercent = totalDispensedQty > 0
      ? Math.round((totalGapQty / totalDispensedQty) * 10000) / 100
      : 0;

    res.json({
      items,
      summary: {
        totalDispensedQty,
        totalBilledQty,
        totalGapQty,
        totalGapValueCents,
        gapRatePercent,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "LEAKAGE_REPORT_FAILED",
        message: "Failed to compute leakage report",
        requestId,
      }),
    );
  }
});

// GET /api/billing/shift-total — total billing captured since current open shift started
router.get("/shift-total", requireAuth, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;

    // Find the open shift session
    const shiftResult = await pool.query(
      "SELECT started_at FROM vt_shift_sessions WHERE clinic_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1",
      [clinicId],
    );

    if (shiftResult.rows.length === 0) {
      return res.json({ totalCents: 0, count: 0, shiftActive: false });
    }

    const startedAt: Date = shiftResult.rows[0].started_at;

    // Count billing entries since shift start
    const billingResult = await pool.query(
      "SELECT COUNT(*) AS count, COALESCE(SUM(total_amount_cents), 0) AS total FROM vt_billing_ledger WHERE clinic_id = $1 AND created_at >= $2",
      [clinicId, startedAt],
    );

    const count = parseInt(billingResult.rows[0].count, 10);
    const totalCents = parseInt(billingResult.rows[0].total, 10);

    res.json({ totalCents, count, shiftActive: true });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "SHIFT_TOTAL_FAILED",
        message: "Failed to compute shift billing total",
        requestId,
      }),
    );
  }
});

// GET /api/billing/:id — fetch single entry
router.get("/:id", requireAuth, requireEffectiveRole("vet"), validateUuid("id"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const [row] = await db
      .select()
      .from(billingLedger)
      .where(and(eq(billingLedger.clinicId, clinicId), eq(billingLedger.id, req.params.id)))
      .limit(1);

    if (!row) return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "ENTRY_NOT_FOUND", message: "Billing entry not found", requestId }));
    res.json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "BILLING_GET_FAILED", message: "Failed to get billing entry", requestId }));
  }
});

// POST /api/billing — create a manual charge
router.post("/", requireAuth, requireEffectiveRole("vet"), validateBody(createChargeSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const b = req.body as z.infer<typeof createChargeSchema>;
    const id = randomUUID();
    const totalAmountCents = b.quantity * b.unitPriceCents;
    const idempotencyKey = `manual_${clinicId}_${Date.now()}_${id}`;

    await db.insert(billingLedger).values({
      id,
      clinicId,
      animalId: b.animalId,
      itemType: b.itemType,
      itemId: b.itemId,
      quantity: b.quantity,
      unitPriceCents: b.unitPriceCents,
      totalAmountCents,
      idempotencyKey,
      status: "pending",
    });

    const [row] = await db.select().from(billingLedger).where(eq(billingLedger.id, id)).limit(1);

    // Fire webhook if configured (config lookup handled inside enqueueBillingWebhookJob)
    try {
      await enqueueBillingWebhookJob({
        clinicId,
        entry: {
          id: row.id,
          animalId: row.animalId,
          itemType: row.itemType,
          itemId: row.itemId,
          quantity: row.quantity,
          unitPriceCents: row.unitPriceCents,
          totalAmountCents: row.totalAmountCents,
          status: row.status,
          createdAt: row.createdAt,
        },
      });
    } catch (webhookErr) {
      console.error("[billing-webhook] Failed to enqueue webhook for manual charge, continuing:", webhookErr);
    }

    res.status(201).json(row);
  } catch (err) {
    console.error(err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "BILLING_CREATE_FAILED", message: "Failed to create billing entry", requestId }));
  }
});

// PATCH /api/billing/:id/void — void a charge
router.patch("/:id/void", requireAuth, requireAdmin, validateUuid("id"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const [existing] = await db
      .select()
      .from(billingLedger)
      .where(and(eq(billingLedger.clinicId, clinicId), eq(billingLedger.id, req.params.id)))
      .limit(1);

    if (!existing) return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "ENTRY_NOT_FOUND", message: "Billing entry not found", requestId }));
    if (existing.status === "voided") return res.status(409).json(apiError({ code: "CONFLICT", reason: "ALREADY_VOIDED", message: "Billing entry is already voided", requestId }));

    await db
      .update(billingLedger)
      .set({ status: "voided" })
      .where(eq(billingLedger.id, req.params.id));

    const [updated] = await db.select().from(billingLedger).where(eq(billingLedger.id, req.params.id)).limit(1);

    logAudit({
      actorRole: resolveAuditActorRole(req),
      clinicId,
      actionType: "billing_voided",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "billing_ledger",
      metadata: {
        previousStatus: existing.status,
        itemType: existing.itemType,
        itemId: existing.itemId,
        totalAmountCents: existing.totalAmountCents,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "BILLING_VOID_FAILED", message: "Failed to void billing entry", requestId }));
  }
});

const bulkSyncSchema = z.object({
  ids: z.array(z.string()).min(1),
});

// PATCH /api/billing/bulk-sync — mark billing entries as synced
router.patch("/bulk-sync", requireAuth, requireAdmin, validateBody(bulkSyncSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { ids } = req.body as z.infer<typeof bulkSyncSchema>;
    const result = await pool.query(
      "UPDATE vt_billing_ledger SET status = 'synced' WHERE id = ANY($1) AND clinic_id = $2",
      [ids, clinicId],
    );

    logAudit({
      actorRole: resolveAuditActorRole(req),
      clinicId,
      actionType: "billing_bulk_synced",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetType: "billing_ledger",
      metadata: { ids, updatedCount: result.rowCount ?? 0 },
    });

    res.json({ updated: result.rowCount ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "BILLING_BULK_SYNC_FAILED", message: "Failed to bulk sync billing entries", requestId }));
  }
});

// GET /api/billing/export.csv — export pending billing entries as CSV
router.get("/export.csv", requireAuth, requireEffectiveRole("vet"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const result = await pool.query(
      `SELECT bl.id, bl.created_at, bl.item_id, bl.quantity, bl.unit_price_cents, bl.total_amount_cents,
              a.name AS animal_name
       FROM vt_billing_ledger bl
       LEFT JOIN vt_animals a ON a.id = bl.animal_id
       WHERE bl.clinic_id = $1 AND bl.status = 'pending'
       ORDER BY bl.created_at ASC`,
      [clinicId],
    );

    const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const header = ["date", "patient", "item", "qty", "price", "total"].map(escape).join(",");
    const rows = result.rows.map((r) => {
      const date = new Date(r.created_at).toISOString().slice(0, 10);
      const patient = r.animal_name ?? "Unlinked";
      const price = (r.unit_price_cents / 100).toFixed(2);
      const total = (r.total_amount_cents / 100).toFixed(2);
      return [date, patient, r.item_id, String(r.quantity), price, total].map(escape).join(",");
    });
    const csv = [header, ...rows].join("\r\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="billing-export.csv"');
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "BILLING_EXPORT_FAILED", message: "Failed to export billing CSV", requestId }));
  }
});

export default router;
