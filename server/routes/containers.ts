import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { containerItems, containers, db, inventoryLogs, auditLogs } from "../db.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";
import { seedDefaultContainersIfEmpty } from "../lib/ensure-clinic-phase2-defaults.js";
import { restockContainerInTx } from "../services/inventory.service.js";
import { resolveBlueprintEntryForContainerName } from "../config/inventoryBlueprint.js";

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

export default router;
