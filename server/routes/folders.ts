import { Router } from "express";
import { randomUUID } from "crypto";
import { db, folders, equipment } from "../db.js";
import { eq, desc, and, isNull, lte } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth.js";
import { subDays } from "date-fns";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const allFolders = await db
      .select()
      .from(folders)
      .orderBy(desc(folders.createdAt));

    const sevenDaysAgo = subDays(new Date(), 7);
    const sterilizationDueCount = await db
      .select({ id: equipment.id })
      .from(equipment)
      .where(
        and(
          lte(equipment.lastSterilizationDate, sevenDaysAgo),
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

    const [folder] = await db
      .update(folders)
      .set({ name: name.trim() })
      .where(eq(folders.id, req.params.id))
      .returning();

    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update folder" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await db
      .update(equipment)
      .set({ folderId: null })
      .where(eq(equipment.folderId, req.params.id));

    await db.delete(folders).where(eq(folders.id, req.params.id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

export default router;
