import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, folders, equipment } from "../db.js";
import { eq, desc, and, isNull, lte } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { subDays } from "date-fns";

/*
 * PERMISSIONS MATRIX — /api/folders
 * ─────────────────────────────────────────────────────
 * GET    /      viewer+       List all folders (including smart folders)
 * POST   /      technician+   Create a folder
 * PATCH  /:id   technician+   Rename a folder
 * DELETE /:id   admin-only    Delete folder (unassigns all equipment)
 * ─────────────────────────────────────────────────────
 */

const router = Router();

const createFolderSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
});

const patchFolderSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
});

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

router.post("/", requireAuth, requireRole("technician"), validateBody(createFolderSchema), async (req, res) => {
  try {
    const { name } = req.body as z.infer<typeof createFolderSchema>;

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

router.patch("/:id", requireAuth, requireRole("technician"), validateUuid("id"), validateBody(patchFolderSchema), async (req, res) => {
  try {
    const { name } = req.body as z.infer<typeof patchFolderSchema>;

    const [folder] = await db
      .update(folders)
      .set({ name: name.trim() })
      .where(and(eq(folders.id, req.params.id), isNull(folders.deletedAt)))
      .returning();

    if (!folder) return res.status(404).json({ error: "Folder not found" });
    res.json(folder);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update folder" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, validateUuid("id"), async (req, res) => {
  try {
    const [deleted] = await db
      .update(folders)
      .set({ deletedAt: new Date(), deletedBy: req.authUser!.id })
      .where(and(eq(folders.id, req.params.id), isNull(folders.deletedAt)))
      .returning({ id: folders.id });
    if (!deleted) return res.status(404).json({ error: "Folder not found" });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete folder" });
  }
});

export default router;
