import { Router } from "express";
import { randomUUID } from "crypto";
import { db, folders, equipment } from "../db.js";
import { eq, desc, and, isNull, lte } from "drizzle-orm";
import { requireAuth, requireAdmin, requireEffectiveRole } from "../middleware/auth.js";
import { subDays } from "date-fns";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const allFolders = await db
      .select()
      .from(folders)
      .where(and(eq(folders.clinicId, clinicId), isNull(folders.deletedAt)))
      .orderBy(desc(folders.createdAt));

    const sevenDaysAgo = subDays(new Date(), 7);
    const sterilizationDueCount = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(
        and(
          eq(equipment.clinicId, clinicId),
          lte(equipment.lastSterilizationDate, sevenDaysAgo),
          isNull(equipment.deletedAt),
        )
      );

    const smartFolders = [
      {
        id: "smart-sterilization-due",
        name: "Sterilization Due",
        type: "smart",
        color: "#14b8a6",
        count: sterilizationDueCount.length,
        createdAt: new Date().toISOString(),
      },
    ];

    res.json([...smartFolders, ...allFolders]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "טעינת התיקיות נכשלה" });
  }
});

router.post("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "שם הוא שדה חובה" });

    const [folder] = await db
      .insert(folders)
      .values({ id: randomUUID(), clinicId, name: name.trim() })
      .returning();

    logAudit({
      clinicId,
      actionType: "folder_created",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: folder.id,
      targetType: "folder",
      metadata: { name: folder.name },
    });

    res.status(201).json(folder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "יצירת התיקייה נכשלה" });
  }
});

router.patch("/:id", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "שם הוא שדה חובה" });

    const [existing] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, req.params.id), eq(folders.clinicId, clinicId)))
      .limit(1);

    const [folder] = await db
      .update(folders)
      .set({ name: name.trim() })
      .where(and(eq(folders.id, req.params.id), eq(folders.clinicId, clinicId), isNull(folders.deletedAt)))
      .returning();

    if (!folder) return res.status(404).json({ error: "Folder not found" });

    logAudit({
      clinicId,
      actionType: "folder_updated",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: folder.id,
      targetType: "folder",
      metadata: { previousName: existing?.name, newName: folder.name },
    });

    res.json(folder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update folder" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const [existing] = await db
      .select()
      .from(folders)
      .where(and(eq(folders.id, req.params.id), eq(folders.clinicId, clinicId)))
      .limit(1);

    const [deleted] = await db
      .update(folders)
      .set({ deletedAt: new Date(), deletedBy: req.authUser!.id })
      .where(and(eq(folders.id, req.params.id), eq(folders.clinicId, clinicId), isNull(folders.deletedAt)))
      .returning({ id: folders.id });

    if (!deleted) return res.status(404).json({ error: "Folder not found" });

    logAudit({
      clinicId,
      actionType: "folder_deleted",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "folder",
      metadata: { name: existing?.name },
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

export default router;
