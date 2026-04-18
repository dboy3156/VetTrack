import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { billingLedger, containers, db, inventoryLogs, auditLogs } from "../db.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";
import {
  findActiveAnimalInRoom,
  resolveBillingItemForContainer,
  restockLedgerIdempotencyKey,
} from "../lib/container-billing.js";

const router = Router();

const createContainerSchema = z.object({
  name: z.string().min(1).max(200),
  department: z.string().max(200).optional(),
  targetQuantity: z.number().int().min(0),
  currentQuantity: z.number().int().min(0).optional(),
  roomId: z.string().uuid().optional().nullable(),
  nfcTagId: z.string().max(200).optional().nullable(),
});

const restockSchema = z.object({
  addedQuantity: z.number().int().min(0),
});

const blindAuditSchema = z.object({
  physicalCount: z.number().int().min(0),
  note: z.string().max(500).optional(),
});

function resolveRequestId(res: { getHeader: (n: string) => unknown; setHeader?: (n: string, v: string) => void }, incoming: unknown): string {
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

router.get("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const rows = await db
      .select()
      .from(containers)
      .where(eq(containers.clinicId, clinicId))
      .orderBy(asc(containers.name));
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "CONTAINERS_LIST_FAILED",
        message: "Failed to list containers",
        requestId,
      }),
    );
  }
});

router.post(
  "/",
  requireAuth,
  requireEffectiveRole("admin"),
  validateBody(createContainerSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const b = req.body as z.infer<typeof createContainerSchema>;
      const id = randomUUID();
      const current = b.currentQuantity ?? b.targetQuantity;
      await db.insert(containers).values({
        id,
        clinicId,
        name: b.name.trim(),
        department: b.department?.trim() ?? "",
        targetQuantity: b.targetQuantity,
        currentQuantity: current,
        roomId: b.roomId ?? null,
        nfcTagId: b.nfcTagId?.trim() || null,
      });
      const [row] = await db.select().from(containers).where(eq(containers.id, id)).limit(1);
      res.status(201).json(row);
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({
          code: "INTERNAL_ERROR",
          reason: "CONTAINER_CREATE_FAILED",
          message: "Failed to create container",
          requestId,
        }),
      );
    }
  },
);

router.post(
  "/:id/restock",
  requireAuth,
  requireEffectiveRole("technician"),
  validateUuid("id"),
  validateBody(restockSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const { addedQuantity } = req.body as z.infer<typeof restockSchema>;
      const now = new Date();

      const result = await db.transaction(async (tx) => {
        const [c] = await tx
          .select()
          .from(containers)
          .where(and(eq(containers.clinicId, clinicId), eq(containers.id, req.params.id)))
          .limit(1);
        if (!c) return { error: "NOT_FOUND" as const };

        const quantityBefore = c.currentQuantity;
        const consumed = Math.max(0, c.targetQuantity - quantityBefore);
        const quantityAfter = Math.min(c.targetQuantity, quantityBefore + addedQuantity);

        await tx
          .update(containers)
          .set({ currentQuantity: quantityAfter })
          .where(and(eq(containers.clinicId, clinicId), eq(containers.id, c.id)));

        const animal = await findActiveAnimalInRoom(tx, clinicId, c.roomId);
        let ledgerId: string | null = null;

        if (consumed > 0 && animal) {
          const billing = await resolveBillingItemForContainer(tx, clinicId, c);
          const idempotencyKey = restockLedgerIdempotencyKey(c.id, now, consumed);
          const [existing] = await tx
            .select({ id: billingLedger.id })
            .from(billingLedger)
            .where(and(eq(billingLedger.clinicId, clinicId), eq(billingLedger.idempotencyKey, idempotencyKey)))
            .limit(1);

          if (!existing) {
            ledgerId = randomUUID();
            const totalCents = billing.unitPriceCents * consumed;
            await tx.insert(billingLedger).values({
              id: ledgerId,
              clinicId,
              animalId: animal.id,
              itemType: "CONSUMABLE",
              itemId: c.id,
              quantity: consumed,
              unitPriceCents: billing.unitPriceCents,
              totalAmountCents: totalCents,
              idempotencyKey,
              status: "pending",
            });
          } else {
            ledgerId = existing.id;
          }
        }

        const logId = randomUUID();
        await tx.insert(inventoryLogs).values({
          id: logId,
          clinicId,
          containerId: c.id,
          logType: "restock",
          quantityBefore,
          quantityAdded: addedQuantity,
          quantityAfter,
          consumedDerived: consumed,
          variance: null,
          animalId: animal?.id ?? null,
          roomId: c.roomId,
          note: null,
          createdByUserId: req.authUser!.id,
        });

        return {
          ok: true as const,
          container: { ...c, currentQuantity: quantityAfter },
          consumed,
          ledgerId,
          animal,
        };
      });

      if ("error" in result && result.error === "NOT_FOUND") {
        return res.status(404).json(
          apiError({
            code: "NOT_FOUND",
            reason: "CONTAINER_NOT_FOUND",
            message: "Container not found",
            requestId,
          }),
        );
      }

      logAudit({
        clinicId,
        actionType: "container_restock",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email,
        targetId: req.params.id,
        targetType: "container",
        metadata: { consumed: result.consumed },
      });

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({
          code: "INTERNAL_ERROR",
          reason: "RESTOCK_FAILED",
          message: "Restock failed",
          requestId,
        }),
      );
    }
  },
);

router.post(
  "/:id/blind-audit",
  requireAuth,
  requireEffectiveRole("technician"),
  validateUuid("id"),
  validateBody(blindAuditSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const { physicalCount, note } = req.body as z.infer<typeof blindAuditSchema>;

      const result = await db.transaction(async (tx) => {
        const [c] = await tx
          .select()
          .from(containers)
          .where(and(eq(containers.clinicId, clinicId), eq(containers.id, req.params.id)))
          .limit(1);
        if (!c) return { error: "NOT_FOUND" as const };

        const variance = physicalCount - c.currentQuantity;
        const logId = randomUUID();
        await tx.insert(inventoryLogs).values({
          id: logId,
          clinicId,
          containerId: c.id,
          logType: "blind_audit",
          quantityBefore: c.currentQuantity,
          quantityAdded: 0,
          quantityAfter: physicalCount,
          consumedDerived: null,
          variance,
          animalId: null,
          roomId: c.roomId,
          note: note?.trim() || null,
          createdByUserId: req.authUser!.id,
        });

        await tx
          .update(containers)
          .set({ currentQuantity: physicalCount })
          .where(and(eq(containers.clinicId, clinicId), eq(containers.id, c.id)));

        return { ok: true as const, containerId: c.id, variance, logId };
      });

      if ("error" in result && result.error === "NOT_FOUND") {
        return res.status(404).json(
          apiError({
            code: "NOT_FOUND",
            reason: "CONTAINER_NOT_FOUND",
            message: "Container not found",
            requestId,
          }),
        );
      }

      await db.insert(auditLogs).values({
        id: randomUUID(),
        clinicId,
        actionType: "inventory_blind_audit",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email,
        targetId: req.params.id,
        targetType: "container",
        metadata: { variance: result.variance, note: note?.trim() ?? null },
      });

      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({
          code: "INTERNAL_ERROR",
          reason: "BLIND_AUDIT_FAILED",
          message: "Blind audit failed",
          requestId,
        }),
      );
    }
  },
);

export default router;
