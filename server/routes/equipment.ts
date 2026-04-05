import { Router } from "express";
import { randomUUID } from "crypto";
import { db, equipment, folders, scanLogs, transferLogs } from "../db.js";
import { eq, inArray, desc, isNotNull, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Server-side undo token store. Holds a complete snapshot of equipment state
// before a mutation, keyed by an opaque undo token.
// Constrained to: matching equipment ID, actor, and within UNDO_TTL_MS window.
const UNDO_TTL_MS = 12_000; // slightly above frontend 10s to account for latency

interface UndoToken {
  equipmentId: string;
  actorId: string;
  scanLogId: string;
  previousState: {
    status: string;
    lastSeen: Date | null;
    lastStatus: string | null;
    lastMaintenanceDate: Date | null;
    lastSterilizationDate: Date | null;
    checkedOutById: string | null;
    checkedOutByEmail: string | null;
    checkedOutAt: Date | null;
    checkedOutLocation: string | null;
  };
  expiresAt: number;
}

const undoTokens = new Map<string, UndoToken>();

function createUndoToken(token: Omit<UndoToken, "expiresAt">): string {
  const tokenId = randomUUID();
  const entry: UndoToken = { ...token, expiresAt: Date.now() + UNDO_TTL_MS };
  undoTokens.set(tokenId, entry);
  setTimeout(() => undoTokens.delete(tokenId), UNDO_TTL_MS);
  return tokenId;
}

function consumeUndoToken(
  tokenId: string,
  equipmentId: string,
  actorId: string
): UndoToken | null {
  const entry = undoTokens.get(tokenId);
  if (!entry) return null;
  if (entry.equipmentId !== equipmentId) return null;
  if (entry.actorId !== actorId) return null;
  if (entry.expiresAt < Date.now()) {
    undoTokens.delete(tokenId);
    return null;
  }
  undoTokens.delete(tokenId);
  return entry;
}

// GET /api/equipment/my — equipment checked out by the current user
router.get("/my", requireAuth, async (req, res) => {
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
        checkedOutById: equipment.checkedOutById,
        checkedOutByEmail: equipment.checkedOutByEmail,
        checkedOutAt: equipment.checkedOutAt,
        checkedOutLocation: equipment.checkedOutLocation,
        createdAt: equipment.createdAt,
      })
      .from(equipment)
      .leftJoin(folders, eq(equipment.folderId, folders.id))
      .where(eq(equipment.checkedOutById, req.authUser!.id))
      .orderBy(desc(equipment.checkedOutAt));

    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch my equipment" });
  }
});

router.get("/", requireAuth, async (_req, res) => {
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
        checkedOutById: equipment.checkedOutById,
        checkedOutByEmail: equipment.checkedOutByEmail,
        checkedOutAt: equipment.checkedOutAt,
        checkedOutLocation: equipment.checkedOutLocation,
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
        checkedOutById: equipment.checkedOutById,
        checkedOutByEmail: equipment.checkedOutByEmail,
        checkedOutAt: equipment.checkedOutAt,
        checkedOutLocation: equipment.checkedOutLocation,
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

    // Get old item before update (for transfer log)
    const [oldItem] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, req.params.id))
      .limit(1);

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

    if (folderId !== undefined && oldItem && oldItem.folderId !== (folderId || null)) {
      const [oldFolder] = oldItem.folderId
        ? await db.select().from(folders).where(eq(folders.id, oldItem.folderId)).limit(1)
        : [null];
      const [newFolder] = folderId
        ? await db.select().from(folders).where(eq(folders.id, folderId)).limit(1)
        : [null];
      await db.insert(transferLogs).values({
        id: randomUUID(),
        equipmentId: req.params.id,
        fromFolderId: oldItem.folderId || null,
        fromFolderName: oldFolder?.name || null,
        toFolderId: folderId || null,
        toFolderName: newFolder?.name || null,
        userId: req.authUser!.id,
      });
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

// POST /api/equipment/:id/checkout
router.post("/:id/checkout", requireAuth, async (req, res) => {
  try {
    const { location } = req.body; // optional room/patient context

    const [existing] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, req.params.id))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Equipment not found" });
    if (existing.checkedOutById) {
      return res.status(409).json({
        error: "Already checked out",
        checkedOutByEmail: existing.checkedOutByEmail,
      });
    }

    const [updated] = await db
      .update(equipment)
      .set({
        checkedOutById: req.authUser!.id,
        checkedOutByEmail: req.authUser!.email,
        checkedOutAt: new Date(),
        checkedOutLocation: location || null,
      })
      .where(eq(equipment.id, req.params.id))
      .returning();

    // Log the checkout as a scan event
    const checkoutLogId = randomUUID();
    await db.insert(scanLogs).values({
      id: checkoutLogId,
      equipmentId: req.params.id,
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      status: existing.status,
      note: `Checked out${location ? ` — ${location}` : ""}`,
    });

    // Create server-side undo token with full previous state
    const undoToken = createUndoToken({
      equipmentId: req.params.id,
      actorId: req.authUser!.id,
      scanLogId: checkoutLogId,
      previousState: {
        status: existing.status,
        lastSeen: existing.lastSeen,
        lastStatus: existing.lastStatus,
        lastMaintenanceDate: existing.lastMaintenanceDate,
        lastSterilizationDate: existing.lastSterilizationDate,
        checkedOutById: existing.checkedOutById,
        checkedOutByEmail: existing.checkedOutByEmail,
        checkedOutAt: existing.checkedOutAt,
        checkedOutLocation: existing.checkedOutLocation,
      },
    });

    res.json({ equipment: updated, undoToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

// POST /api/equipment/:id/return
router.post("/:id/return", requireAuth, async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, req.params.id))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Equipment not found" });

    const [updated] = await db
      .update(equipment)
      .set({
        checkedOutById: null,
        checkedOutByEmail: null,
        checkedOutAt: null,
        checkedOutLocation: null,
        status: "ok",
        lastSeen: new Date(),
        lastStatus: "ok",
      })
      .where(eq(equipment.id, req.params.id))
      .returning();

    // Log the return
    const returnLogId = randomUUID();
    await db.insert(scanLogs).values({
      id: returnLogId,
      equipmentId: req.params.id,
      userId: req.authUser!.id,
      userEmail: req.authUser!.email,
      status: "ok",
      note: "Returned — available",
    });

    // Create server-side undo token with full previous state
    const undoToken = createUndoToken({
      equipmentId: req.params.id,
      actorId: req.authUser!.id,
      scanLogId: returnLogId,
      previousState: {
        status: existing.status,
        lastSeen: existing.lastSeen,
        lastStatus: existing.lastStatus,
        lastMaintenanceDate: existing.lastMaintenanceDate,
        lastSterilizationDate: existing.lastSterilizationDate,
        checkedOutById: existing.checkedOutById,
        checkedOutByEmail: existing.checkedOutByEmail,
        checkedOutAt: existing.checkedOutAt,
        checkedOutLocation: existing.checkedOutLocation,
      },
    });

    res.json({ equipment: updated, undoToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Return failed" });
  }
});

router.post("/:id/scan", requireAuth, async (req, res) => {
  try {
    const { status, note, photoUrl } = req.body;
    if (!status) return res.status(400).json({ error: "Status required" });
    if (status === "issue" && !note?.trim()) {
      return res.status(400).json({ error: "Note is required when reporting an issue" });
    }

    // Fetch current state before mutation (for undo token)
    const [existingEquipment] = await db
      .select()
      .from(equipment)
      .where(eq(equipment.id, req.params.id))
      .limit(1);

    if (!existingEquipment) {
      return res.status(404).json({ error: "Equipment not found" });
    }

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

    // Create server-side undo token with full previous state
    const undoToken = createUndoToken({
      equipmentId: req.params.id,
      actorId: req.authUser!.id,
      scanLogId: scanLog.id,
      previousState: {
        status: existingEquipment.status,
        lastSeen: existingEquipment.lastSeen,
        lastStatus: existingEquipment.lastStatus,
        lastMaintenanceDate: existingEquipment.lastMaintenanceDate,
        lastSterilizationDate: existingEquipment.lastSterilizationDate,
        checkedOutById: existingEquipment.checkedOutById,
        checkedOutByEmail: existingEquipment.checkedOutByEmail,
        checkedOutAt: existingEquipment.checkedOutAt,
        checkedOutLocation: existingEquipment.checkedOutLocation,
      },
    });

    res.json({ equipment: updatedEquipment, scanLog, undoToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scan failed" });
  }
});

// POST /api/equipment/:id/revert — undo the most recent status change
router.post("/:id/revert", requireAuth, async (req, res) => {
  try {
    const { undoToken: tokenId } = req.body;

    if (!tokenId || typeof tokenId !== "string") {
      return res.status(400).json({ error: "undoToken is required" });
    }

    // Verify and consume the token — enforces equipment, actor, and TTL constraints
    const token = consumeUndoToken(tokenId, req.params.id, req.authUser!.id);
    if (!token) {
      return res.status(409).json({ error: "Undo window expired or token invalid" });
    }

    const prev = token.previousState;

    const [updated] = await db
      .update(equipment)
      .set({
        status: prev.status,
        lastSeen: prev.lastSeen,
        lastStatus: prev.lastStatus,
        lastMaintenanceDate: prev.lastMaintenanceDate,
        lastSterilizationDate: prev.lastSterilizationDate,
        checkedOutById: prev.checkedOutById,
        checkedOutByEmail: prev.checkedOutByEmail,
        checkedOutAt: prev.checkedOutAt,
        checkedOutLocation: prev.checkedOutLocation,
      })
      .where(eq(equipment.id, req.params.id))
      .returning();

    // Delete the exact scan log scoped to this equipment (not arbitrary)
    await db
      .delete(scanLogs)
      .where(and(eq(scanLogs.id, token.scanLogId), eq(scanLogs.equipmentId, req.params.id)));

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Revert failed" });
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
        ? await db.select().from(folders).where(eq(folders.id, item.folderId)).limit(1)
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
