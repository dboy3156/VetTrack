import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { inventoryItems, db } from "../db.js";
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

const createItemSchema = z.object({
  code: z.string().min(1).max(100).regex(/^[A-Z0-9_\-]+$/i, "Code must be alphanumeric with underscores/hyphens"),
  label: z.string().min(1).max(200),
  category: z.string().max(100).optional(),
  nfcTagId: z.string().max(200).optional().nullable(),
});

const updateItemSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  category: z.string().max(100).optional().nullable(),
  nfcTagId: z.string().max(200).optional().nullable(),
});

// GET /api/inventory-items — list all items for the clinic
router.get("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const rows = await db
      .select()
      .from(inventoryItems)
      .where(eq(inventoryItems.clinicId, clinicId))
      .orderBy(asc(inventoryItems.label));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "ITEMS_LIST_FAILED", message: "Failed to list inventory items", requestId }),
    );
  }
});

// POST /api/inventory-items — create item
router.post("/", requireAuth, requireAdmin, validateBody(createItemSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const b = req.body as z.infer<typeof createItemSchema>;
    const id = randomUUID();

    await db.insert(inventoryItems).values({
      id,
      clinicId,
      code: b.code.trim().toUpperCase(),
      label: b.label.trim(),
      category: b.category?.trim() || null,
      nfcTagId: b.nfcTagId?.trim() || null,
    });

    const [row] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id)).limit(1);
    res.status(201).json(row);
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23505") {
      return res.status(409).json(
        apiError({ code: "CONFLICT", reason: "CODE_EXISTS", message: "An item with this code already exists", requestId }),
      );
    }
    console.error(err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "ITEM_CREATE_FAILED", message: "Failed to create inventory item", requestId }),
    );
  }
});

// PATCH /api/inventory-items/:id — update label, category, nfcTagId
router.patch("/:id", requireAuth, requireAdmin, validateUuid("id"), validateBody(updateItemSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const b = req.body as z.infer<typeof updateItemSchema>;

    const [existing] = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.id, req.params.id)))
      .limit(1);

    if (!existing) return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "ITEM_NOT_FOUND", message: "Inventory item not found", requestId }));

    const updates: Partial<typeof existing> = {};
    if (b.label !== undefined) updates.label = b.label.trim();
    if (b.category !== undefined) updates.category = b.category?.trim() || null;
    if (b.nfcTagId !== undefined) updates.nfcTagId = b.nfcTagId?.trim() || null;

    await db.update(inventoryItems).set(updates).where(eq(inventoryItems.id, req.params.id));

    const [updated] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, req.params.id)).limit(1);
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "ITEM_UPDATE_FAILED", message: "Failed to update inventory item", requestId }),
    );
  }
});

// DELETE /api/inventory-items/:id — hard delete (FK will protect if in use)
router.delete("/:id", requireAuth, requireAdmin, validateUuid("id"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;

    const [existing] = await db
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.id, req.params.id)))
      .limit(1);

    if (!existing) return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "ITEM_NOT_FOUND", message: "Inventory item not found", requestId }));

    await db.delete(inventoryItems).where(eq(inventoryItems.id, req.params.id));
    res.status(204).send();
  } catch (err: unknown) {
    const pgErr = err as { code?: string };
    if (pgErr?.code === "23503") {
      return res.status(409).json(
        apiError({ code: "CONFLICT", reason: "ITEM_IN_USE", message: "Item is in use and cannot be deleted", requestId }),
      );
    }
    console.error(err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "ITEM_DELETE_FAILED", message: "Failed to delete inventory item", requestId }),
    );
  }
});

export default router;
