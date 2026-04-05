import { Router } from "express";
import { randomUUID } from "crypto";
import { db, equipment, folders, scanLogs, transferLogs, undoTokens } from "../db.js";
import { eq, inArray, desc, and, lt } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth.js";
import { sendPushToAll, checkDedupe } from "../lib/push.js";

const router = Router();

const UNDO_TTL_MS = 12_000;
const BULK_MAX = 100;
const FIELD_MAX_LENGTH = 500;

type EquipmentRow = typeof equipment.$inferSelect;

interface EquipmentPreviousState {
  status: string;
  lastSeen: Date | string | null;
  lastStatus: string | null;
  lastMaintenanceDate: Date | string | null;
  lastSterilizationDate: Date | string | null;
  checkedOutById: string | null;
  checkedOutByEmail: string | null;
  checkedOutAt: Date | string | null;
  checkedOutLocation: string | null;
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function cleanExpiredUndoTokens(): Promise<void> {
  try {
    await db.delete(undoTokens).where(lt(undoTokens.expiresAt, new Date()));
  } catch {
  }
}

async function insertUndoToken(
  tx: Tx,
  params: {
    equipmentId: string;
    actorId: string;
    scanLogId: string;
    previousState: EquipmentPreviousState;
  }
): Promise<string> {
  const tokenId = randomUUID();
  const expiresAt = new Date(Date.now() + UNDO_TTL_MS);
  await tx.insert(undoTokens).values({
    id: tokenId,
    equipmentId: params.equipmentId,
    actorId: params.actorId,
    scanLogId: params.scanLogId,
    previousState: JSON.stringify(params.previousState),
    expiresAt,
  });
  return tokenId;
}

async function consumeUndoToken(
  tokenId: string,
  equipmentId: string,
  actorId: string
): Promise<{ scanLogId: string; previousState: EquipmentPreviousState } | null> {
  const [entry] = await db
    .select()
    .from(undoTokens)
    .where(eq(undoTokens.id, tokenId))
    .limit(1);

  if (!entry) return null;
  if (entry.equipmentId !== equipmentId) return null;
  if (entry.actorId !== actorId) return null;
  if (entry.expiresAt < new Date()) {
    await db.delete(undoTokens).where(eq(undoTokens.id, tokenId));
    return null;
  }
  await db.delete(undoTokens).where(eq(undoTokens.id, tokenId));
  return {
    scanLogId: entry.scanLogId,
    previousState: JSON.parse(entry.previousState) as EquipmentPreviousState,
  };
}

function snapshotState(row: EquipmentRow): EquipmentPreviousState {
  return {
    status: row.status,
    lastSeen: row.lastSeen,
    lastStatus: row.lastStatus,
    lastMaintenanceDate: row.lastMaintenanceDate,
    lastSterilizationDate: row.lastSterilizationDate,
    checkedOutById: row.checkedOutById,
    checkedOutByEmail: row.checkedOutByEmail,
    checkedOutAt: row.checkedOutAt,
    checkedOutLocation: row.checkedOutLocation,
  };
}

type ResLike = Parameters<Parameters<Router["use"]>[0]>[1];

function validateFieldLength(fields: Record<string, unknown>, res: ResLike): boolean {
  const textFields = ["name", "serialNumber", "model", "note", "imageUrl", "location", "manufacturer"];
  for (const field of textFields) {
    const val = fields[field];
    if (typeof val === "string" && val.length > FIELD_MAX_LENGTH) {
      res.status(400).json({ error: `Field "${field}" exceeds maximum length of ${FIELD_MAX_LENGTH}` });
      return false;
    }
  }
  return true;
}

class CheckoutConflictError extends Error {
  checkedOutByEmail: string;
  constructor(email: string) {
    super("CHECKOUT_CONFLICT");
    this.checkedOutByEmail = email;
  }
}

// GET /api/equipment/my
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

router.post("/", requireAuth, requireRole("technician"), async (req, res) => {
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
    } = req.body as Record<string, string | number | undefined>;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ error: "Name is required" });
    }
    if (!validateFieldLength(req.body as Record<string, unknown>, res)) return;

    const [item] = await db
      .insert(equipment)
      .values({
        id: randomUUID(),
        name: name.trim(),
        serialNumber: typeof serialNumber === "string" ? serialNumber : null,
        model: typeof model === "string" ? model : null,
        manufacturer: typeof manufacturer === "string" ? manufacturer : null,
        purchaseDate: typeof purchaseDate === "string" ? purchaseDate : null,
        location: typeof location === "string" ? location : null,
        folderId: typeof folderId === "string" ? folderId : null,
        maintenanceIntervalDays: typeof maintenanceIntervalDays === "number" ? maintenanceIntervalDays : null,
        imageUrl: typeof imageUrl === "string" ? imageUrl : null,
        status: "ok",
      })
      .returning();
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create equipment" });
  }
});

router.patch("/:id", requireAuth, requireRole("technician"), async (req, res) => {
  try {
    if (!validateFieldLength(req.body as Record<string, unknown>, res)) return;

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
    } = req.body as Record<string, string | number | undefined>;

    let result: EquipmentRow | null = null;

    await db.transaction(async (tx) => {
      const [oldItem] = await tx
        .select()
        .from(equipment)
        .where(eq(equipment.id, req.params.id))
        .limit(1);

      const [item] = await tx
        .update(equipment)
        .set({
          ...(name !== undefined && { name: String(name) }),
          ...(serialNumber !== undefined && { serialNumber: String(serialNumber) }),
          ...(model !== undefined && { model: String(model) }),
          ...(manufacturer !== undefined && { manufacturer: String(manufacturer) }),
          ...(purchaseDate !== undefined && { purchaseDate: String(purchaseDate) }),
          ...(location !== undefined && { location: String(location) }),
          ...(folderId !== undefined && { folderId: folderId ? String(folderId) : null }),
          ...(maintenanceIntervalDays !== undefined && { maintenanceIntervalDays: Number(maintenanceIntervalDays) }),
          ...(imageUrl !== undefined && { imageUrl: String(imageUrl) }),
          ...(status !== undefined && { status: String(status) }),
        })
        .where(eq(equipment.id, req.params.id))
        .returning();

      if (!item) return;
      result = item;

      if (folderId !== undefined && oldItem && oldItem.folderId !== (folderId ? String(folderId) : null)) {
        const [oldFolder] = oldItem.folderId
          ? await tx.select().from(folders).where(eq(folders.id, oldItem.folderId)).limit(1)
          : [null];
        const targetFolderId = folderId ? String(folderId) : null;
        const [newFolder] = targetFolderId
          ? await tx.select().from(folders).where(eq(folders.id, targetFolderId)).limit(1)
          : [null];
        await tx.insert(transferLogs).values({
          id: randomUUID(),
          equipmentId: req.params.id,
          fromFolderId: oldItem.folderId ?? null,
          fromFolderName: oldFolder?.name ?? null,
          toFolderId: targetFolderId,
          toFolderName: newFolder?.name ?? null,
          userId: req.authUser!.id,
        });

        const itemName = result?.name ?? oldItem.name;
        if (!checkDedupe(req.params.id, "transfer")) {
          const toLabel = newFolder?.name ?? "unassigned";
          sendPushToAll({
            title: "Equipment Transferred",
            body: `${itemName} moved to ${toLabel}`,
            tag: `transfer:${req.params.id}`,
            url: `/equipment/${req.params.id}`,
          }).catch(() => {});
        }
      }
    });

    if (!result) return res.status(404).json({ error: "Equipment not found" });
    res.json(result);
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
router.post("/:id/checkout", requireAuth, requireRole("technician"), async (req, res) => {
  try {
    const { location } = req.body as { location?: string };
    const clientTimestamp = parseInt(req.headers["x-client-timestamp"] as string || "0", 10);

    let updated: EquipmentRow | null = null;
    let undoToken = "";

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(equipment)
        .where(eq(equipment.id, req.params.id))
        .limit(1);

      if (!existing) return;

      if (existing.checkedOutById) {
        const existingTimestamp = existing.checkedOutAt
          ? new Date(existing.checkedOutAt).getTime()
          : 0;
        if (!clientTimestamp || clientTimestamp <= existingTimestamp) {
          throw new CheckoutConflictError(existing.checkedOutByEmail ?? "unknown");
        }
      }

      const checkoutTime = clientTimestamp ? new Date(clientTimestamp) : new Date();
      const [updatedRow] = await tx
        .update(equipment)
        .set({
          checkedOutById: req.authUser!.id,
          checkedOutByEmail: req.authUser!.email,
          checkedOutAt: checkoutTime,
          checkedOutLocation: location ?? null,
          lastSeen: checkoutTime,
          lastStatus: existing.status,
        })
        .where(eq(equipment.id, req.params.id))
        .returning();

      updated = updatedRow;
      const checkoutLogId = randomUUID();

      await tx.insert(scanLogs).values({
        id: checkoutLogId,
        equipmentId: req.params.id,
        userId: req.authUser!.id,
        userEmail: req.authUser!.email,
        status: existing.status,
        note: `Checked out${location ? ` — ${location}` : ""}`,
        timestamp: checkoutTime,
      });

      undoToken = await insertUndoToken(tx, {
        equipmentId: req.params.id,
        actorId: req.authUser!.id,
        scanLogId: checkoutLogId,
        previousState: snapshotState(existing),
      });
    });

    if (!updated) return res.status(404).json({ error: "Equipment not found" });
    res.json({ equipment: updated, undoToken });

    const u = updated as EquipmentRow;
    if (!checkDedupe(u.id, "checkout")) {
      sendPushToAll({
        title: "Equipment Checked Out",
        body: `${u.name} checked out${req.body?.location ? ` — ${req.body.location}` : ""}`,
        tag: `checkout:${u.id}`,
        url: `/equipment/${u.id}`,
      }).catch(() => {});
    }
  } catch (err) {
    if (err instanceof CheckoutConflictError) {
      return res.status(409).json({
        error: "Already checked out",
        checkedOutByEmail: err.checkedOutByEmail,
        conflictInfo: `Checked out by ${err.checkedOutByEmail}`,
      });
    }
    console.error(err);
    res.status(500).json({ error: "Checkout failed" });
  }
});

// POST /api/equipment/:id/return
router.post("/:id/return", requireAuth, requireRole("technician"), async (req, res) => {
  try {
    const clientTimestamp = parseInt(req.headers["x-client-timestamp"] as string || "0", 10);

    let updated: EquipmentRow | null = null;
    let undoToken = "";
    let alreadyReturned = false;

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(equipment)
        .where(eq(equipment.id, req.params.id))
        .limit(1);

      if (!existing) return;

      if (!existing.checkedOutById) {
        const existingTimestamp = existing.lastSeen ? new Date(existing.lastSeen).getTime() : 0;
        if (clientTimestamp && clientTimestamp <= existingTimestamp) {
          alreadyReturned = true;
          updated = existing;
          return;
        }
      }

      const returnTime = clientTimestamp ? new Date(clientTimestamp) : new Date();
      const [updatedRow] = await tx
        .update(equipment)
        .set({
          checkedOutById: null,
          checkedOutByEmail: null,
          checkedOutAt: null,
          checkedOutLocation: null,
          status: "ok",
          lastSeen: returnTime,
          lastStatus: "ok",
        })
        .where(eq(equipment.id, req.params.id))
        .returning();

      updated = updatedRow;
      const returnLogId = randomUUID();

      await tx.insert(scanLogs).values({
        id: returnLogId,
        equipmentId: req.params.id,
        userId: req.authUser!.id,
        userEmail: req.authUser!.email,
        status: "ok",
        note: "Returned — available",
        timestamp: returnTime,
      });

      undoToken = await insertUndoToken(tx, {
        equipmentId: req.params.id,
        actorId: req.authUser!.id,
        scanLogId: returnLogId,
        previousState: snapshotState(existing),
      });
    });

    if (!updated) return res.status(404).json({ error: "Equipment not found" });
    if (alreadyReturned) return res.json(updated);
    res.json({ equipment: updated, undoToken });

    const u = updated as EquipmentRow;
    if (!checkDedupe(u.id, "return")) {
      sendPushToAll({
        title: "Equipment Returned",
        body: `${u.name} has been returned and is available`,
        tag: `return:${u.id}`,
        url: `/equipment/${u.id}`,
      }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Return failed" });
  }
});

// POST /api/equipment/:id/scan
router.post("/:id/scan", requireAuth, requireRole("vet"), async (req, res) => {
  try {
    const { status, note, photoUrl } = req.body as {
      status?: string;
      note?: string;
      photoUrl?: string;
    };
    if (!status) return res.status(400).json({ error: "Status required" });
    if (status === "issue" && !note?.trim()) {
      return res.status(400).json({ error: "Note is required when reporting an issue" });
    }
    if (!validateFieldLength({ note, photoUrl }, res)) return;

    const clientTimestamp = parseInt(req.headers["x-client-timestamp"] as string || "0", 10);
    const scanTime = clientTimestamp ? new Date(clientTimestamp) : new Date();

    let updatedEquipment: EquipmentRow | null = null;
    let scanLog: typeof scanLogs.$inferSelect | null = null;
    let undoToken = "";

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(equipment)
        .where(eq(equipment.id, req.params.id))
        .limit(1);

      if (!existing) return;

      const serverLastSeen = existing.lastSeen ? new Date(existing.lastSeen).getTime() : 0;
      const isNewerWrite = !clientTimestamp || clientTimestamp >= serverLastSeen;

      if (isNewerWrite) {
        const updates: Partial<typeof equipment.$inferInsert> = {
          lastSeen: scanTime,
          lastStatus: status,
          status,
        };
        if (status === "maintenance") updates.lastMaintenanceDate = scanTime;
        if (status === "sterilized") updates.lastSterilizationDate = scanTime;

        const [result] = await tx
          .update(equipment)
          .set(updates)
          .where(eq(equipment.id, req.params.id))
          .returning();
        updatedEquipment = result;
      } else {
        updatedEquipment = existing;
      }

      const [log] = await tx
        .insert(scanLogs)
        .values({
          id: randomUUID(),
          equipmentId: req.params.id,
          userId: req.authUser!.id,
          userEmail: req.authUser!.email,
          status,
          note: note ?? null,
          photoUrl: photoUrl ?? null,
          timestamp: scanTime,
        })
        .returning();

      scanLog = log;

      undoToken = await insertUndoToken(tx, {
        equipmentId: req.params.id,
        actorId: req.authUser!.id,
        scanLogId: log.id,
        previousState: snapshotState(existing),
      });
    });

    if (!updatedEquipment) return res.status(404).json({ error: "Equipment not found" });
    res.json({ equipment: updatedEquipment, scanLog, undoToken });

    const eq2 = updatedEquipment as EquipmentRow;
    if (status === "issue" && !checkDedupe(eq2.id, "issue")) {
      sendPushToAll({
        title: "Equipment Issue Reported",
        body: `${eq2.name} needs attention${note ? ` — ${note}` : ""}`,
        tag: `issue:${eq2.id}`,
        url: `/equipment/${eq2.id}`,
      }).catch(() => {});
    }

    const now = new Date();
    if (
      eq2.maintenanceIntervalDays &&
      eq2.lastMaintenanceDate &&
      !checkDedupe(eq2.id, "overdue")
    ) {
      const dueDate = new Date(eq2.lastMaintenanceDate);
      dueDate.setDate(dueDate.getDate() + eq2.maintenanceIntervalDays);
      if (now > dueDate) {
        const daysOverdue = Math.ceil((now.getTime() - dueDate.getTime()) / 86_400_000);
        sendPushToAll({
          title: "Maintenance Overdue",
          body: `${eq2.name} is ${daysOverdue} day${daysOverdue !== 1 ? "s" : ""} overdue for maintenance`,
          tag: `overdue:${eq2.id}`,
          url: `/equipment/${eq2.id}`,
        }).catch(() => {});
      }
    }

    if (eq2.lastSterilizationDate && !checkDedupe(eq2.id, "sterilization_due")) {
      const sevenDaysAgo = new Date(now.getTime() - 7 * 86_400_000);
      if (new Date(eq2.lastSterilizationDate) < sevenDaysAgo) {
        sendPushToAll({
          title: "Sterilization Due",
          body: `${eq2.name} has not been sterilized in 7+ days`,
          tag: `sterilization_due:${eq2.id}`,
          url: `/equipment/${eq2.id}`,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Scan failed" });
  }
});

// POST /api/equipment/:id/revert
router.post("/:id/revert", requireAuth, requireRole("vet"), async (req, res) => {
  try {
    const { undoToken: tokenId } = req.body as { undoToken?: string };

    if (!tokenId || typeof tokenId !== "string") {
      return res.status(400).json({ error: "undoToken is required" });
    }

    const token = await consumeUndoToken(tokenId, req.params.id, req.authUser!.id);
    if (!token) {
      return res.status(409).json({ error: "Undo window expired or token invalid" });
    }

    const prev = token.previousState;

    let updated: EquipmentRow | null = null;

    await db.transaction(async (tx) => {
      const [result] = await tx
        .update(equipment)
        .set({
          status: prev.status,
          lastSeen: prev.lastSeen ? new Date(prev.lastSeen) : null,
          lastStatus: prev.lastStatus,
          lastMaintenanceDate: prev.lastMaintenanceDate ? new Date(prev.lastMaintenanceDate) : null,
          lastSterilizationDate: prev.lastSterilizationDate ? new Date(prev.lastSterilizationDate) : null,
          checkedOutById: prev.checkedOutById,
          checkedOutByEmail: prev.checkedOutByEmail,
          checkedOutAt: prev.checkedOutAt ? new Date(prev.checkedOutAt) : null,
          checkedOutLocation: prev.checkedOutLocation,
        })
        .where(eq(equipment.id, req.params.id))
        .returning();

      updated = result;

      await tx
        .delete(scanLogs)
        .where(and(eq(scanLogs.id, token.scanLogId), eq(scanLogs.equipmentId, req.params.id)));
    });

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
    const { ids } = req.body as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array required" });
    }
    if (ids.length > BULK_MAX) {
      return res.status(400).json({ error: `Cannot delete more than ${BULK_MAX} items at once` });
    }
    if (!ids.every((id) => typeof id === "string")) {
      return res.status(400).json({ error: "All IDs must be strings" });
    }
    await db.delete(equipment).where(inArray(equipment.id, ids as string[]));
    res.json({ affected: ids.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk delete failed" });
  }
});

router.post("/bulk-move", requireAuth, requireRole("technician"), async (req, res) => {
  try {
    const { ids, folderId } = req.body as { ids?: unknown; folderId?: string };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "IDs array required" });
    }
    if (ids.length > BULK_MAX) {
      return res.status(400).json({ error: `Cannot move more than ${BULK_MAX} items at once` });
    }
    if (!ids.every((id) => typeof id === "string")) {
      return res.status(400).json({ error: "All IDs must be strings" });
    }
    const typedIds = ids as string[];
    const targetFolderId = folderId ?? null;

    await db.transaction(async (tx) => {
      const [targetFolder] = targetFolderId
        ? await tx.select().from(folders).where(eq(folders.id, targetFolderId)).limit(1)
        : [null];

      for (const id of typedIds) {
        const [item] = await tx
          .select()
          .from(equipment)
          .where(eq(equipment.id, id))
          .limit(1);
        if (!item) continue;

        const [oldFolder] = item.folderId
          ? await tx.select().from(folders).where(eq(folders.id, item.folderId)).limit(1)
          : [null];

        await tx
          .update(equipment)
          .set({ folderId: targetFolderId })
          .where(eq(equipment.id, id));

        await tx.insert(transferLogs).values({
          id: randomUUID(),
          equipmentId: id,
          fromFolderId: item.folderId ?? null,
          fromFolderName: oldFolder?.name ?? null,
          toFolderId: targetFolderId,
          toFolderName: targetFolder?.name ?? null,
          userId: req.authUser!.id,
        });
      }
    });

    res.json({ affected: typedIds.length });

    sendPushToAll({
      title: "Bulk Transfer",
      body: `${typedIds.length} item${typedIds.length !== 1 ? "s" : ""} moved${targetFolderId ? ` to a new folder` : " to Unassigned"}`,
      tag: `bulk-move:${Date.now()}`,
      url: "/",
    }).catch(() => {});
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk move failed" });
  }
});

export default router;
