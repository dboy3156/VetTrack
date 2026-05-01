import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { animals, billingLedger, containerItems, containers, db, inventoryItems, inventoryLogs, users } from "../db.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { idempotencyMiddleware } from "../middleware/idempotency.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { seedDefaultContainersIfEmpty } from "../lib/ensure-clinic-phase2-defaults.js";
import { restockContainerInTx } from "../services/inventory.service.js";
import { resolveBlueprintEntryForContainerName } from "../config/inventoryBlueprint.js";
import { enqueueBillingWebhookJob } from "../lib/queue.js";
import { logAudit, resolveAuditActorRole } from "../lib/audit.js";
import { captureConsumableBillingForDispenseLine } from "../lib/container-consumable-billing.js";
import { insertRealtimeDomainEvent } from "../lib/realtime-outbox.js";
import { evaluateDispenseAgainstOrders } from "../lib/dispense-order-validation.js";

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

router.post("/bootstrap-defaults", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const inserted = await seedDefaultContainersIfEmpty(clinicId);
    if (inserted > 0) {
      logAudit({
        actorRole: resolveAuditActorRole(req),
        clinicId,
        actionType: "containers_defaults_seeded",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email ?? "",
        metadata: { inserted },
      });
    }
    res.json({ inserted });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "CONTAINERS_BOOTSTRAP_FAILED",
        message: "Failed to seed default containers",
        requestId,
      }),
    );
  }
});

router.get("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const nfcTagId = typeof req.query.nfcTagId === "string" ? req.query.nfcTagId.trim() : null;

    if (nfcTagId) {
      // Lookup by NFC tag — return single container with items or 404
      const [container] = await db
        .select()
        .from(containers)
        .where(and(eq(containers.clinicId, clinicId), eq(containers.nfcTagId, nfcTagId)))
        .limit(1);

      if (!container) {
        return res.status(404).json(
          apiError({ code: "NOT_FOUND", reason: "CONTAINER_NOT_FOUND", message: "No container found for this NFC tag", requestId }),
        );
      }

      const items = await db
        .select({
          id: containerItems.id,
          itemId: containerItems.itemId,
          quantity: containerItems.quantity,
          label: inventoryItems.label,
          code: inventoryItems.code,
        })
        .from(containerItems)
        .leftJoin(inventoryItems, eq(containerItems.itemId, inventoryItems.id))
        .where(and(eq(containerItems.clinicId, clinicId), eq(containerItems.containerId, container.id)));

      return res.json({ ...container, items });
    }

    const rows = await db
      .select()
      .from(containers)
      .where(eq(containers.clinicId, clinicId))
      .orderBy(asc(containers.name));
    const ids = rows.map((row) => row.id);
    const aggregateRows = ids.length
      ? await db
          .select({
            containerId: containerItems.containerId,
            quantity: sql<number>`COALESCE(SUM(${containerItems.quantity}), 0)`,
          })
          .from(containerItems)
          .where(and(eq(containerItems.clinicId, clinicId), inArray(containerItems.containerId, ids)))
          .groupBy(containerItems.containerId)
      : [];
    const qtyByContainerId = new Map(aggregateRows.map((row) => [row.containerId, Number(row.quantity)]));
    const withBlueprintTargets = rows.map((row) => {
      const entry = resolveBlueprintEntryForContainerName(row.name);
      const currentQuantity = qtyByContainerId.get(row.id) ?? row.currentQuantity;
      return {
        ...row,
        currentQuantity,
        supplyTargets: entry?.supplyTargets ?? [],
      };
    });
    res.json(withBlueprintTargets);
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
      const [row] = await db
        .select()
        .from(containers)
        .where(and(eq(containers.clinicId, clinicId), eq(containers.id, id)))
        .limit(1);
      logAudit({
        actorRole: resolveAuditActorRole(req),
        clinicId,
        actionType: "container_created",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email ?? "",
        targetId: id,
        targetType: "container",
        metadata: { name: b.name.trim() },
      });
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
    return res.status(409).json(
      apiError({
        code: "LEGACY_RESTOCK_DISABLED",
        reason: "LEGACY_RESTOCK_DISABLED",
        message: "Legacy restock endpoint is disabled. Use restock sessions.",
        requestId,
      }),
    );
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
    return res.status(409).json(
      apiError({
        code: "LEGACY_RESTOCK_DISABLED",
        reason: "LEGACY_RESTOCK_DISABLED",
        message: "Legacy blind-audit endpoint is disabled. Use restock sessions.",
        requestId,
      }),
    );
  },
);

// ─── Dispense schemas ─────────────────────────────────────────────────────────

const dispenseSchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string().min(1),
      quantity: z.number().int().min(1),
    }),
  ),
  animalId: z.string().nullable().optional(),
  isEmergency: z.boolean().optional().default(false),
});

const completeEmergencySchema = z.object({
  items: z.array(
    z.object({
      itemId: z.string().min(1),
      quantity: z.number().int().min(1),
    }),
  ),
  animalId: z.string().nullable().optional(),
});

const reconcileUnusedChargeSchema = z.object({
  billingLedgerId: z.string().uuid(),
  note: z.string().max(500).optional(),
});

// POST /api/containers/:id/dispense
router.post(
  "/:id/dispense",
  requireAuth,
  requireEffectiveRole("technician"),
  idempotencyMiddleware("containers.dispense"),
  validateUuid("id"),
  validateBody(dispenseSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const actorUserId = req.authUser!.id;
      const actorDisplayName = req.authUser!.name || req.authUser!.email;
      const containerId = req.params.id;
      const body = req.body as z.infer<typeof dispenseSchema>;
      const { isEmergency, animalId } = body;
      const takenAt = new Date();

      if (isEmergency) {
        // Emergency dispense: just log it, no stock changes
        const emergencyEventId = randomUUID();
        await db.transaction(async (tx) => {
          const [container] = await tx
            .select()
            .from(containers)
            .where(and(eq(containers.clinicId, clinicId), eq(containers.id, containerId)))
            .limit(1);
          if (!container) throw Object.assign(new Error("CONTAINER_NOT_FOUND"), { statusCode: 404 });

          await tx.insert(inventoryLogs).values({
            id: emergencyEventId,
            clinicId,
            containerId,
            taskId: null,
            logType: "adjustment",
            quantityBefore: 0,
            quantityAdded: 0,
            quantityAfter: 0,
            animalId: null,
            roomId: container.roomId,
            note: "emergency",
            metadata: { isEmergency: true, containerId, pendingCompletion: true },
            createdByUserId: actorUserId,
          });
        });

        return res.json({
          success: true,
          emergencyEventId,
          takenBy: { userId: actorUserId, displayName: actorDisplayName },
          takenAt: takenAt.toISOString(),
        });
      }

      // Normal dispense — billing ledger rows commit with inventory logs (revenue invariant).
      const dispensedItems: Array<{ itemId: string; label: string; quantity: number; newStock: number }> = [];
      const billingIds: string[] = [];
      let autoBilledCents = 0;

      await db.transaction(async (tx) => {
        const validationLines: Array<{
          itemId: string;
          quantity: number;
          label: string;
          code: string;
        }> = [];

        const [container] = await tx
          .select()
          .from(containers)
          .where(and(eq(containers.clinicId, clinicId), eq(containers.id, containerId)))
          .limit(1);
        if (!container) throw Object.assign(new Error("CONTAINER_NOT_FOUND"), { statusCode: 404 });

        for (const lineItem of body.items) {
          const [ci] = await tx
            .select()
            .from(containerItems)
            .where(
              and(
                eq(containerItems.clinicId, clinicId),
                eq(containerItems.containerId, containerId),
                eq(containerItems.itemId, lineItem.itemId),
              ),
            )
            .limit(1);

          if (!ci) {
            throw Object.assign(new Error("ITEM_NOT_IN_CONTAINER"), {
              statusCode: 409,
              code: "INSUFFICIENT_STOCK",
              itemId: lineItem.itemId,
              available: 0,
              requested: lineItem.quantity,
            });
          }

          if (ci.quantity < lineItem.quantity) {
            throw Object.assign(new Error("INSUFFICIENT_STOCK"), {
              statusCode: 409,
              code: "INSUFFICIENT_STOCK",
              itemId: lineItem.itemId,
              available: ci.quantity,
              requested: lineItem.quantity,
            });
          }

          const [item] = await tx
            .select({ label: inventoryItems.label, code: inventoryItems.code })
            .from(inventoryItems)
            .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.id, lineItem.itemId)))
            .limit(1);

          const newQty = ci.quantity - lineItem.quantity;

          await tx
            .update(containerItems)
            .set({ quantity: newQty, updatedAt: new Date() })
            .where(
              and(
                eq(containerItems.clinicId, clinicId),
                eq(containerItems.containerId, containerId),
                eq(containerItems.itemId, lineItem.itemId),
              ),
            );

          const inventoryLogId = randomUUID();
          const billing = await captureConsumableBillingForDispenseLine(tx, {
            clinicId,
            billingItemId: container.billingItemId,
            inventoryLogId,
            itemId: lineItem.itemId,
            quantity: lineItem.quantity,
            animalId: animalId ?? null,
          });
          if (!billing.billingEventId && !billing.exemptReason) {
            throw Object.assign(new Error("BILLING_CAPTURE_INVARIANT_VIOLATION"), { statusCode: 500 });
          }

          const metadata: Record<string, unknown> = { isEmergency: false, itemId: lineItem.itemId };
          if (billing.exemptReason) metadata.billingExemptReason = billing.exemptReason;

          await tx.insert(inventoryLogs).values({
            id: inventoryLogId,
            clinicId,
            containerId,
            taskId: null,
            logType: "adjustment",
            quantityBefore: ci.quantity,
            quantityAdded: -lineItem.quantity,
            quantityAfter: newQty,
            animalId: animalId ?? null,
            roomId: container.roomId,
            note: null,
            metadata,
            createdByUserId: actorUserId,
            billingEventId: billing.billingEventId,
          });

          if (billing.billingEventId) {
            billingIds.push(billing.billingEventId);
            autoBilledCents += billing.rowTotalCents;
          }

          validationLines.push({
            itemId: lineItem.itemId,
            quantity: lineItem.quantity,
            label: item?.label ?? lineItem.itemId,
            code: item?.code ?? "",
          });

          dispensedItems.push({
            itemId: lineItem.itemId,
            label: item?.label ?? lineItem.itemId,
            quantity: lineItem.quantity,
            newStock: newQty,
          });
        }

        const { orphanLines } = await evaluateDispenseAgainstOrders(tx, {
          clinicId,
          animalId: animalId ?? null,
          containerId,
          lines: validationLines,
        });

        let animalDisplayName: string | null = null;
        if (animalId) {
          const [an] = await tx
            .select({ name: animals.name })
            .from(animals)
            .where(and(eq(animals.clinicId, clinicId), eq(animals.id, animalId)))
            .limit(1);
          animalDisplayName = an?.name?.trim() || null;
        }

        if (orphanLines.length > 0) {
          await insertRealtimeDomainEvent(tx, {
            clinicId,
            type: "POTENTIAL_ORPHAN_USE",
            payload: {
              animalId: animalId ?? null,
              animalDisplayName,
              sourceContainerId: containerId,
              technicianId: actorUserId,
              orphanLines,
              dispenseKind: "container_dispense",
            },
          });
        }

        await logAudit({
          tx,
          clinicId,
          actionType: "inventory_dispensed",
          performedBy: actorUserId,
          performedByEmail: req.authUser!.email ?? "",
          targetId: containerId,
          targetType: "container",
          actorRole: resolveAuditActorRole(req),
          metadata: {
            dispensedItemCount: dispensedItems.length,
            autoBilledCents,
            animalId: animalId ?? null,
            isEmergency: false,
          },
        });

        await insertRealtimeDomainEvent(tx, {
          clinicId,
          type: "INVENTORY_ALERT",
          payload: {
            kind: "container_dispense",
            containerId,
            sourceContainerId: containerId,
            technicianId: actorUserId,
            animalId: animalId ?? null,
            dispensedItemCount: dispensedItems.length,
            autoBilledCents,
            billingIds,
            orphanLineCount: orphanLines.length,
            lines: dispensedItems.map((d) => ({
              itemId: d.itemId,
              label: d.label,
              quantity: d.quantity,
              newStock: d.newStock,
            })),
          },
        });
      });

      // Fire billing webhooks for all billed entries (config lookup handled inside)
      try {
        for (const billingId of billingIds) {
          const [entry] = await db.select().from(billingLedger).where(eq(billingLedger.id, billingId)).limit(1);
          if (entry) {
            await enqueueBillingWebhookJob({
              clinicId,
              entry: {
                id: entry.id,
                animalId: entry.animalId,
                itemType: entry.itemType,
                itemId: entry.itemId,
                quantity: entry.quantity,
                unitPriceCents: entry.unitPriceCents,
                totalAmountCents: entry.totalAmountCents,
                status: entry.status,
                createdAt: entry.createdAt,
              },
            });
          }
        }
      } catch (webhookErr) {
        console.error("[billing-webhook] Failed to enqueue webhook for dispense, continuing:", webhookErr);
      }

      return res.json({
        success: true,
        dispensed: dispensedItems,
        takenBy: { userId: actorUserId, displayName: actorDisplayName },
        takenAt: takenAt.toISOString(),
        billingIds,
        autoBilledCents,
      });
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      if (e.code === "INSUFFICIENT_STOCK") {
        return res.status(409).json({
          code: "INSUFFICIENT_STOCK",
          error: "INSUFFICIENT_STOCK",
          reason: "Insufficient stock",
          message: "Insufficient stock for requested item",
          itemId: e.itemId,
          available: e.available,
          requested: e.requested,
          requestId,
        });
      }
      if ((e as { statusCode?: number }).statusCode === 404) {
        return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "CONTAINER_NOT_FOUND", message: "Container not found", requestId }));
      }
      console.error(err);
      return res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "DISPENSE_FAILED", message: "Failed to process dispense", requestId }));
    }
  },
);

// PATCH /api/containers/emergency/:eventId/complete
router.patch(
  "/emergency/:eventId/complete",
  requireAuth,
  requireEffectiveRole("technician"),
  idempotencyMiddleware("containers.emergency_complete"),
  validateBody(completeEmergencySchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const actorUserId = req.authUser!.id;
      const actorDisplayName = req.authUser!.name || req.authUser!.email;
      const eventId = req.params.eventId;
      const body = req.body as z.infer<typeof completeEmergencySchema>;
      const { animalId } = body;
      const takenAt = new Date();

      const dispensedItems: Array<{ itemId: string; label: string; quantity: number; newStock: number }> = [];
      const billingIds: string[] = [];
      let autoBilledCents = 0;

      await db.transaction(async (tx) => {
        const validationLines: Array<{
          itemId: string;
          quantity: number;
          label: string;
          code: string;
        }> = [];

        // Find the emergency event log
        const [origLog] = await tx
          .select()
          .from(inventoryLogs)
          .where(and(eq(inventoryLogs.clinicId, clinicId), eq(inventoryLogs.id, eventId)))
          .limit(1);

        if (!origLog) throw Object.assign(new Error("NOT_FOUND"), { statusCode: 404 });

        const meta = origLog.metadata as Record<string, unknown> | null;
        if (!meta?.isEmergency || !meta?.pendingCompletion) {
          throw Object.assign(new Error("NOT_FOUND"), { statusCode: 404 });
        }

        const containerId = origLog.containerId;

        const [container] = await tx
          .select()
          .from(containers)
          .where(and(eq(containers.clinicId, clinicId), eq(containers.id, containerId)))
          .limit(1);
        if (!container) throw Object.assign(new Error("NOT_FOUND"), { statusCode: 404 });

        for (const lineItem of body.items) {
          const [ci] = await tx
            .select()
            .from(containerItems)
            .where(
              and(
                eq(containerItems.clinicId, clinicId),
                eq(containerItems.containerId, containerId),
                eq(containerItems.itemId, lineItem.itemId),
              ),
            )
            .limit(1);

          if (!ci || ci.quantity < lineItem.quantity) {
            throw Object.assign(new Error("INSUFFICIENT_STOCK"), {
              statusCode: 409,
              code: "INSUFFICIENT_STOCK",
              itemId: lineItem.itemId,
              available: ci?.quantity ?? 0,
              requested: lineItem.quantity,
            });
          }

          const [item] = await tx
            .select({ label: inventoryItems.label, code: inventoryItems.code })
            .from(inventoryItems)
            .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.id, lineItem.itemId)))
            .limit(1);

          const newQty = ci.quantity - lineItem.quantity;

          await tx
            .update(containerItems)
            .set({ quantity: newQty, updatedAt: new Date() })
            .where(
              and(
                eq(containerItems.clinicId, clinicId),
                eq(containerItems.containerId, containerId),
                eq(containerItems.itemId, lineItem.itemId),
              ),
            );

          const inventoryLogId = randomUUID();
          const billing = await captureConsumableBillingForDispenseLine(tx, {
            clinicId,
            billingItemId: container.billingItemId,
            inventoryLogId,
            itemId: lineItem.itemId,
            quantity: lineItem.quantity,
            animalId: animalId ?? null,
          });
          if (!billing.billingEventId && !billing.exemptReason) {
            throw Object.assign(new Error("BILLING_CAPTURE_INVARIANT_VIOLATION"), { statusCode: 500 });
          }

          const lineMeta: Record<string, unknown> = {
            isEmergency: true,
            emergencyEventId: eventId,
            itemId: lineItem.itemId,
          };
          if (billing.exemptReason) lineMeta.billingExemptReason = billing.exemptReason;

          await tx.insert(inventoryLogs).values({
            id: inventoryLogId,
            clinicId,
            containerId,
            taskId: null,
            logType: "adjustment",
            quantityBefore: ci.quantity,
            quantityAdded: -lineItem.quantity,
            quantityAfter: newQty,
            animalId: animalId ?? null,
            roomId: container.roomId,
            note: null,
            metadata: lineMeta,
            createdByUserId: origLog.createdByUserId,
            billingEventId: billing.billingEventId,
          });

          if (billing.billingEventId) {
            billingIds.push(billing.billingEventId);
            autoBilledCents += billing.rowTotalCents;
          }

          validationLines.push({
            itemId: lineItem.itemId,
            quantity: lineItem.quantity,
            label: item?.label ?? lineItem.itemId,
            code: item?.code ?? "",
          });

          dispensedItems.push({
            itemId: lineItem.itemId,
            label: item?.label ?? lineItem.itemId,
            quantity: lineItem.quantity,
            newStock: newQty,
          });
        }

        const { orphanLines } = await evaluateDispenseAgainstOrders(tx, {
          clinicId,
          animalId: animalId ?? null,
          containerId,
          lines: validationLines,
        });

        let animalDisplayNameEm: string | null = null;
        if (animalId) {
          const [an] = await tx
            .select({ name: animals.name })
            .from(animals)
            .where(and(eq(animals.clinicId, clinicId), eq(animals.id, animalId)))
            .limit(1);
          animalDisplayNameEm = an?.name?.trim() || null;
        }

        if (orphanLines.length > 0) {
          await insertRealtimeDomainEvent(tx, {
            clinicId,
            type: "POTENTIAL_ORPHAN_USE",
            payload: {
              animalId: animalId ?? null,
              animalDisplayName: animalDisplayNameEm,
              sourceContainerId: containerId,
              technicianId: actorUserId,
              orphanLines,
              dispenseKind: "emergency_dispense_complete",
              emergencyEventId: eventId,
            },
          });
        }

        // Mark original emergency log as completed
        await tx
          .update(inventoryLogs)
          .set({
            metadata: { ...meta, pendingCompletion: false },
          })
          .where(and(eq(inventoryLogs.clinicId, clinicId), eq(inventoryLogs.id, eventId)));

        await logAudit({
          tx,
          clinicId,
          actionType: "emergency_dispense_reconciled",
          performedBy: actorUserId,
          performedByEmail: req.authUser!.email ?? "",
          targetId: eventId,
          targetType: "emergency_event",
          actorRole: resolveAuditActorRole(req),
          metadata: {
            dispensedItemCount: dispensedItems.length,
            autoBilledCents,
            animalId: animalId ?? null,
            isEmergency: true,
          },
        });

        await insertRealtimeDomainEvent(tx, {
          clinicId,
          type: "INVENTORY_ALERT",
          payload: {
            kind: "emergency_dispense_complete",
            emergencyEventId: eventId,
            containerId,
            sourceContainerId: containerId,
            technicianId: actorUserId,
            animalId: animalId ?? null,
            dispensedItemCount: dispensedItems.length,
            autoBilledCents,
            billingIds,
            orphanLineCount: orphanLines.length,
            lines: dispensedItems.map((d) => ({
              itemId: d.itemId,
              label: d.label,
              quantity: d.quantity,
              newStock: d.newStock,
            })),
          },
        });
      });

      // Fire billing webhooks for all billed entries (config lookup handled inside)
      try {
        for (const billingId of billingIds) {
          const [entry] = await db.select().from(billingLedger).where(eq(billingLedger.id, billingId)).limit(1);
          if (entry) {
            await enqueueBillingWebhookJob({
              clinicId,
              entry: {
                id: entry.id,
                animalId: entry.animalId,
                itemType: entry.itemType,
                itemId: entry.itemId,
                quantity: entry.quantity,
                unitPriceCents: entry.unitPriceCents,
                totalAmountCents: entry.totalAmountCents,
                status: entry.status,
                createdAt: entry.createdAt,
              },
            });
          }
        }
      } catch (webhookErr) {
        console.error("[billing-webhook] Failed to enqueue webhook for emergency dispense, continuing:", webhookErr);
      }

      return res.json({
        success: true,
        dispensed: dispensedItems,
        takenBy: { userId: actorUserId, displayName: actorDisplayName },
        takenAt: takenAt.toISOString(),
        billingIds,
        autoBilledCents,
      });
    } catch (err: unknown) {
      const e = err as Record<string, unknown>;
      if (e.code === "INSUFFICIENT_STOCK") {
        return res.status(409).json({
          code: "INSUFFICIENT_STOCK",
          error: "INSUFFICIENT_STOCK",
          reason: "Insufficient stock",
          message: "Insufficient stock for requested item",
          itemId: e.itemId,
          available: e.available,
          requested: e.requested,
          requestId,
        });
      }
      if ((e as { statusCode?: number }).statusCode === 404) {
        return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "EVENT_NOT_FOUND", message: "Emergency event not found", requestId }));
      }
      console.error(err);
      return res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "COMPLETE_EMERGENCY_FAILED", message: "Failed to complete emergency", requestId }));
    }
  },
);

// POST /api/containers/reconcile-unused-charge — void patient charge + return units to cabinet (unused dispense).
router.post(
  "/reconcile-unused-charge",
  requireAuth,
  requireEffectiveRole("technician"),
  idempotencyMiddleware("containers.reconcile_unused"),
  validateBody(reconcileUnusedChargeSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const actorUserId = req.authUser!.id;
      const body = req.body as z.infer<typeof reconcileUnusedChargeSchema>;

      const result = await db.transaction(async (tx) => {
        const [ledger] = await tx
          .select()
          .from(billingLedger)
          .where(and(eq(billingLedger.clinicId, clinicId), eq(billingLedger.id, body.billingLedgerId)))
          .limit(1);
        if (!ledger) {
          throw Object.assign(new Error("NOT_FOUND"), { statusCode: 404 });
        }
        if (ledger.status === "voided") {
          throw Object.assign(new Error("ALREADY_VOIDED"), { statusCode: 409, code: "ALREADY_VOIDED" });
        }
        if (ledger.itemType !== "CONSUMABLE") {
          throw Object.assign(new Error("NOT_CONSUMABLE"), { statusCode: 400, code: "INVALID_CHARGE_TYPE" });
        }

        const [origLog] = await tx
          .select()
          .from(inventoryLogs)
          .where(and(eq(inventoryLogs.clinicId, clinicId), eq(inventoryLogs.billingEventId, body.billingLedgerId)))
          .limit(1);
        if (!origLog) {
          throw Object.assign(new Error("NO_INVENTORY_LOG"), { statusCode: 404 });
        }
        if (origLog.quantityAdded >= 0) {
          throw Object.assign(new Error("NOT_DISPENSE_LOG"), { statusCode: 400 });
        }

        const restoreQty = Math.abs(origLog.quantityAdded);
        const metaRaw = origLog.metadata as Record<string, unknown> | null;
        const itemIdForRow =
          typeof metaRaw?.itemId === "string" && metaRaw.itemId.trim().length > 0 ? metaRaw.itemId.trim() : null;
        if (!itemIdForRow) {
          throw Object.assign(new Error("MISSING_ITEM_ON_LOG"), { statusCode: 400 });
        }

        const [ci] = await tx
          .select()
          .from(containerItems)
          .where(
            and(
              eq(containerItems.clinicId, clinicId),
              eq(containerItems.containerId, origLog.containerId),
              eq(containerItems.itemId, itemIdForRow),
            ),
          )
          .limit(1);

        if (!ci) {
          throw Object.assign(new Error("CONTAINER_ITEM_NOT_FOUND"), { statusCode: 409 });
        }

        const newQty = ci.quantity + restoreQty;
        await tx
          .update(containerItems)
          .set({ quantity: newQty, updatedAt: new Date() })
          .where(
            and(
              eq(containerItems.clinicId, clinicId),
              eq(containerItems.containerId, origLog.containerId),
              eq(containerItems.itemId, itemIdForRow),
            ),
          );

        await tx
          .update(billingLedger)
          .set({ status: "voided" })
          .where(and(eq(billingLedger.clinicId, clinicId), eq(billingLedger.id, body.billingLedgerId)));

        const reconcileLogId = randomUUID();
        await tx.insert(inventoryLogs).values({
          id: reconcileLogId,
          clinicId,
          containerId: origLog.containerId,
          taskId: null,
          logType: "adjustment",
          quantityBefore: ci.quantity,
          quantityAdded: restoreQty,
          quantityAfter: newQty,
          animalId: origLog.animalId,
          roomId: origLog.roomId,
          note: body.note?.trim() || "reconcile_unused_charge",
          metadata: {
            kind: "reconcile_unused_charge",
            restoredBillingLedgerId: body.billingLedgerId,
            originalInventoryLogId: origLog.id,
          },
          createdByUserId: actorUserId,
          billingEventId: null,
        });

        await logAudit({
          tx,
          clinicId,
          actionType: "billing_voided",
          performedBy: actorUserId,
          performedByEmail: req.authUser!.email ?? "",
          targetId: body.billingLedgerId,
          targetType: "billing_ledger",
          actorRole: resolveAuditActorRole(req),
          metadata: {
            reason: "reconcile_unused_dispense",
            originalInventoryLogId: origLog.id,
            reconcileInventoryLogId: reconcileLogId,
            note: body.note ?? null,
          },
        });

        await insertRealtimeDomainEvent(tx, {
          clinicId,
          type: "INVENTORY_ALERT",
          payload: {
            kind: "reconcile_unused_charge",
            billingLedgerId: body.billingLedgerId,
            containerId: origLog.containerId,
            sourceContainerId: origLog.containerId,
            technicianId: actorUserId,
            restoredQuantity: restoreQty,
            itemId: itemIdForRow,
          },
        });

        await insertRealtimeDomainEvent(tx, {
          clinicId,
          type: "SHADOW_ORPHAN_ALERT_RESOLVED",
          payload: {
            billingLedgerId: body.billingLedgerId,
            inventoryLogId: origLog.id,
            resolution: "reconcile_unused_charge",
          },
        });

        return {
          billingLedgerId: body.billingLedgerId,
          restoredQuantity: restoreQty,
          containerId: origLog.containerId,
          newStock: newQty,
        };
      });

      return res.status(200).json({ success: true, ...result, requestId });
    } catch (err: unknown) {
      const e = err as Record<string, unknown> & { statusCode?: number };
      if (e.code === "ALREADY_VOIDED") {
        return res.status(409).json(apiError({ code: "CONFLICT", reason: "ALREADY_VOIDED", message: "Charge already voided", requestId }));
      }
      if (e.statusCode === 404 || e.message === "NOT_FOUND") {
        return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "LEDGER_NOT_FOUND", message: "Billing entry not found", requestId }));
      }
      if (e.message === "NO_INVENTORY_LOG") {
        return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "NO_INVENTORY_LOG", message: "No linked inventory log for this charge", requestId }));
      }
      console.error(err);
      return res.status(500).json(apiError({ code: "INTERNAL_ERROR", reason: "RECONCILE_FAILED", message: "Failed to reconcile charge", requestId }));
    }
  },
);

export default router;
