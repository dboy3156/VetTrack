import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, users } from "../db.js";
import { eq, sql, isNull, isNotNull, desc, and } from "drizzle-orm";
import { requireAuth, requireAuthAny, requireAdmin } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { authSensitiveLimiter } from "../middleware/rate-limiters.js";
import { logAudit } from "../lib/audit.js";

/*
 * PERMISSIONS MATRIX — /api/users
 * ─────────────────────────────────────────────────────
 * GET   /me          viewer+     Current authenticated user's profile
 * GET   /            admin-only  List all users
 * PATCH /:id/role    admin-only  Change a user's role
 * POST  /sync        viewer+     Sync Clerk identity to DB record
 * ─────────────────────────────────────────────────────
 * Role is always resolved from the DB record — never from request
 * headers, body, or JWT claims.
 */

const router = Router();

const VALID_ROLES = ["admin", "vet", "technician", "viewer"] as const;
const VALID_STATUSES = ["pending", "active", "blocked"] as const;

const patchRoleSchema = z.object({
  role: z.enum(VALID_ROLES, { required_error: "role is required" }),
});

const patchStatusSchema = z.object({
  status: z.enum(VALID_STATUSES, { required_error: "status is required" }),
});

const syncUserSchema = z.object({
  clerkId: z.string().min(1, "clerkId is required"),
  email: z.string().email("email must be a valid email address"),
  name: z.string().optional(),
});

router.get("/me", requireAuth, async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    res.json(req.authUser);
  } catch (err) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.get("/deleted", requireAuth, requireAdmin, async (req, res) => {
  try {
    const deletedUsers = await db
      .select()
      .from(users)
      .where(isNotNull(users.deletedAt))
      .orderBy(desc(users.deletedAt));
    res.json(deletedUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list deleted users" });
  }
});

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const validStatuses = ["pending", "active", "blocked"];
    if (status !== undefined && !validStatuses.includes(status as string)) {
      return res.status(400).json({ error: "Invalid status filter. Must be one of: pending, active, blocked" });
    }

    const rawLimit = parseInt(req.query.limit as string, 10);
    const rawPage = parseInt(req.query.page as string, 10);
    const resolvedLimit = (!isNaN(rawLimit) && rawLimit > 0) ? Math.min(rawLimit, 200) : 100;
    const page = (!isNaN(rawPage) && rawPage > 1) ? rawPage : 1;
    const resolvedOffset = (page - 1) * resolvedLimit;

    const baseQuery = status
      ? db.select().from(users).where(and(eq(users.status, status as string), isNull(users.deletedAt))).orderBy(users.createdAt)
      : db.select().from(users).where(isNull(users.deletedAt)).orderBy(users.createdAt);

    const whereClause = status
      ? and(eq(users.status, status as string), isNull(users.deletedAt))
      : isNull(users.deletedAt);
    const [{ total }] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(whereClause);
    const items = await baseQuery.limit(resolvedLimit).offset(resolvedOffset);
    res.json({ items, total, page, pageSize: resolvedLimit, hasMore: resolvedOffset + items.length < total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.get("/pending", requireAuth, requireAdmin, async (req, res) => {
  try {
    const pendingUsers = await db
      .select()
      .from(users)
      .where(and(eq(users.status, "pending"), isNull(users.deletedAt)))
      .orderBy(users.createdAt);
    res.json(pendingUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list pending users" });
  }
});

router.patch("/:id/role", requireAuth, requireAdmin, validateUuid("id"), validateBody(patchRoleSchema), async (req, res) => {
  try {
    const { role } = req.body as z.infer<typeof patchRoleSchema>;

    const [target] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.params.id))
      .limit(1);

    if (!target) return res.status(404).json({ error: "User not found" });

    if (target.role === "admin" && role !== "admin") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));
      if (count <= 1) {
        return res.status(409).json({ error: "Cannot demote the last admin. Promote another user to admin first." });
      }
    }

    const [user] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, req.params.id))
      .returning();

    logAudit({
      actionType: "user_role_changed",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "user",
      metadata: { previousRole: target.role, newRole: role, targetEmail: target.email },
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.patch("/:id/status", requireAuth, requireAdmin, validateUuid("id"), validateBody(patchStatusSchema), async (req, res) => {
  try {
    const { status } = req.body as z.infer<typeof patchStatusSchema>;

    const [existing] = await db
      .select()
      .from(users)
      .where(eq(users.id, req.params.id))
      .limit(1);

    const [user] = await db
      .update(users)
      .set({ status })
      .where(eq(users.id, req.params.id))
      .returning();

    if (!user) return res.status(404).json({ error: "User not found" });

    logAudit({
      actionType: "user_status_changed",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "user",
      metadata: { previousStatus: existing?.status, newStatus: status, targetEmail: user.email },
    });

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update status" });
  }
});

router.delete("/:id", requireAuth, requireAdmin, validateUuid("id"), async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, req.params.id), isNull(users.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "User not found" });

    if (existing.id === req.authUser!.id) {
      return res.status(400).json({ error: "Cannot delete your own account" });
    }

    if (existing.role === "admin") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.role, "admin"), isNull(users.deletedAt)));
      if (count <= 1) {
        return res.status(409).json({ error: "Cannot delete the last admin. Promote another user to admin first." });
      }
    }

    const [deleted] = await db
      .update(users)
      .set({ deletedAt: new Date(), deletedBy: req.authUser!.id })
      .where(and(eq(users.id, req.params.id), isNull(users.deletedAt)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "User not found" });

    logAudit({
      actionType: "user_deleted",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "user",
      metadata: { email: deleted.email, role: deleted.role },
    });

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.post("/:id/restore", requireAuth, requireAdmin, validateUuid("id"), async (req, res) => {
  try {
    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, req.params.id), isNotNull(users.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "User not found or not deleted" });

    const [restored] = await db
      .update(users)
      .set({ deletedAt: null, deletedBy: null })
      .where(eq(users.id, req.params.id))
      .returning();

    logAudit({
      actionType: "user_restored",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email,
      targetId: req.params.id,
      targetType: "user",
      metadata: { email: restored.email, role: restored.role },
    });

    res.json(restored);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to restore user" });
  }
});
router.post("/sync", requireAuth, authSensitiveLimiter, validateBody(syncUserSchema), async (req, res) => {
  try {
    const { clerkId, email, name } = req.body as z.infer<typeof syncUserSchema>;

    if (clerkId !== req.authUser!.clerkId) {
      return res.status(403).json({ error: "Cannot sync a different user's data" });
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.clerkId, clerkId), isNull(users.deletedAt)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({ email, name: name || existing.name })
        .where(eq(users.id, existing.id))
        .returning();

      logAudit({
        actionType: "user_login",
        performedBy: existing.id,
        performedByEmail: email,
        targetId: existing.id,
        targetType: "user",
        metadata: { name },
      });

      return res.json(updated);
    }

    const insertedId = randomUUID();
    let newUser;
    let wasCreated = true;
    try {
      [newUser] = await db
        .insert(users)
        .values({
          id: insertedId,
          clerkId,
          email,
          name: name || "",
          role: "technician",
        })
        .onConflictDoUpdate({
          target: users.clerkId,
          set: {
            email: sql`CASE WHEN EXCLUDED.email = '' THEN ${users.email} ELSE EXCLUDED.email END`,
            name: sql`CASE WHEN EXCLUDED.name = '' THEN ${users.name} ELSE EXCLUDED.name END`,
          },
        })
        .returning();
      wasCreated = newUser.id === insertedId;
    } catch (insertErr: unknown) {
      const pgErr = insertErr as { code?: string };
      if (pgErr?.code === "23505") {
        console.warn("sync: duplicate clerkId race condition caught, fetching existing record", { clerkId });
        const [race] = await db
          .select()
          .from(users)
          .where(eq(users.clerkId, clerkId))
          .limit(1);
        if (race) return res.json(race);
      }
      throw insertErr;
    }

    if (wasCreated) {
      logAudit({
        actionType: "user_provisioned",
        performedBy: newUser.id,
        performedByEmail: email,
        targetId: newUser.id,
        targetType: "user",
        metadata: { name, role: "technician" },
      });
    } else {
      logAudit({
        actionType: "user_login",
        performedBy: newUser.id,
        performedByEmail: email,
        targetId: newUser.id,
        targetType: "user",
        metadata: { name, recoveredFromRace: true },
      });
    }

    res.status(wasCreated ? 201 : 200).json(newUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to sync user" });
  }
});

export default router;
