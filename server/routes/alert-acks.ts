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

// GET /api/alert-acks — return all current acknowledgments
router.get("/", requireAuth, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const acks = await db.select().from(alertAcks).where(eq(alertAcks.clinicId, clinicId));
    res.json(acks);
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ALERT_ACKS_LIST_FAILED",
        message: "הבאת אישורי ההתראות נכשלה",
        requestId,
      }),
    );
  }
});

// POST /api/alert-acks — claim an alert ("I'm handling this") — technician+ only
router.post("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { equipmentId, alertType } = req.body;
    if (!equipmentId || !alertType) {
      return res.status(400).json(
        apiError({
          code: "VALIDATION_FAILED",
          reason: "MISSING_ALERT_ACK_FIELDS",
          message: "equipmentId and alertType required",
          requestId,
        }),
      );
    }

    // Upsert: delete existing + insert new
    await db
      .delete(alertAcks)
      .where(
        and(
          eq(alertAcks.clinicId, clinicId),
          eq(alertAcks.equipmentId, equipmentId),
          eq(alertAcks.alertType, alertType)
        )
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
        clinicId,
        equipmentId,
        alertType,
        acknowledgedById: req.authUser!.id,
        acknowledgedByEmail: req.authUser!.email,
        remindAt,
      })
      .returning();

    logAudit({
      clinicId,
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
      sendPushToOthers(clinicId, req.authUser!.id, {
        title: "Alert Acknowledged",
        body: `${req.authUser!.email} is handling the ${alertType.replace(/_/g, " ")} alert`,
        tag: `ack:${equipmentId}:${alertType}`,
        url: `/`,
      }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ALERT_ACK_CREATE_FAILED",
        message: "אישור ההתראה נכשל",
        requestId,
      }),
    );
  }
});

// DELETE /api/alert-acks?equipmentId=...&alertType=... — remove acknowledgment — technician+
router.delete("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const equipmentId = req.query.equipmentId as string | undefined;
    const alertType = req.query.alertType as string | undefined;
    if (!equipmentId || !alertType) {
      return res.status(400).json(
        apiError({
          code: "VALIDATION_FAILED",
          reason: "MISSING_ALERT_ACK_QUERY_FIELDS",
          message: "equipmentId and alertType query parameters required",
          requestId,
        }),
      );
    }
    await db
      .delete(alertAcks)
      .where(
        and(
          eq(alertAcks.clinicId, clinicId),
          eq(alertAcks.equipmentId, equipmentId),
          eq(alertAcks.alertType, alertType)
        )
      );

    logAudit({
      clinicId,
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
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ALERT_ACK_DELETE_FAILED",
        message: "הסרת אישור ההתראה נכשלה",
        requestId,
      }),
    );
  }
});

export default router;
