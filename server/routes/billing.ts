import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { billingLedger, db } from "../db.js";
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
  animalId: z.string().min(1),
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
