import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, whatsappAlerts, equipment } from "../db.js";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { format } from "date-fns";
import { logAudit, resolveAuditActorRole } from "../lib/audit.js";

/**
 * Normalize to E.164 with leading '+' (for auth contexts).
 * NOTE (Clerk Dashboard): Israel (+972) SMS must be enabled in Clerk Dashboard →
 * Configure → User & Authentication → Phone numbers → SMS sending → Allowed countries.
 */
function normalizePhoneE164(phone: string): string {
  const trimmed = phone.trim();
  const stripped = trimmed.replace(/\D/g, "");
  if (trimmed.startsWith("+")) {
    return "+" + stripped;
  }
  if (stripped.startsWith("972")) {
    return "+" + stripped;
  }
  if (stripped.startsWith("05") && stripped.length >= 9 && stripped.length <= 10) {
    return "+972" + stripped.slice(1);
  }
  return "+" + stripped;
}

function normalizePhoneNumber(phone: string): string {
  return normalizePhoneE164(phone).replace(/^\+/, "");
}

/*
 * PERMISSIONS MATRIX — /api/whatsapp
 * ─────────────────────────────────────────────────────
 * POST /alert   technician+   Generate a WhatsApp alert deep-link for equipment
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

const VALID_STATUSES = ["ok", "issue", "maintenance", "sterilized", "overdue", "inactive"] as const;

const RTL = "\u202B";

function translateStatusToHebrew(status: string): string {
  switch (status) {
    case "ok":
      return "תקין";
    case "issue":
      return "תקלה";
    case "maintenance":
      return "תחזוקה";
    case "sterilized":
      return "מחוטא";
    case "overdue":
      return "באיחור";
    case "inactive":
      return "לא פעיל";
    default:
      return status;
  }
}

const whatsappAlertSchema = z.object({
  equipmentId: z.string().min(1, "equipmentId is required"),
  status: z.enum(VALID_STATUSES, {
    required_error: "status is required",
    invalid_type_error: "Invalid status",
  }),
  note: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
});

router.post("/alert", requireAuth, requireEffectiveRole("technician"), validateBody(whatsappAlertSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { equipmentId, status, note, phone } = req.body as z.infer<typeof whatsappAlertSchema>;

    const [item] = await db
      .select()
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

    const equipmentName = item.name;
    const timestamp = format(new Date(), "dd/MM/yyyy HH:mm");

    let message = `${RTL}🚨 התראת VetTrack

ציוד: ${equipmentName}
סטטוס: ${translateStatusToHebrew(status)}
זמן: ${timestamp}`;
    if (note) message += `\nהערה: ${note}`;
    message += `\n\nיש לטפל בנושא בהקדם.`;

    const encoded = encodeURIComponent(message);
    const waUrl = phone
      ? `https://wa.me/${normalizePhoneNumber(phone)}?text=${encoded}`
      : `https://wa.me/?text=${encoded}`;

    const alertId = randomUUID();
    await db.insert(whatsappAlerts).values({
      id: alertId,
      clinicId,
      equipmentId,
      equipmentName,
      status,
      note: note || null,
      phoneNumber: phone || null,
      message,
      waUrl,
    });

    logAudit({
      actorRole: resolveAuditActorRole(req),
      clinicId,
      actionType: "whatsapp_alert_created",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? "",
      targetId: alertId,
      targetType: "whatsapp_alert",
      metadata: { equipmentId, status },
    });

    res.json({ success: true, waUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "WHATSAPP_ALERT_CREATE_FAILED",
        message: "Failed to create WhatsApp alert",
        requestId,
      }),
    );
  }
});

export default router;
