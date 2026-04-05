import { Router } from "express";
import { randomUUID } from "crypto";
import { db, pushSubscriptions } from "../db.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { sendPushToUser, getVapidPublicKey } from "../lib/push.js";

const router = Router();

router.get("/vapid-public-key", async (_req, res) => {
  const key = await getVapidPublicKey();
  if (!key) return res.status(503).json({ error: "Push notifications not configured" });
  res.json({ publicKey: key });
});

router.post("/subscribe", requireAuth, async (req, res) => {
  try {
    const { endpoint, keys, soundEnabled, alertsEnabled } = req.body as {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      soundEnabled?: boolean;
      alertsEnabled?: boolean;
    };

    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ error: "Invalid subscription object" });
    }

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
      })
      .returning();

    res.status(201).json({ success: true, id: sub.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to save subscription" });
  }
});

router.patch("/subscribe", requireAuth, async (req, res) => {
  try {
    const { endpoint, soundEnabled, alertsEnabled } = req.body as {
      endpoint?: string;
      soundEnabled?: boolean;
      alertsEnabled?: boolean;
    };

    if (!endpoint) return res.status(400).json({ error: "endpoint required" });

    await db
      .update(pushSubscriptions)
      .set({
        ...(soundEnabled !== undefined && { soundEnabled }),
        ...(alertsEnabled !== undefined && { alertsEnabled }),
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

router.delete("/subscribe", requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body as { endpoint?: string };
    if (!endpoint) return res.status(400).json({ error: "endpoint required" });

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

router.post("/test", requireAuth, async (req, res) => {
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
