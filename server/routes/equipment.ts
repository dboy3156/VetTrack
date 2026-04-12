import { Router } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import { z } from "zod";
import { db, equipment, folders, rooms, scanLogs, transferLogs, undoTokens, users } from "../db.js";
import { eq, inArray, desc, and, lt, sql, isNull, isNotNull } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { scanLimiter, checkoutLimiter, writeLimiter } from "../middleware/rate-limiters.js";
import { checkDedupe, sendPushToAll } from "../lib/push.js";
import { invalidateAnalyticsCache } from "../lib/analytics-cache.js";
import { logAudit } from "../lib/audit.js";
import { trackSyncSuccess, trackSyncFail } from "../lib/sync-metrics.js";

const EQUIPMENT_STATUS_VALUES = ["ok", "issue", "maintenance", "sterilized", "overdue", "inactive"] as const;

const createEquipmentSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(500),
  serialNumber: z.string().max(500).optional(),
  model: z.string().max(500).optional(),
  manufacturer: z.string().max(500).optional(),
  purchaseDate: z.string().optional(),
  location: z.string().max(500).optional(),
  folderId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  nfcTagId: z.string().max(500).optional().nullable(),
  maintenanceIntervalDays: z.number().int().positive().optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
});

const patchEquipmentSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  serialNumber: z.string().max(500).optional(),
  model: z.string().max(500).optional(),
  manufacturer: z.string().max(500).optional(),
  purchaseDate: z.string().optional(),
  location: z.string().max(500).optional(),
  folderId: z.string().optional().nullable(),
  roomId: z.string().optional().nullable(),
  nfcTagId: z.string().max(500).optional().nullable(),
  maintenanceIntervalDays: z.number().int().positive().optional().nullable(),
  imageUrl: z.string().max(500).optional().nullable(),
  status: z.enum(EQUIPMENT_STATUS_VALUES).optional(),
});

const bulkVerifyRoomSchema = z.object({
  roomId: z.string().min(1, "roomId is required"),
});

const checkoutSchema = z.object({
  location: z.string().max(500).optional(),
});

const scanSchema = z.object({
  status: z.enum(EQUIPMENT_STATUS_VALUES),
  note: z.string().trim().max(500).optional(),
  photoUrl: z.string().max(500).optional(),
});

const revertSchema = z.object({
  undoToken: z.string().min(1, "undoToken is required"),
});

const bulkIdsSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

const bulkMoveSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
  folderId: z.string().optional().nullable(),
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "text/csv" || file.mimetype === "text/plain" || file.originalname.endsWith(".csv")) {
      cb(null, true);
    } else {
      cb(new Error("Only CSV files are accepted"));
    }
  },
});

/*
 * PERMISSIONS MATRIX — /api/equipment
 * ─────────────────────────────────────────────────────
 * GET  /                  viewer+       List all equipment
 * GET  /my                viewer+       List equipment checked out by current user
 * GET  /:id               viewer+       Get single equipment item
 * GET  /:id/logs          viewer+       Scan log history for item
 * GET  /:id/transfers     viewer+       Transfer log history for item
 * POST /                  technician+   Create new equipment
 * POST /import            admin-only    Bulk CSV import
 * POST /bulk-delete       admin-only    Bulk delete
 * POST /bulk-move         technician+   Bulk folder move
 * POST /:id/scan          vet+          Record a scan/status update
 * POST /:id/checkout      technician+   Check out equipment
 * POST /:id/return        technician+   Return equipment
 * POST /:id/revert        vet+          Undo last scan within window
 * PATCH /:id              technician+   Edit equipment metadata
 * DELETE /:id             admin-only    Delete single equipment item
 * ─────────────────────────────────────────────────────
 */

const router = Router();

const _parsedUndoTtl = parseInt(process.env.UNDO_TTL_MS ?? "", 10);
const UNDO_TTL_MS = Number.isFinite(_parsedUndoTtl) && _parsedUndoTtl > 0 ? _parsedUndoTtl : 90_000;
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
    .update(undoTokens)
    .set({ consumed: true } as Partial<typeof undoTokens.$inferInsert>)
    .where(
      and(
        eq(undoTokens.id, tokenId),
        eq(undoTokens.equipmentId, equipmentId),
        eq(undoTokens.actorId, actorId),
        sql`consumed = false`,
        sql`expires_at > NOW()`
      )
    )
    .returning();

  if (!entry) return null;

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
        roomId: equipment.roomId,
        roomName: rooms.name,
        nfcTagId: equipment.nfcTagId,
        lastVerifiedAt: equipment.lastVerifiedAt,
        lastVerifiedById: equipment.lastVerifiedById,
        lastVerifiedByName: users.name,
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
      .leftJoin(folders, and(eq(equipment.folderId, folders.id), isNull(folders.deletedAt)))
      .leftJoin(rooms, eq(equipment.roomId, rooms.id))
      .leftJoin(users, eq(equipment.lastVerifiedById, users.id))
      .where(and(eq(equipment.checkedOutById, req.authUser!.id), isNull(equipment.deletedAt)))
      .orderBy(desc(equipment.checkedOutAt));
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch my equipment" });
  }
});

const EQUIPMENT_DEFAULT_PAGE_SIZE = 100;
const EQUIPMENT_MAX_PAGE_SIZE = 1000;

router.get("/", requireAuth, async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit as string, 10);
    const rawPage = parseInt(req.query.page as string, 10);
    const limit = (!isNaN(rawLimit) && rawLimit > 0)
      ? Math.min(rawLimit, EQUIPMENT_MAX_PAGE_SIZE)
      : EQUIPMENT_DEFAULT_PAGE_SIZE;
    const page = (!isNaN(rawPage) && rawPage > 1) ? rawPage : 1;
    const offset = (page - 1) * limit;

    const baseQuery = db
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
        roomId: equipment.roomId,
        roomName: rooms.name,
        nfcTagId: equipment.nfcTagId,
        lastVerifiedAt: equipment.lastVerifiedAt,
        lastVerifiedById: equipment.lastVerifiedById,
        lastVerifiedByName: users.name,
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
      .leftJoin(folders, and(eq(equipment.folderId, folders.id), isNull(folders.deletedAt)))
      .leftJoin(rooms, eq(equipment.roomId, rooms.id))
      .leftJoin(users, eq(equipment.lastVerifiedById, users.id))
      .where(isNull(equipment.deletedAt))
      .orderBy(desc(equipment.createdAt));

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(equipment)
      .where(isNull(equipment.deletedAt));
    const items = await baseQuery.limit(limit).offset(offset);
    res.json({ items, total, page, pageSize: limit, hasMore: offset + items.length < total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list equipment" });
  }
});

// GET /api/equipment/deleted — admin only, list soft-deleted equipment
router.get("/deleted", requireAuth, requireAdmin, async (req, res) => {
  try {
    const items = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        serialNumber: equipment.serialNumber,
        model: equipment.model,
        manufacturer: equipment.manufacturer,
        status: equipment.status,
        deletedAt: equipment.deletedAt,
        deletedBy: equipment.deletedBy,
        createdAt: equipment.createdAt,
      })
      .from(equipment)
      .where(isNotNull(equipment.deletedAt))
      .orderBy(desc(equipment.deletedAt));
    res.json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list deleted equipment" });
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
        roomId: equipment.roomId,
        roomName: rooms.name,
        nfcTagId: equipment.nfcTagId,
        lastVerifiedAt: equipment.lastVerifiedAt,
        lastVerifiedById: equipment.lastVerifiedById,
        lastVerifiedByName: users.name,
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
      .leftJoin(folders, and(eq(equipment.folderId, folders.id), isNull(folders.deletedAt)))
      .leftJoin(rooms, eq(equipment.roomId, rooms.id))
      .leftJoin(users, eq(equipment.lastVerifiedById, users.id))
      .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)))
      .limit(1);
    if (!item) return res.status(404).json({ error: "Equipment not found" });
    res.json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get equipment" });
  }
});

router.post("/", requireAuth, writeLimiter, requireRole("technician"), validateBody(createEquipmentSchema), async (req, res) => {
  try {
    const {
      name,
      serialNumber,
      model,
      manufacturer,
      purchaseDate,
      location,
      folderId,
      roomId,
      nfcTagId,
      maintenanceIntervalDays,
      imageUrl,
    } = req.body as z.infer<typeof createEquipmentSchema>;

    const [item] = await db
      .insert(equipment)
      .values({
        id: randomUUID(),
        name: name.trim(),
        serialNumber: serialNumber ?? null,
        model: model ?? null,
        manufacturer: manufacturer ?? null,
        purchaseDate: purchaseDate ?? null,
        location: location ?? null,
        folderId: folderId ?? null,
        roomId: roomId ?? null,
        nfcTagId: nfcTagId ?? null,
        maintenanceIntervalDays: maintenanceIntervalDays ?? null,
        imageUrl: imageUrl ?? null,
        status: "ok",
      })
      .returning();

    logAudit({
      actionType: "equipment_created",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: item.id,
      targetType: "equipment",
      metadata: { name: item.name, serialNumber: item.serialNumber },
    });

    invalidateAnalyticsCache();
    res.status(201).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create equipment" });
  }
});

router.patch("/:id", requireAuth, writeLimiter, requireRole("technician"), validateUuid("id"), validateBody(patchEquipmentSchema), async (req, res) => {
try {
    const {
      name,
      serialNumber,
      model,
      manufacturer,
      purchaseDate,
      location,
      folderId,
      roomId,
      nfcTagId,
      maintenanceIntervalDays,
      imageUrl,
      status,
    } = req.body as z.infer<typeof patchEquipmentSchema>;

    let result: EquipmentRow | null = null;

    await db.transaction(async (tx) => {
      const [oldItem] = await tx
        .select()
        .from(equipment)
        .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)))
        .limit(1);

      const [item] = await tx
        .update(equipment)
        .set({
          ...(name !== undefined && { name }),
          ...(serialNumber !== undefined && { serialNumber }),
          ...(model !== undefined && { model }),
          ...(manufacturer !== undefined && { manufacturer }),
          ...(purchaseDate !== undefined && { purchaseDate }),
          ...(location !== undefined && { location }),
          ...(folderId !== undefined && { folderId: folderId ?? null }),
          ...(roomId !== undefined && { roomId: roomId ?? null }),
          ...(nfcTagId !== undefined && { nfcTagId: nfcTagId ?? null }),
          ...(maintenanceIntervalDays !== undefined && { maintenanceIntervalDays }),
          ...(imageUrl !== undefined && { imageUrl }),
          ...(status !== undefined && { status }),
        })
        .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)))
        .returning();

      if (!item) return;
      result = item;

      if (folderId !== undefined && oldItem && oldItem.folderId !== (folderId ?? null)) {
        const [oldFolder] = oldItem.folderId
          ? await tx.select().from(folders).where(eq(folders.id, oldItem.folderId)).limit(1)
          : [null];
        const targetFolderId = folderId ?? null;
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
          });
        }
      }
    });

    if (!result) return res.status(404).json({ error: "Equipment not found" });

    logAudit({
      actionType: "equipment_updated",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "equipment",
      metadata: { name: (result as EquipmentRow).name, changes: req.body },
    });

    invalidateAnalyticsCache();
    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update equipment" });
  }
});

router.delete("/:id", requireAuth, writeLimiter, requireAdmin, validateUuid("id"), async (req, res) => {
try {
    const [existing] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Equipment not found" });

    await db
      .update(equipment)
      .set({ deletedAt: new Date(), deletedBy: req.authUser!.id })
      .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)));

    logAudit({
      actionType: "equipment_deleted",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "equipment",
      metadata: { name: existing.name, serialNumber: existing.serialNumber },
    });
    invalidateAnalyticsCache();
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete equipment" });
  }
});

// POST /api/equipment/:id/restore — admin only, restore a soft-deleted equipment record
router.post("/:id/restore", requireAuth, requireAdmin, validateUuid("id"), async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.id, req.params.id), isNotNull(equipment.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Equipment not found or not deleted" });

    const [restored] = await db
      .update(equipment)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(equipment.id, req.params.id))
      .returning();

    invalidateAnalyticsCache();
    res.json(restored);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to restore equipment" });
  }
});

// POST /api/equipment/:id/checkout
router.post("/:id/checkout", requireAuth, checkoutLimiter, requireRole("technician"), validateUuid("id"), validateBody(checkoutSchema), async (req, res) => {
  try {
    const { location } = req.body as z.infer<typeof checkoutSchema>;
    const clientTimestamp = parseInt(req.headers["x-client-timestamp"] as string || "0", 10);

    let updated: EquipmentRow | null = null;
    let undoToken = "";

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(equipment)
        .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)))
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

    const u = updated as EquipmentRow;

    logAudit({
      actionType: "equipment_checked_out",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "equipment",
      metadata: { name: u.name, location: req.body?.location ?? null },
    });

    invalidateAnalyticsCache();
    trackSyncSuccess();
    res.json({ equipment: updated, undoToken });

    if (!checkDedupe(u.id, "checkout")) {
      sendPushToAll({
        title: "Equipment Checked Out",
        body: `${u.name} checked out${req.body?.location ? ` — ${req.body.location}` : ""}`,
        tag: `checkout:${u.id}`,
        url: `/equipment/${u.id}`,
      });
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
    trackSyncFail();
    res.status(500).json({ error: "Checkout failed" });
  }
});

// POST /api/equipment/:id/return
router.post("/:id/return", requireAuth, checkoutLimiter, requireRole("technician"), validateUuid("id"), async (req, res) => {
  try {
    const clientTimestamp = parseInt(req.headers["x-client-timestamp"] as string || "0", 10);

    let updated: EquipmentRow | null = null;
    let undoToken = "";
    let alreadyReturned = false;

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(equipment)
        .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)))
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

    const u = updated as EquipmentRow;

    logAudit({
      actionType: "equipment_returned",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "equipment",
      metadata: { name: u.name },
    });

    invalidateAnalyticsCache();
    trackSyncSuccess();
    res.json({ equipment: updated, undoToken });

    if (!checkDedupe(u.id, "return")) {
      sendPushToAll({
        title: "Equipment Returned",
        body: `${u.name} has been returned and is available`,
        tag: `return:${u.id}`,
        url: `/equipment/${u.id}`,
      });
    }
  } catch (err) {
    console.error(err);
    trackSyncFail();
    res.status(500).json({ error: "Return failed" });
  }
});

// POST /api/equipment/:id/scan
router.post("/:id/scan", requireAuth, scanLimiter, requireRole("vet"), validateUuid("id"), validateBody(scanSchema), async (req, res) => {
  try {
    const { status, note, photoUrl } = req.body as z.infer<typeof scanSchema>;
    if (status === "issue" && !note?.trim()) {
      return res.status(400).json({ error: "Note is required when reporting an issue" });
    }

    const clientTimestamp = parseInt(req.headers["x-client-timestamp"] as string || "0", 10);
    const scanTime = clientTimestamp ? new Date(clientTimestamp) : new Date();

    let updatedEquipment: EquipmentRow | null = null;
    let scanLog: typeof scanLogs.$inferSelect | null = null;
    let undoToken = "";

    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(equipment)
        .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)))
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

    const eq2 = updatedEquipment as EquipmentRow;

    logAudit({
      actionType: "equipment_scanned",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "equipment",
      metadata: { name: eq2.name, status, note: note ?? null },
    });

    invalidateAnalyticsCache();
    trackSyncSuccess();
    res.json({ equipment: updatedEquipment, scanLog, undoToken });
    if (status === "issue" && !checkDedupe(eq2.id, "issue")) {
      sendPushToAll({
        title: "Equipment Issue Reported",
        body: `${eq2.name} needs attention${note ? ` — ${note}` : ""}`,
        tag: `issue:${eq2.id}`,
        url: `/equipment/${eq2.id}`,
      });
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
        });
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
        });
      }
    }
  } catch (err) {
    console.error(err);
    trackSyncFail();
    res.status(500).json({ error: "Scan failed" });
  }
});

// POST /api/equipment/:id/revert
router.post("/:id/revert", requireAuth, requireRole("vet"), validateUuid("id"), validateBody(revertSchema), async (req, res) => {
  try {
    const { undoToken: tokenId } = req.body as z.infer<typeof revertSchema>;

    const [existingItem] = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.id, req.params.id), isNull(equipment.deletedAt)))
      .limit(1);

    if (!existingItem) return res.status(404).json({ error: "Equipment not found" });

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

    logAudit({
      actionType: "equipment_reverted",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "equipment",
      metadata: { name: (updated as EquipmentRow | null)?.name ?? null },
    });

    invalidateAnalyticsCache();
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Revert failed" });
  }
});

const LOGS_DEFAULT_PAGE_SIZE = 50;
const LOGS_MAX_PAGE_SIZE = 200;

router.get("/:id/logs", requireAuth, async (req, res) => {
  try {
    const rawLimit = parseInt(req.query.limit as string, 10);
    const rawPage = parseInt(req.query.page as string, 10);
    const limit = (!isNaN(rawLimit) && rawLimit > 0)
      ? Math.min(rawLimit, LOGS_MAX_PAGE_SIZE)
      : LOGS_DEFAULT_PAGE_SIZE;
    const page = (!isNaN(rawPage) && rawPage > 1) ? rawPage : 1;
    const offset = (page - 1) * limit;

    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(scanLogs)
      .where(eq(scanLogs.equipmentId, req.params.id));

    const items = await db
      .select()
      .from(scanLogs)
      .where(eq(scanLogs.equipmentId, req.params.id))
      .orderBy(desc(scanLogs.timestamp))
      .limit(limit)
      .offset(offset);

    res.json({ items, total, page, pageSize: limit, hasMore: offset + items.length < total });
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

// ─── CSV helpers ────────────────────────────────────────────────────────────

const VALID_IMPORT_STATUSES = new Set(["ok", "issue", "maintenance", "sterilized"]);
const CSV_MAX_ROWS = 500;

interface CsvRow {
  name: string;
  serial: string;
  status: string;
  location: string;
  folder: string;
  maintenanceIntervalDays: string;
  notes: string;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(field.trim());
      field = "";
    } else {
      field += ch;
    }
  }
  fields.push(field.trim());
  return fields;
}

function parseCsv(csv: string): { headers: string[]; rows: string[][] } {
  const lines = csv.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length === 0) return { headers: [], rows: [] };
  const [headerLine, ...dataLines] = nonEmpty;
  const headers = parseCsvLine(headerLine).map((h) => h.toLowerCase().replace(/\s+/g, ""));
  const rows = dataLines.map((l) => parseCsvLine(l));
  return { headers, rows };
}

// POST /api/equipment/import — accepts multipart/form-data with a "file" field
// or JSON body with a "csv" string field (backwards-compatible)
router.post("/import", requireAuth, writeLimiter, requireAdmin, upload.single("file"), async (req, res) => {
try {
    let csv: string;
    if (req.file) {
      // Multipart upload
      csv = req.file.buffer.toString("utf-8");
    } else {
      const body = req.body as { csv?: string };
      if (!body.csv || typeof body.csv !== "string") {
        return res.status(400).json({ error: "Provide a CSV file upload (multipart field 'file') or JSON body with 'csv' string" });
      }
      csv = body.csv;
    }

    const { headers, rows } = parseCsv(csv);

    const nameIdx = headers.indexOf("name");
    const serialIdx = headers.indexOf("serial");
    const statusIdx = headers.indexOf("status");
    const locationIdx = headers.indexOf("location");
    const folderIdx = headers.indexOf("folder");
    const maintIdx = headers.indexOf("maintenanceintervaldays");

    if (nameIdx === -1) {
      return res.status(400).json({ error: "CSV must have a 'name' column" });
    }

    if (rows.length > CSV_MAX_ROWS) {
      return res.status(400).json({ error: `CSV exceeds max ${CSV_MAX_ROWS} rows` });
    }

    // Load existing serial numbers to detect duplicates against DB (exclude soft-deleted)
    const existingSerials = new Set<string>(
      (await db.select({ s: equipment.serialNumber }).from(equipment).where(isNull(equipment.deletedAt)))
        .map((r) => r.s)
        .filter((s): s is string => !!s)
        .map((s) => s.toLowerCase())
    );

    // Load folders by name for lookup (exclude soft-deleted)
    const allFolders = await db.select().from(folders).where(isNull(folders.deletedAt));
    const folderByName = new Map<string, string>(
      allFolders.map((f) => [f.name.toLowerCase(), f.id])
    );

    type SkipEntry = { row: number; reason: string; data: Partial<CsvRow> };
    const skipped: SkipEntry[] = [];

    type InsertRow = {
      id: string;
      name: string;
      serialNumber: string | null;
      status: string;
      location: string | null;
      folderId: string | null;
      maintenanceIntervalDays: number | null;
    };
    const toInsert: InsertRow[] = [];
    const seenSerials = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNum = i + 2; // 1-indexed, +1 for header
      const cols = rows[i];
      const get = (idx: number) => (idx >= 0 ? (cols[idx] ?? "").trim() : "");

      const name = get(nameIdx);
      const serial = get(serialIdx);
      const status = (get(statusIdx) || "ok").toLowerCase();
      const location = get(locationIdx);
      const folderName = get(folderIdx);
      const maintStr = get(maintIdx);

      const rowData: Partial<CsvRow> = { name, serial, status, location, folder: folderName };

      if (!name) {
        skipped.push({ row: rowNum, reason: "Name is required", data: rowData });
        continue;
      }
      if (name.length > FIELD_MAX_LENGTH) {
        skipped.push({ row: rowNum, reason: `Name exceeds ${FIELD_MAX_LENGTH} chars`, data: rowData });
        continue;
      }
      if (serial && serial.length > FIELD_MAX_LENGTH) {
        skipped.push({ row: rowNum, reason: `Serial exceeds ${FIELD_MAX_LENGTH} chars`, data: rowData });
        continue;
      }
      if (!VALID_IMPORT_STATUSES.has(status)) {
        skipped.push({
          row: rowNum,
          reason: `Invalid status "${status}" — must be ok, issue, maintenance, or sterilized`,
          data: rowData,
        });
        continue;
      }

      const serialLower = serial ? serial.toLowerCase() : null;
      if (serialLower) {
        if (existingSerials.has(serialLower)) {
          skipped.push({ row: rowNum, reason: `Serial "${serial}" already exists in the database`, data: rowData });
          continue;
        }
        if (seenSerials.has(serialLower)) {
          skipped.push({ row: rowNum, reason: `Duplicate serial "${serial}" within this CSV`, data: rowData });
          continue;
        }
        seenSerials.add(serialLower);
      }

      let maintenanceIntervalDays: number | null = null;
      if (maintStr) {
        const parsed = parseInt(maintStr, 10);
        if (isNaN(parsed) || parsed < 1) {
          skipped.push({ row: rowNum, reason: `maintenanceIntervalDays must be a positive integer (got "${maintStr}")`, data: rowData });
          continue;
        }
        maintenanceIntervalDays = parsed;
      }

      const folderId = folderName ? (folderByName.get(folderName.toLowerCase()) ?? null) : null;

      toInsert.push({
        id: randomUUID(),
        name: name.trim(),
        serialNumber: serial || null,
        status,
        location: location || null,
        folderId,
        maintenanceIntervalDays,
      });
    }

    if (toInsert.length === 0) {
      return res.status(200).json({ inserted: 0, skipped });
    }

    await db.transaction(async (tx) => {
      // Insert in batches of 50 to avoid overwhelming the DB
      const BATCH = 50;
      for (let b = 0; b < toInsert.length; b += BATCH) {
        await tx.insert(equipment).values(toInsert.slice(b, b + BATCH));
      }
    });

    logAudit({
      actionType: "equipment_imported",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: null,
      targetType: "equipment",
      metadata: { inserted: toInsert.length, skipped: skipped.length },
    });

    invalidateAnalyticsCache();
    res.json({ inserted: toInsert.length, skipped });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Import failed" });
  }
});

router.post("/bulk-delete", requireAuth, writeLimiter, requireAdmin, validateBody(bulkIdsSchema), async (req, res) => {
try {
    const { ids: typedIds } = req.body as z.infer<typeof bulkIdsSchema>;
    const actorName = req.authUser!.name || req.authUser!.email;

    await db.transaction(async (tx) => {
      const items = await tx
        .select({ id: equipment.id, name: equipment.name, status: equipment.status })
        .from(equipment)
        .where(and(inArray(equipment.id, typedIds), isNull(equipment.deletedAt)));

      const now = new Date();
      if (items.length > 0) {
        await tx.insert(scanLogs).values(
          items.map((item) => ({
            id: randomUUID(),
            equipmentId: item.id,
            userId: req.authUser!.id,
            userEmail: req.authUser!.email,
            status: item.status,
            note: `Bulk deleted by ${actorName}`,
            timestamp: now,
          }))
        );

        await tx
          .update(equipment)
          .set({ deletedAt: now, deletedBy: req.authUser!.id })
          .where(inArray(equipment.id, items.map((i) => i.id)));
      }

      logAudit({
        actionType: "equipment_bulk_deleted",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email,
        targetId: null,
        targetType: "equipment",
        metadata: { ids: typedIds, count: typedIds.length },
      });
    });

    invalidateAnalyticsCache();
    res.json({ affected: typedIds.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk delete failed" });
  }
});

router.post("/bulk-move", requireAuth, writeLimiter, requireRole("technician"), validateBody(bulkMoveSchema), async (req, res) => {
  try {
    const { ids: typedIds, folderId } = req.body as z.infer<typeof bulkMoveSchema>;
    const targetFolderId = folderId ?? null;

    let targetFolderName: string | null = null;

    await db.transaction(async (tx) => {
      const [targetFolder] = targetFolderId
        ? await tx.select().from(folders).where(eq(folders.id, targetFolderId)).limit(1)
        : [null];
      targetFolderName = targetFolder?.name ?? null;
      const moveNote = `Bulk moved to ${targetFolderName ?? "Unassigned"} (${typedIds.length} item${typedIds.length !== 1 ? "s" : ""})`;

      for (const id of typedIds) {
        const [item] = await tx
          .select()
          .from(equipment)
          .where(and(eq(equipment.id, id), isNull(equipment.deletedAt)))
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
          note: moveNote,
        });
      }
    });

    logAudit({
      actionType: "equipment_bulk_moved",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: targetFolderId,
      targetType: "folder",
      metadata: { ids: typedIds, count: typedIds.length, targetFolderName },
    });

    invalidateAnalyticsCache();
    res.json({ affected: typedIds.length });

    const toLabel = targetFolderName ?? "Unassigned";
    sendPushToAll({
      title: "Bulk Transfer",
      body: `${typedIds.length} item${typedIds.length !== 1 ? "s" : ""} moved to ${toLabel}`,
      tag: `bulk-move:${Date.now()}`,
      url: "/",
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Bulk move failed" });
  }
});

// POST /api/equipment/bulk-verify-room
// Marks every item in a room as verified and sets the room's sync status to 'synced'.
router.post(
  "/bulk-verify-room",
  requireAuth,
  requireRole("technician"),
  validateBody(bulkVerifyRoomSchema),
  async (req, res) => {
    try {
      const { roomId: targetRoomId } = req.body as z.infer<typeof bulkVerifyRoomSchema>;

      let affected = 0;
      let roomName = "";

      await db.transaction(async (tx) => {
        // 1. Confirm the room exists
        const [room] = await tx
          .select()
          .from(rooms)
          .where(eq(rooms.id, targetRoomId))
          .limit(1);

        if (!room) {
          throw Object.assign(new Error("Room not found"), { status: 404 });
        }
        roomName = room.name;

        // 2. Fetch all active equipment in the room
        const items = await tx
          .select({ id: equipment.id, name: equipment.name, status: equipment.status })
          .from(equipment)
          .where(and(eq(equipment.roomId, targetRoomId), isNull(equipment.deletedAt)));

        if (items.length === 0) {
          // Nothing to verify — still mark room synced
          await tx
            .update(rooms)
            .set({ syncStatus: "synced", lastAuditAt: new Date(), updatedAt: new Date() })
            .where(eq(rooms.id, targetRoomId));
          return;
        }

        const now = new Date();
        const itemIds = items.map((i) => i.id);

        // 3. Stamp every item with lastVerifiedAt + lastVerifiedById + lastSeen
        await tx
          .update(equipment)
          .set({
            lastVerifiedAt: now,
            lastVerifiedById: req.authUser!.id,
            lastSeen: now,
          })
          .where(inArray(equipment.id, itemIds));

        // 4. Insert a scan log entry per item for audit trail
        await tx.insert(scanLogs).values(
          items.map((item) => ({
            id: randomUUID(),
            equipmentId: item.id,
            userId: req.authUser!.id,
            userEmail: req.authUser!.email,
            status: item.status,
            note: `Room verified: ${room.name}`,
            timestamp: now,
          }))
        );

        // 5. Update the room's sync status
        await tx
          .update(rooms)
          .set({ syncStatus: "synced", lastAuditAt: now, updatedAt: now })
          .where(eq(rooms.id, targetRoomId));

        affected = items.length;
      });

      logAudit({
        actionType: "room_bulk_verified",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email,
        targetId: targetRoomId,
        targetType: "room",
        metadata: { roomName, count: affected },
      });

      res.json({ affected, roomName });
    } catch (err: unknown) {
      if (err instanceof Error && (err as Error & { status?: number }).status === 404) {
        return res.status(404).json({ error: "Room not found" });
      }
      console.error(err);
      res.status(500).json({ error: "Bulk verify failed" });
    }
  }
);

export default router;
