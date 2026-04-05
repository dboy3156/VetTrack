import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, whatsappAlerts, equipment } from "../db.js";
import { eq } from "drizzle-orm";
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

const whatsappAlertSchema = z.object({
  equipmentId: z.string().min(1, "equipmentId is required"),
  status: z.string().min(1, "status is required").max(50),
  note: z.string().max(500).optional(),
  phone: z.string().max(30).optional(),
});

router.post("/alert", requireAuth, requireRole("technician"), validateBody(whatsappAlertSchema), async (req, res) => {
  try {
    const { equipmentId, status, note, phone } = req.body as z.infer<typeof whatsappAlertSchema>;

    const [item] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, equipmentId))
      .limit(1);

    const equipmentName = item?.name || "Unknown Equipment";
    const timestamp = format(new Date(), "MMM d, yyyy 'at' h:mm a");

    let message = `🚨 VetTrack Alert\n\nEquipment: *${equipmentName}*\nStatus: *${status.toUpperCase()}*\nTime: ${timestamp}`;
    if (note) message += `\nNote: ${note}`;
    message += `\n\nPlease address this issue immediately.`;

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
