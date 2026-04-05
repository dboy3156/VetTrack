import { Router } from "express";
import { randomUUID } from "crypto";
import { db, whatsappAlerts, equipment } from "../db.js";
import { eq } from "drizzle-orm";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { format } from "date-fns";

const router = Router();

router.post("/alert", requireAuth, requireRole("technician"), async (req, res) => {
  try {
    const { equipmentId, status, note, phone } = req.body;
    if (!equipmentId || !status) {
      return res.status(400).json({ error: "equipmentId and status required" });
    }

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
      ? `https://wa.me/${phone.replace(/\D/g, "")}?text=${encoded}`
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
