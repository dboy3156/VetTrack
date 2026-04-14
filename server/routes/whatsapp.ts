import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, whatsappAlerts, equipment } from "../db.js";
import { and, eq, isNull } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { format } from "date-fns";

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

router.post("/alert", requireAuth, requireRole("technician"), validateBody(whatsappAlertSchema), async (req, res) => {
  try {
    const { equipmentId, status, note, phone } = req.body as z.infer<typeof whatsappAlertSchema>;

    const [item] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.id, equipmentId), isNull(equipment.deletedAt)))
      .limit(1);

    if (!item) {
      return res.status(404).json({ error: "Equipment not found" });
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

    await db.insert(whatsappAlerts).values({
      id: randomUUID(),
      equipmentId,
      equipmentName,
      status,
      note: note || null,
      phoneNumber: phone || null,
      message,
      waUrl,
    });

    res.json({ success: true, waUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create WhatsApp alert" });
  }
});

export default router;
