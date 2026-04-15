import { Router } from "express";
import { randomUUID } from "crypto";
import { db, alertAcks } from "../db.js";
import { eq, and } from "drizzle-orm";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { sendPushToOthers, checkDedupe } from "../lib/push.js";
import { logAudit } from "../lib/audit.js";

/*
 * PERMISSIONS MATRIX — /api/alert-acks
 * ─────────────────────────────────────────────────────
 * GET  /             viewer+       Read current acknowledgments
 * POST /             technician+   Claim an alert ("I'm handling this")
 * DELETE /           technician+   Remove an acknowledgment
 * ─────────────────────────────────────────────────────
 */

const router = Router();

// GET /api/alert-acks — return all current acknowledgments
router.get("/", requireAuth, async (_req, res) => {
  try {
    const acks = await db.select().from(alertAcks);
    res.json(acks);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "הבאת אישורי ההתראות נכשלה" });
  }
});

// POST /api/alert-acks — claim an alert ("I'm handling this") — technician+ only
router.post("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  try {
    const { equipmentId, alertType } = req.body;
    if (!equipmentId || !alertType) {
      return res.status(400).json({ error: "equipmentId and alertType required" });
    }

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

    logAudit({
      actionType: "alert_acknowledged",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: equipmentId,
      targetType: "equipment",
      metadata: { alertType, acknowledgedById: req.authUser!.id },
    });

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
    res.status(500).json({ error: "אישור ההתראה נכשל" });
  }
});

// DELETE /api/alert-acks?equipmentId=...&alertType=... — remove acknowledgment — technician+
router.delete("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
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

    logAudit({
      actionType: "alert_acknowledgment_removed",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: equipmentId,
      targetType: "equipment",
      metadata: { alertType },
    });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "הסרת אישור ההתראה נכשלה" });
  }
});

export default router;
