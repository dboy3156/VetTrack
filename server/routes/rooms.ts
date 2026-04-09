import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, rooms, equipment } from "../db.js";
import { eq, and, isNull, isNotNull, sql } from "drizzle-orm";
import { requireAuth, requireAdmin, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { logAudit } from "../lib/audit.js";

/*
 * PERMISSIONS MATRIX — /api/rooms
 * ─────────────────────────────────────────────────────
 * GET  /           viewer+       List rooms with equipment counts
 * GET  /:id        viewer+       Get single room
 * POST /           technician+   Create room
 * PATCH /:id       admin-only    Update room metadata
 * DELETE /:id      admin-only    Delete room (must be empty)
 * ─────────────────────────────────────────────────────
 */

const router = Router();

const createRoomSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  floor: z.string().max(100).optional(),
  masterNfcTagId: z.string().max(200).optional(),
});

const patchRoomSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  floor: z.string().max(100).optional().nullable(),
  masterNfcTagId: z.string().max(200).optional().nullable(),
  syncStatus: z.enum(["synced", "stale", "requires_audit"]).optional(),
});

// GET /api/rooms — list all rooms with per-room equipment counts
router.get("/", requireAuth, async (req, res) => {
  try {
    const allRooms = await db
      .select()
      .from(rooms)
      .orderBy(rooms.name);

    if (allRooms.length === 0) {
      return res.json([]);
    }

    const counts = await db
      .select({
        roomId: equipment.roomId,
        total: sql<number>`count(*)::int`,
        inUse: sql<number>`count(*) filter (where ${equipment.checkedOutById} is not null)::int`,
        issue: sql<number>`count(*) filter (where ${equipment.status} in ('issue', 'maintenance'))::int`,
      })
      .from(equipment)
      .where(and(isNotNull(equipment.roomId), isNull(equipment.deletedAt)))
      .groupBy(equipment.roomId);

    const countMap = new Map(counts.map((c) => [c.roomId, c]));

    const result = allRooms.map((room) => {
      const c = countMap.get(room.id);
      const total = c?.total ?? 0;
      const inUse = c?.inUse ?? 0;
      const issue = c?.issue ?? 0;
      return {
        ...room,
        totalEquipment: total,
        availableCount: total - inUse,
        inUseCount: inUse,
        issueCount: issue,
      };
    });

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list rooms" });
  }
});

// GET /api/rooms/:id — single room with counts
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const [room] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, req.params.id))
      .limit(1);

    if (!room) return res.status(404).json({ error: "Room not found" });

    const [counts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        inUse: sql<number>`count(*) filter (where ${equipment.checkedOutById} is not null)::int`,
        issue: sql<number>`count(*) filter (where ${equipment.status} in ('issue', 'maintenance'))::int`,
      })
      .from(equipment)
      .where(and(eq(equipment.roomId, room.id), isNull(equipment.deletedAt)));

    const total = counts?.total ?? 0;
    const inUse = counts?.inUse ?? 0;
    const issue = counts?.issue ?? 0;

    res.json({
      ...room,
      totalEquipment: total,
      availableCount: total - inUse,
      inUseCount: inUse,
      issueCount: issue,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch room" });
  }
});

// POST /api/rooms — create room
router.post("/", requireAuth, requireRole("technician"), validateBody(createRoomSchema), async (req, res) => {
  try {
    const { name, floor, masterNfcTagId } = req.body as z.infer<typeof createRoomSchema>;

    const [existing] = await db
      .select({ id: rooms.id })
      .from(rooms)
      .where(eq(rooms.name, name.trim()))
      .limit(1);

    if (existing) {
      return res.status(409).json({ error: "A room with that name already exists" });
    }

    const now = new Date();
    const [room] = await db
      .insert(rooms)
      .values({
        id: randomUUID(),
        name: name.trim(),
        floor: floor?.trim() ?? null,
        masterNfcTagId: masterNfcTagId?.trim() ?? null,
        syncStatus: "stale",
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    logAudit({
      actionType: "room_created",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: room.id,
      targetType: "room",
      metadata: { name: room.name, floor: room.floor },
    });

    res.status(201).json(room);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create room" });
  }
});

// PATCH /api/rooms/:id — update room metadata
router.patch("/:id", requireAuth, requireAdmin, validateBody(patchRoomSchema), async (req, res) => {
  try {
    const { name, floor, masterNfcTagId, syncStatus } = req.body as z.infer<typeof patchRoomSchema>;

    const [existing] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, req.params.id))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Room not found" });

    if (name !== undefined && name.trim() !== existing.name) {
      const [conflict] = await db
        .select({ id: rooms.id })
        .from(rooms)
        .where(eq(rooms.name, name.trim()))
        .limit(1);
      if (conflict) return res.status(409).json({ error: "A room with that name already exists" });
    }

    const [updated] = await db
      .update(rooms)
      .set({
        ...(name !== undefined && { name: name.trim() }),
        ...(floor !== undefined && { floor: floor ?? null }),
        ...(masterNfcTagId !== undefined && { masterNfcTagId: masterNfcTagId ?? null }),
        ...(syncStatus !== undefined && { syncStatus }),
        updatedAt: new Date(),
      })
      .where(eq(rooms.id, req.params.id))
      .returning();

    logAudit({
      actionType: "room_updated",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "room",
      metadata: { previousName: existing.name, changes: req.body },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update room" });
  }
});

// DELETE /api/rooms/:id — admin only, only if room has no equipment assigned
router.delete("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(rooms)
      .where(eq(rooms.id, req.params.id))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "Room not found" });

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(equipment)
      .where(and(eq(equipment.roomId, req.params.id), isNull(equipment.deletedAt)));

    if (count > 0) {
      return res.status(409).json({
        error: `Cannot delete room — ${count} item${count !== 1 ? "s" : ""} still assigned to it`,
      });
    }

    await db.delete(rooms).where(eq(rooms.id, req.params.id));

    logAudit({
      actionType: "room_deleted",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "room",
      metadata: { name: existing.name },
    });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete room" });
  }
});

export default router;
