import { Router } from "express";
import { randomUUID } from "crypto";
import { db, equipment, folders, scanLogs, transferLogs } from "../db.js";
import { eq, inArray, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { format, subDays } from "date-fns";

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const items = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        serialNumber: equipment.serialNumber,
        model: equipment.model,
        manufacturer: equipment.manufacturer,
        purchaseDate: equipment.purchaseDate,
        location: equipment.location,
        folderId: equipment.folderId,
        folderName: folders.name,
        status: equipment.status,
        lastSeen: equipment.lastSeen,
        lastStatus: equipment.lastStatus,
        lastMaintenanceDate: equipment.lastMaintenanceDate,
        lastSterilizationDate: equipment.lastSterilizationDate,
        maintenanceIntervalDays: equipment.maintenanceIntervalDays,
        imageUrl: equipment.imageUrl,
        createdAt: equipment.createdAt,
      })
      .from(equipment)
      .leftJoin(folders, eq(equipment.folderId, folders.id))
      .orderBy(desc(equipment.createdAt));

    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list equipment" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  try {
    const [item] = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        serialNumber: equipment.serialNumber,
        model: equipment.model,
        manufacturer: equipment.manufacturer,
        purchaseDate: equipment.purchaseDate,
        location: equipment.location,
        folderId: equipment.folderId,
        folderName: folders.name,
        status: equipment.status,
        lastSeen: equipment.lastSeen,
        lastStatus: equipment.lastStatus,
        lastMaintenanceDate: equipment.lastMaintenanceDate,
        lastSterilizationDate: equipment.lastSterilizationDate,
        maintenanceIntervalDays: equipment.maintenanceIntervalDays,
        imageUrl: equipment.imageUrl,
        createdAt: equipment.createdAt,
      })
      .from(equipment)
      .leftJoin(folders, eq(equipment.folderId, folders.id))
      .where(eq(equipment.id, req.params.id))
      .limit(1);

    if (!item) return res.status(404).json({ error: "Equipment not found" });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get equipment" });
  }
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const {
      name,
      serialNumber,
      model,
      manufacturer,
      purchaseDate,
      location,
      folderId,
      maintenanceIntervalDays,
      imageUrl,
    } = req.body;

    if (!name?.trim()) return res.status(400).json({ error: "Name is required" });

    const [item] = await db
      .insert(equipment)
      .values({
        id: randomUUID(),
        name: name.trim(),
        serialNumber: serialNumber || null,
        model: model || null,
        manufacturer: manufacturer || null,
        purchaseDate: purchaseDate || null,
        location: location || null,
        folderId: folderId || null,
        maintenanceIntervalDays: maintenanceIntervalDays || null,
        imageUrl: imageUrl || null,
        status: "ok",
      })
      .returning();

    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create equipment" });
  }
});

router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const {
      name,
      serialNumber,
      model,
      manufacturer,
      purchaseDate,
      location,
      folderId,
      maintenanceIntervalDays,
      imageUrl,
      status,
    } = req.body;

    const [item] = await db
      .update(equipment)
      .set({
        ...(name !== undefined && { name }),
        ...(serialNumber !== undefined && { serialNumber }),
        ...(model !== undefined && { model }),
        ...(manufacturer !== undefined && { manufacturer }),
        ...(purchaseDate !== undefined && { purchaseDate }),
        ...(location !== undefined && { location }),
        ...(folderId !== undefined && { folderId: folderId || null }),
        ...(maintenanceIntervalDays !== undefined && { maintenanceIntervalDays }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(status !== undefined && { status }),
      })
      .where(eq(equipment.id, req.params.id))
      .returning();

    if (!item) return res.status(404).json({ error: "Equipment not found" });

    if (folderId !== undefined) {
      const oldItem = await db
        .select()
        .from(equipment)
        .where(eq(equipment.id, req.params.id))
        .limit(1);
      if (oldItem[0]?.folderId !== (folderId || null)) {
        const [oldFolder] = oldItem[0]?.folderId
          ? await db
              .select()
              .from(folders)
              .where(eq(folders.id, oldItem[0].folderId!))
              .limit(1)
          : [null];
        const [newFolder] = folderId
          ? await db
              .select()
              .from(folders)
              .where(eq(folders.id, folderId))
              .limit(1)
          : [null];
        await db.insert(transferLogs).values({
          id: randomUUID(),
          equipmentId: req.params.id,
          fromFolderId: oldItem[0]?.folderId || null,
          fromFolderName: oldFolder?.name || null,
          toFolderId: folderId || null,
          toFolderName: newFolder?.name || null,
          userId: req.authUser!.id,
        });
      }
    }

    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update equipment" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    await db.delete(equipment).where(eq(equipment.id, req.params.id));
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete equipment" });
  }
});

router.post("/:id/scan", requireAuth, async (req, res) => {
  try {
    const { status, note, photoUrl } = req.body;
    if (!status) return res.status(400).json({ error: "Status required" });

    const now = new Date();

    const updates: Record<string, unknown> = {
      lastSeen: now,
      lastStatus: status,
      status,
    };

    if (status === "maintenance") {
      updates.lastMaintenanceDate = now;
    }
    if (status === "sterilized") {
      updates.lastSterilizationDate = now;
    }

    const [updatedEquipment] = await db
      .update(equipment)
      .set(updates)
      .where(eq(equipment.id, req.params.id))
      .returning();

    if (!updatedEquipment) {
      return res.status(404).json({ error: "Equipment not found" });
    }

    const [scanLog] = await db
      .insert(scanLogs)
      .values({
        id: randomUUID(),
        equipmentId: req.params.id,
        userId: req.authUser!.id,
        userEmail: req.authUser!.email,
        status,
        note: note || null,
        photoUrl: photoUrl || null,
      })
      .returning();

    res.json({ equipment: updatedEquipment, scanLog });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scan failed" });
  }
});

router.get("/:id/logs", requireAuth, async (req, res) => {
  try {
    const logs = await db
      .select()
      .from(scanLogs)
      .where(eq(scanLogs.equipmentId, req.params.id))
      .orderBy(desc(scanLogs.timestamp));
    res.json(logs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get logs" });
  }
});

router.get("/:id/transfers", requireAuth, async (req, res) => {
  try {
    const transfers = await db
      .select()
      .from(transferLogs)
      .where(eq(transferLogs.equipmentId, req.params.id))
      .orderBy(desc(transferLogs.timestamp));
    res.json(transfers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get transfers" });
  }
});

router.post("/bulk-delete", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array required" });
    }
    await db.delete(equipment).where(inArray(equipment.id, ids));
    res.json({ affected: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk delete failed" });
  }
});

router.post("/bulk-move", requireAuth, async (req, res) => {
  try {
    const { ids, folderId } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array required" });
    }

    const [targetFolder] = folderId
      ? await db.select().from(folders).where(eq(folders.id, folderId)).limit(1)
      : [null];

    for (const id of ids) {
      const [item] = await db
        .select()
        .from(equipment)
        .where(eq(equipment.id, id))
        .limit(1);
      if (!item) continue;

      const [oldFolder] = item.folderId
        ? await db
            .select()
            .from(folders)
            .where(eq(folders.id, item.folderId))
            .limit(1)
        : [null];

      await db
        .update(equipment)
        .set({ folderId: folderId || null })
        .where(eq(equipment.id, id));

      await db.insert(transferLogs).values({
        id: randomUUID(),
        equipmentId: id,
        fromFolderId: item.folderId || null,
        fromFolderName: oldFolder?.name || null,
        toFolderId: folderId || null,
        toFolderName: targetFolder?.name || null,
        userId: req.authUser!.id,
      });
    }

    res.json({ affected: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk move failed" });
  }
});

export default router;
