import { Router } from "express";
import { randomUUID } from "crypto";
import { db, alertAcks } from "../db.js";
import { eq, and } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

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

// POST /api/alert-acks — claim an alert ("I'm handling this")
router.post("/", requireAuth, async (req, res) => {
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

    const [ack] = await db
      .insert(alertAcks)
      .values({
        id: randomUUID(),
        equipmentId,
        alertType,
        acknowledgedById: req.authUser!.id,
        acknowledgedByEmail: req.authUser!.email,
      })
      .returning();

    res.status(201).json(ack);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to acknowledge alert" });
  }
});

// DELETE /api/alert-acks — remove acknowledgment
router.delete("/", requireAuth, async (req, res) => {
  try {
    const { equipmentId, alertType } = req.body;
    if (!equipmentId || !alertType) {
      return res.status(400).json({ error: "equipmentId and alertType required" });
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
