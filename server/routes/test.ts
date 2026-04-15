import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
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

const router = Router();

function requireTestMode(_req: Request, res: Response, next: NextFunction) {
  if (!isTestMode()) {
    return res.status(404).json({ error: "Not found" });
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
    const { equipmentId } = req.body as z.infer<typeof createScenarioSchema>;
    const userId = req.authUser!.id;

    const [item] = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        checkedOutById: equipment.checkedOutById,
      })
      .from(equipment)
      .where(and(eq(equipment.id, equipmentId), isNull(equipment.deletedAt)))
      .limit(1);

    if (!item) {
      return res.status(404).json({ error: "Equipment not found" });
    }
    if (item.checkedOutById !== userId) {
      return res.status(409).json({ error: "Equipment must be checked out by you for this scenario" });
    }

    await db
      .delete(scheduledNotifications)
      .where(
        and(
          eq(scheduledNotifications.type, "return_reminder"),
          eq(scheduledNotifications.userId, userId),
          eq(scheduledNotifications.equipmentId, equipmentId),
          isNull(scheduledNotifications.sentAt)
        )
      );

    const [row] = await db
      .insert(scheduledNotifications)
      .values({
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
    .where(eq(scheduledNotifications.userId, userId))
    .orderBy(desc(scheduledNotifications.scheduledAt))
    .limit(100);

  res.json({ notifications: rows });
});

export default router;
