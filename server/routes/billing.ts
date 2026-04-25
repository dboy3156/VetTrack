import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { billingLedger, db, pool } from "../db.js";
import { requireAuth, requireAdmin, requireEffectiveRole } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";

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

// GET /api/billing/leakage-report?from=<ISO>&to=<ISO>
// The commercial unlock: compares dispensed inventory against billing entries
// to surface the ₪ gap that makes hospital owners say "I'll pay tomorrow."
router.get("/leakage-report", requireAuth, requireEffectiveRole("vet"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const now = new Date();
    const fromDate = req.query.from
      ? new Date(req.query.from as string)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const toDate = req.query.to ? new Date(req.query.to as string) : now;

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      return res.status(400).json(
        apiError({ code: "VALIDATION_FAILED", reason: "INVALID_DATE", message: "Invalid from/to date", requestId }),
      );
    }

    // All dispensed quantities grouped by container in the window.
    // inventory_logs.quantity_added < 0 means a deduction (dispense).
    const dispenseResult = await pool.query<{
      container_id: string;
      container_name: string;
      unit_price_cents: number;
      dispensed_qty: number;
    }>(
      `SELECT
         c.id                              AS container_id,
         c.name                            AS container_name,
         COALESCE(bi.unit_price_cents, 0)  AS unit_price_cents,
         SUM(ABS(il.quantity_added))::int  AS dispensed_qty
       FROM vt_inventory_logs il
       JOIN vt_containers c ON c.id = il.container_id
       LEFT JOIN vt_billing_items bi
         ON bi.id = c.billing_item_id AND bi.clinic_id = $1
       WHERE il.clinic_id = $1
         AND il.log_type  = 'adjustment'
         AND il.quantity_added < 0
         AND il.created_at >= $2
         AND il.created_at <= $3
       GROUP BY c.id, c.name, bi.unit_price_cents
       HAVING SUM(ABS(il.quantity_added)) > 0`,
      [clinicId, fromDate, toDate],
    );

    // All billing entries for CONSUMABLE items grouped by itemId (= containerId).
    const billedResult = await pool.query<{
      item_id: string;
      billed_qty: number;
    }>(
      `SELECT
         item_id,
         SUM(quantity)::int AS billed_qty
       FROM vt_billing_ledger
       WHERE clinic_id  = $1
         AND item_type  = 'CONSUMABLE'
         AND status    != 'voided'
         AND created_at >= $2
         AND created_at <= $3
       GROUP BY item_id`,
      [clinicId, fromDate, toDate],
    );

    const billedMap = new Map<string, number>();
    for (const r of billedResult.rows) {
      billedMap.set(r.item_id, r.billed_qty);
    }

    const items = dispenseResult.rows
      .map((r) => {
        const billedQty = billedMap.get(r.container_id) ?? 0;
        const gapQty = Math.max(0, r.dispensed_qty - billedQty);
        const gapValueCents = gapQty * r.unit_price_cents;
        return {
          containerId: r.container_id,
          containerName: r.container_name,
          unitPriceCents: r.unit_price_cents,
          dispensedQty: r.dispensed_qty,
          billedQty,
          gapQty,
          gapValueCents,
          leakagePct: r.dispensed_qty > 0
            ? Math.round((gapQty / r.dispensed_qty) * 100)
            : 0,
        };
      })
      .sort((a, b) => b.gapValueCents - a.gapValueCents);

    const totalDispensedQty = items.reduce((s, i) => s + i.dispensedQty, 0);
    const totalBilledQty    = items.reduce((s, i) => s + i.billedQty, 0);
    const totalGapQty       = items.reduce((s, i) => s + i.gapQty, 0);
    const totalGapValueCents = items.reduce((s, i) => s + i.gapValueCents, 0);
    const overallLeakagePct = totalDispensedQty > 0
      ? Math.round((totalGapQty / totalDispensedQty) * 100)
      : 0;

    res.json({
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
      summary: {
        totalDispensedQty,
        totalBilledQty,
        totalGapQty,
        totalGapValueCents,
        overallLeakagePct,
      },
      items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "LEAKAGE_REPORT_FAILED", message: "Failed to compute leakage report", requestId }),
    );
  }
});

// GET /api/billing/export.csv?status=pending&from=<ISO>&to=<ISO>
// Exports billing entries as CSV for manual import into Camillion / ezyVet.
router.get("/export.csv", requireAuth, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { status, from, to } = req.query as Record<string, string>;

    const conditions = [eq(billingLedger.clinicId, clinicId)];
    if (status) conditions.push(eq(billingLedger.status, status as "pending" | "synced" | "voided"));
    if (from) conditions.push(gte(billingLedger.createdAt, new Date(from)));
    if (to) conditions.push(lte(billingLedger.createdAt, new Date(to)));

    const rows = await db
      .select()
      .from(billingLedger)
      .where(and(...conditions))
      .orderBy(desc(billingLedger.createdAt))
      .limit(5000);

    const header = "id,date,animal_id,item_type,item_id,quantity,unit_price,total,status";
    const csvLines = rows.map((r) =>
      [
        r.id,
        new Date(r.createdAt).toISOString(),
        r.animalId ?? "",
        r.itemType,
        r.itemId,
        r.quantity,
        (r.unitPriceCents / 100).toFixed(2),
        (r.totalAmountCents / 100).toFixed(2),
        r.status,
      ].join(","),
    );

    const csv = [header, ...csvLines].join("\n");
    const filename = `billing_export_${new Date().toISOString().slice(0, 10)}.csv`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "EXPORT_FAILED", message: "Failed to export billing data", requestId }),
    );
  }
});

// PATCH /api/billing/bulk-sync — mark a batch of entries as synced
// Used after manually importing the CSV into Camillion / ezyVet.
router.patch(
  "/bulk-sync",
  requireAuth,
  requireAdmin,
  validateBody(z.object({ ids: z.array(z.string()).min(1).max(500) })),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const { ids } = req.body as { ids: string[] };

      await db
        .update(billingLedger)
        .set({ status: "synced" })
        .where(
          and(
            eq(billingLedger.clinicId, clinicId),
            inArray(billingLedger.id, ids),
          ),
        );

      res.json({ synced: ids.length });
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({ code: "INTERNAL_ERROR", reason: "BULK_SYNC_FAILED", message: "Failed to bulk sync billing entries", requestId }),
      );
    }
  },
);

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

// POST /api/billing — create a manual charge (animalId optional for unlinked captures)
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
      animalId: b.animalId ?? null,
      itemType: b.itemType,
      itemId: b.itemId,
      quantity: b.quantity,
      unitPriceCents: b.unitPriceCents,
      totalAmountCents,
      idempotencyKey,
      status: "pending",
    });

    const [row] = await db.select().from(billingLedger).where(eq(billingLedger.id, id)).limit(1);
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
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "BILLING_VOID_FAILED", message: "Failed to void billing entry", requestId }));
  }
});

export default router;
