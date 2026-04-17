import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db, equipment, scheduledNotifications } from "../db.js";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { isTestMode } from "../lib/test-mode.js";
import {
  runHourlySmartNotifications,
  runScheduledNotifications,
} from "../lib/role-notification-scheduler.js";
import { runExpiryCheckWorker } from "../workers/expiryCheckWorker.js";

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

export default router;
