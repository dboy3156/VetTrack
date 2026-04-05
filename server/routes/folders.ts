import { Router } from "express";
import { randomUUID } from "crypto";
import { db, folders, equipment } from "../db.js";
import { eq, desc, and, isNull, lte } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth.js";
import { subDays } from "date-fns";
import { logAudit } from "../lib/audit.js";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const allFolders = await db
      .select()
      .from(folders)
      .where(isNull(folders.deletedAt))
      .orderBy(desc(folders.createdAt));

    const sevenDaysAgo = subDays(new Date(), 7);
    const sterilizationDueCount = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(
        and(
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
    res.status(500).json({ error: "Failed to list folders" });
  }
});

router.post("/", requireAuth, requireRole("technician"), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const [folder] = await db
      .insert(folders)
      .values({ id: randomUUID(), name: name.trim() })
      .returning();

    logAudit({
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
    res.status(500).json({ error: "Failed to create folder" });
  }
});

router.patch("/:id", requireAuth, requireRole("technician"), async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const [existing] = await db
      .select()
      .from(folders)
      .where(eq(folders.id, req.params.id))
      .limit(1);

    const [folder] = await db
      .update(folders)
      .set({ name: name.trim() })
      .where(and(eq(folders.id, req.params.id), isNull(folders.deletedAt)))
      .returning();

    if (!folder) return res.status(404).json({ error: "Folder not found" });

    logAudit({
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
    const [existing] = await db
      .select()
      .from(folders)
      .where(eq(folders.id, req.params.id))
      .limit(1);

    const [deleted] = await db
      .update(folders)
      .set({ deletedAt: new Date(), deletedBy: req.authUser!.id })
      .where(and(eq(folders.id, req.params.id), isNull(folders.deletedAt)))
      .returning({ id: folders.id });

    if (!deleted) return res.status(404).json({ error: "Folder not found" });

    logAudit({
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
