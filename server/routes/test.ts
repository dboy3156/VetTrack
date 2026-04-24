import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, desc, eq, isNull, lte, sql } from "drizzle-orm";
import { animals, billingLedger, db, equipment, equipmentReturns, inventoryLogs, scheduledNotifications, users } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { isTestMode } from "../lib/test-mode.js";
import {
  runHourlySmartNotifications,
  runScheduledNotifications,
} from "../lib/role-notification-scheduler.js";
import { runExpiryCheckWorker } from "../workers/expiryCheckWorker.js";
import { runChargeAlertJobForReturn } from "../workers/chargeAlertWorker.js";

const router = Router();

function resolveRequestId(
  res: { getHeader: (name: string) => unknown; setHeader?: (name: string, value: string) => void },
  incomingHeader: unknown,
): string {
  const incoming = typeof incomingHeader === "string" ? incomingHeader.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incoming || fromRes || randomUUID();
  if (typeof res.setHeader === "function") {
    res.setHeader("x-request-id", requestId);
  }
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

function requireNotProduction(_req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "production") {
    const requestId = resolveRequestId(res, _req.headers["x-request-id"]);
    return res.status(403).json(
      apiError({
        code: "FORBIDDEN",
        reason: "NOT_AVAILABLE_IN_PRODUCTION",
        message: "Not available in production",
        requestId,
      }),
    );
  }
  next();
}

router.use(requireNotProduction);

function requireTestMode(_req: Request, res: Response, next: NextFunction) {
  if (!isTestMode()) {
    const requestId = resolveRequestId(res, _req.headers["x-request-id"]);
    return res.status(404).json(
      apiError({
        code: "NOT_FOUND",
        reason: "TEST_MODE_DISABLED",
        message: "Not found",
        requestId,
      }),
    );
  }
  next();
}

const createScenarioSchema = z.object({
  equipmentId: z.string().uuid(),
});

/** POST /api/test/run-scheduler — run scheduled notification processors once (return reminders + smart hourly). */
router.post("/run-scheduler", requireAuth, requireTestMode, async (_req, res) => {
  await runScheduledNotifications();
  await runHourlySmartNotifications({ force: true });
  res.json({ success: true });
});

/** POST /api/test/create-scenario — insert a due return_reminder for equipment you have checked out (for push testing). */
router.post(
  "/create-scenario",
  requireAuth,
  requireTestMode,
  validateBody(createScenarioSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    const { equipmentId } = req.body as z.infer<typeof createScenarioSchema>;
    const clinicId = req.clinicId!;
    const userId = req.authUser!.id;

    const [item] = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        checkedOutById: equipment.checkedOutById,
      })
      .from(equipment)
      .where(and(eq(equipment.clinicId, clinicId), eq(equipment.id, equipmentId), isNull(equipment.deletedAt)))
      .limit(1);

    if (!item) {
      return res.status(404).json(
        apiError({
          code: "NOT_FOUND",
          reason: "EQUIPMENT_NOT_FOUND",
          message: "Equipment not found",
          requestId,
        }),
      );
    }
    if (item.checkedOutById !== userId) {
      return res.status(409).json(
        apiError({
          code: "CONFLICT",
          reason: "EQUIPMENT_NOT_CHECKED_OUT_BY_USER",
          message: "Equipment must be checked out by you for this scenario",
          requestId,
        }),
      );
    }

    await db
      .delete(scheduledNotifications)
      .where(
        and(
          eq(scheduledNotifications.type, "return_reminder"),
          eq(scheduledNotifications.clinicId, clinicId),
          eq(scheduledNotifications.userId, userId),
          eq(scheduledNotifications.equipmentId, equipmentId),
          isNull(scheduledNotifications.sentAt)
        )
      );

    const [row] = await db
      .insert(scheduledNotifications)
      .values({
        clinicId,
        type: "return_reminder",
        userId,
        equipmentId,
        scheduledAt: new Date(Date.now() - 2_000),
        payload: { equipmentName: item.name, testScenario: true },
      })
      .returning({ id: scheduledNotifications.id });

    res.status(201).json({ success: true, scheduledNotificationId: row?.id });
  }
);

/** GET /api/test/notifications — recent scheduled notifications for the current user. */
router.get("/notifications", requireAuth, requireTestMode, async (req, res) => {
  const userId = req.authUser!.id;
  const clinicId = req.clinicId!;
  const rows = await db
    .select({
      id: scheduledNotifications.id,
      type: scheduledNotifications.type,
      equipmentId: scheduledNotifications.equipmentId,
      scheduledAt: scheduledNotifications.scheduledAt,
      sentAt: scheduledNotifications.sentAt,
      payload: scheduledNotifications.payload,
    })
    .from(scheduledNotifications)
    .where(and(eq(scheduledNotifications.clinicId, clinicId), eq(scheduledNotifications.userId, userId)))
    .orderBy(desc(scheduledNotifications.scheduledAt))
    .limit(100);

  res.json({ notifications: rows });
});

/** POST /api/test/expiry-check/run — run expiry-check worker once. */
router.post("/expiry-check/run", requireAuth, requireTestMode, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const notifiedCount = await runExpiryCheckWorker();
    res.json({ success: true, notifiedCount });
  } catch (error) {
    console.error("[test] expiry-check run failed", error);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "EXPIRY_CHECK_RUN_FAILED",
        message: "Failed to run expiry check",
        requestId,
      }),
    );
  }
});

const runChargeAlertSchema = z.object({
  returnId: z.string().uuid(),
});

/** POST /api/test/charge-alert/run — run a single charge-alert job by return id. */
router.post("/charge-alert/run", requireAuth, requireTestMode, validateBody(runChargeAlertSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const { returnId } = req.body as z.infer<typeof runChargeAlertSchema>;
    const clinicId = req.clinicId!;
    const { notified } = await runChargeAlertJobForReturn(returnId, clinicId);
    res.json({ success: true, alerted: notified });
  } catch (error) {
    console.error("[test] charge-alert run failed", error);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "CHARGE_ALERT_RUN_FAILED",
        message: "Failed to run charge alert",
        requestId,
      }),
    );
  }
});

router.get("/returns/:id", requireAuth, requireTestMode, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  const returnId = req.params.id;
  try {
    const [row] = await db
      .select()
      .from(equipmentReturns)
      .where(and(eq(equipmentReturns.id, returnId), eq(equipmentReturns.clinicId, clinicId)))
      .limit(1);
    if (!row) {
      return res.status(404).json(
        apiError({
          code: "NOT_FOUND",
          reason: "RETURN_NOT_FOUND",
          message: "Return not found",
          requestId,
        }),
      );
    }
    res.json({ return: row });
  } catch (error) {
    console.error("[test] returns fetch failed", error);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "RETURN_FETCH_FAILED",
        message: "Failed to fetch return",
        requestId,
      }),
    );
  }
});

/**
 * GET /api/test/last-dispense
 * Returns the last 3 adjustment inventory logs for this clinic with DB verification fields.
 * Used by the dispense walkthrough to verify DB state after a dispense action.
 * Non-production only (enforced by requireNotProduction middleware above).
 */
router.get("/last-dispense", requireAuth, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;

    const logs = await db
      .select({
        id: inventoryLogs.id,
        containerId: inventoryLogs.containerId,
        quantityAdded: inventoryLogs.quantityAdded,
        animalId: inventoryLogs.animalId,
        createdByUserId: inventoryLogs.createdByUserId,
        createdAt: inventoryLogs.createdAt,
        metadata: inventoryLogs.metadata,
        animalName: animals.name,
        createdByDisplayName: users.displayName,
      })
      .from(inventoryLogs)
      .leftJoin(animals, eq(inventoryLogs.animalId, animals.id))
      .leftJoin(users, eq(inventoryLogs.createdByUserId, users.id))
      .where(
        and(
          eq(inventoryLogs.clinicId, clinicId),
          eq(inventoryLogs.logType, "adjustment"),
          lte(inventoryLogs.quantityAdded, 0),
        ),
      )
      .orderBy(desc(inventoryLogs.createdAt))
      .limit(3);

    // Count pending emergencies — filter at SQL level to avoid full table scan
    const [pendingRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryLogs)
      .where(
        and(
          eq(inventoryLogs.clinicId, clinicId),
          eq(inventoryLogs.logType, "adjustment"),
          sql`${inventoryLogs.metadata}->>'isEmergency' = 'true'`,
          sql`${inventoryLogs.metadata}->>'pendingCompletion' = 'true'`,
        ),
      );
    const pendingEmergencies = pendingRow?.count ?? 0;

    // Check if last log has a billing entry
    const lastLog = logs[0];
    let lastBillingEntry = null;
    if (lastLog?.animalId) {
      const [billing] = await db
        .select()
        .from(billingLedger)
        .where(
          and(
            eq(billingLedger.clinicId, clinicId),
            eq(billingLedger.animalId, lastLog.animalId),
          ),
        )
        .orderBy(desc(billingLedger.createdAt))
        .limit(1);
      lastBillingEntry = billing ?? null;
    }

    res.json({
      logs: logs.map((l) => ({
        id: l.id,
        containerId: l.containerId,
        quantityAdded: l.quantityAdded,
        animalId: l.animalId,
        animalName: l.animalName,
        createdByUserId: l.createdByUserId,
        createdByDisplayName: l.createdByDisplayName,
        createdAt: l.createdAt,
        metadata: l.metadata,
      })),
      pendingEmergencies,
      lastBillingEntry: lastBillingEntry
        ? {
            id: lastBillingEntry.id,
            status: lastBillingEntry.status,
            animalId: lastBillingEntry.animalId,
            itemId: lastBillingEntry.itemId,
          }
        : null,
    });
  } catch (err) {
    console.error("[test] last-dispense failed", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "LAST_DISPENSE_FAILED",
        message: "Failed to fetch last dispense",
        requestId,
      }),
    );
  }
});

export default router;
