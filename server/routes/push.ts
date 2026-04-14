import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, pushSubscriptions } from "../db.js";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { authSensitiveLimiter, pushTestLimiter } from "../middleware/rate-limiters.js";
import { sendPushToUser, getVapidPublicKey } from "../lib/push.js";

/*
 * PERMISSIONS MATRIX — /api/push
 * ─────────────────────────────────────────────────────
 * GET  /vapid-public-key   public        Retrieve VAPID public key
 * POST /subscribe          viewer+       Register push subscription
 * PATCH /subscribe         viewer+       Update subscription settings
 * DELETE /subscribe        viewer+       Remove push subscription
 * POST /test               viewer+       Send a test push notification to self
 * ─────────────────────────────────────────────────────
 */

const router = Router();

const subscribeSchema = z.object({
  endpoint: z.string().url("endpoint must be a valid URL"),
  keys: z.object({
    p256dh: z.string().min(1, "p256dh is required"),
    auth: z.string().min(1, "auth is required"),
  }),
  soundEnabled: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
  technicianReturnRemindersEnabled: z.boolean().optional(),
  seniorOwnReturnRemindersEnabled: z.boolean().optional(),
  seniorTeamOverdueAlertsEnabled: z.boolean().optional(),
  adminHourlySummaryEnabled: z.boolean().optional(),
});

const patchSubscribeSchema = z.object({
  endpoint: z.string().url("endpoint must be a valid URL"),
  soundEnabled: z.boolean().optional(),
  alertsEnabled: z.boolean().optional(),
  technicianReturnRemindersEnabled: z.boolean().optional(),
  seniorOwnReturnRemindersEnabled: z.boolean().optional(),
  seniorTeamOverdueAlertsEnabled: z.boolean().optional(),
  adminHourlySummaryEnabled: z.boolean().optional(),
});

const deleteSubscribeSchema = z.object({
  endpoint: z.string().min(1, "endpoint is required"),
});

router.get("/vapid-public-key", async (_req, res) => {
  const key = await getVapidPublicKey();
  if (!key) return res.status(503).json({ error: "Push notifications not configured" });
  res.json({ publicKey: key });
});

router.post("/subscribe", requireAuth, authSensitiveLimiter, validateBody(subscribeSchema), async (req, res) => {
  try {
    const {
      endpoint,
      keys,
      soundEnabled,
      alertsEnabled,
      technicianReturnRemindersEnabled,
      seniorOwnReturnRemindersEnabled,
      seniorTeamOverdueAlertsEnabled,
      adminHourlySummaryEnabled,
    } = req.body as z.infer<typeof subscribeSchema>;

    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint));

    const [sub] = await db
      .insert(pushSubscriptions)
      .values({
        id: randomUUID(),
        userId: req.authUser!.id,
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        soundEnabled: soundEnabled !== false,
        alertsEnabled: alertsEnabled !== false,
        technicianReturnRemindersEnabled: technicianReturnRemindersEnabled !== false,
        seniorOwnReturnRemindersEnabled: seniorOwnReturnRemindersEnabled !== false,
        seniorTeamOverdueAlertsEnabled: seniorTeamOverdueAlertsEnabled !== false,
        adminHourlySummaryEnabled: adminHourlySummaryEnabled !== false,
      })
      .returning();

    res.status(201).json({ success: true, id: sub.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

router.patch("/subscribe", requireAuth, validateBody(patchSubscribeSchema), async (req, res) => {
  try {
    const {
      endpoint,
      soundEnabled,
      alertsEnabled,
      technicianReturnRemindersEnabled,
      seniorOwnReturnRemindersEnabled,
      seniorTeamOverdueAlertsEnabled,
      adminHourlySummaryEnabled,
    } = req.body as z.infer<typeof patchSubscribeSchema>;

    await db
      .update(pushSubscriptions)
      .set({
        ...(soundEnabled !== undefined && { soundEnabled }),
        ...(alertsEnabled !== undefined && { alertsEnabled }),
        ...(technicianReturnRemindersEnabled !== undefined && { technicianReturnRemindersEnabled }),
        ...(seniorOwnReturnRemindersEnabled !== undefined && { seniorOwnReturnRemindersEnabled }),
        ...(seniorTeamOverdueAlertsEnabled !== undefined && { seniorTeamOverdueAlertsEnabled }),
        ...(adminHourlySummaryEnabled !== undefined && { adminHourlySummaryEnabled }),
      })
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, req.authUser!.id)
        )
      );

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update subscription settings" });
  }
});

router.delete("/subscribe", requireAuth, validateBody(deleteSubscribeSchema), async (req, res) => {
  try {
    const { endpoint } = req.body as z.infer<typeof deleteSubscribeSchema>;

    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, endpoint),
          eq(pushSubscriptions.userId, req.authUser!.id)
        )
      );

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove subscription" });
  }
});

router.post("/test", requireAuth, pushTestLimiter, async (req, res) => {
  try {
    await sendPushToUser(req.authUser!.id, {
      title: "VetTrack Test",
      body: "Push notifications are working correctly on this device!",
      tag: "test",
      url: "/",
    });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to send test notification" });
  }
});

export default router;
