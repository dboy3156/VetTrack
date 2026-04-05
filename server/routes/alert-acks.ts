import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, alertAcks } from "../db.js";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { sendPushToOthers, checkDedupe } from "../lib/push.js";

/*
 * PERMISSIONS MATRIX — /api/alert-acks
 * ─────────────────────────────────────────────────────
 * GET  /             viewer+       Read current acknowledgments
 * POST /             technician+   Claim an alert ("I'm handling this")
 * DELETE /           technician+   Remove an acknowledgment
 * ─────────────────────────────────────────────────────
 */

const router = Router();

const VALID_ALERT_TYPES = ["issue", "overdue", "maintenance", "sterilization_due"] as const;

const createAckSchema = z.object({
  equipmentId: z.string().min(1, "equipmentId is required"),
  alertType: z.string().min(1, "alertType is required"),
});

// GET /api/alert-acks — return all current acknowledgments
router.get("/", requireAuth, async (_req, res) => {
  try {
    const acks = await db.select().from(alertAcks);
    res.json(acks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch acknowledgments" });
  }
});

// POST /api/alert-acks — claim an alert ("I'm handling this") — technician+ only
router.post("/", requireAuth, requireRole("technician"), validateBody(createAckSchema), async (req, res) => {
  try {
    const { equipmentId, alertType } = req.body as z.infer<typeof createAckSchema>;

    // Upsert: delete existing + insert new
    await db
      .delete(alertAcks)
      .where(
        and(eq(alertAcks.equipmentId, equipmentId), eq(alertAcks.alertType, alertType))
      );

    const REMINDER_DELAY_MS = Number(process.env.ALERT_REMINDER_DELAY_MS) || 30 * 60 * 1000;
    const CRITICAL_HIGH_ALERT_TYPES = new Set(["issue", "overdue"]);
    const remindAt = CRITICAL_HIGH_ALERT_TYPES.has(alertType)
      ? new Date(Date.now() + REMINDER_DELAY_MS)
      : null;

    const [ack] = await db
      .insert(alertAcks)
      .values({
        id: randomUUID(),
        equipmentId,
        alertType,
        acknowledgedById: req.authUser!.id,
        acknowledgedByEmail: req.authUser!.email,
        remindAt,
      })
      .returning();

    res.status(201).json(ack);

    const key = `ack:${equipmentId}:${alertType}`;
    if (!checkDedupe(equipmentId, key)) {
      sendPushToOthers(req.authUser!.id, {
        title: "Alert Acknowledged",
        body: `${req.authUser!.email} is handling the ${alertType.replace(/_/g, " ")} alert`,
        tag: `ack:${equipmentId}:${alertType}`,
        url: `/`,
      }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

// DELETE /api/alert-acks?equipmentId=...&alertType=... — remove acknowledgment — technician+
router.delete("/", requireAuth, requireRole("technician"), async (req, res) => {
  try {
    const equipmentId = req.query.equipmentId as string | undefined;
    const alertType = req.query.alertType as string | undefined;
    if (!equipmentId || !alertType) {
      return res.status(400).json({ error: "equipmentId and alertType query parameters required" });
    }
    await db
      .delete(alertAcks)
      .where(
        and(eq(alertAcks.equipmentId, equipmentId), eq(alertAcks.alertType, alertType))
      );
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove acknowledgment" });
  }
});

export default router;
