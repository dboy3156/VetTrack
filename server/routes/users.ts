import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, users } from "../db.js";
import { eq, sql, isNull, isNotNull, desc, and } from "drizzle-orm";
import { requireAuth, requireAuthAny, requireAdmin } from "../middleware/auth.js";
import { clerkClient } from "@clerk/express";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { authSensitiveLimiter } from "../middleware/rate-limiters.js";
import { logAudit } from "../lib/audit.js";
import { resolveCurrentRole } from "../lib/role-resolution.js";

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

const userFields = {
  id: users.id,
  email: users.email,
  name: users.name,
  displayName: users.displayName,
  role: users.role,
  status: users.status,
  createdAt: users.createdAt,
};

const VALID_ROLES = ["admin", "vet", "technician", "viewer"] as const;
const VALID_STATUSES = ["pending", "active", "blocked"] as const;

const patchRoleSchema = z.object({
  role: z.enum(VALID_ROLES, { required_error: "role is required" }),
});

const patchStatusSchema = z.object({
  status: z.enum(VALID_STATUSES, { required_error: "status is required" }),
});

const patchDisplayNameSchema = z.object({
  display_name: z.string().trim().min(1, "display_name is required").max(60, "display_name is too long"),
});

const syncUserSchema = z.object({
  clerkId: z.string().min(1, "clerkId is required"),
  email: z.string().email("email must be a valid email address"),
  name: z.string().optional(),
});

function normalizeIdentityValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isDemoIdentity(clerkId: string, email: string, name: string): boolean {
  const id = clerkId.toLowerCase();
  const em = email.toLowerCase();
  const nm = name.toLowerCase();
  const local = em.includes("@") ? em.split("@")[0] : em;

  return (
    id.startsWith("demo") ||
    id.includes("demo-") ||
    local.startsWith("demo") ||
    local.includes("+demo") ||
    nm.includes("demo")
  );
}

function serializeUser(user: typeof users.$inferSelect) {
  return {
    ...user,
  };
}

router.get("/me", requireAuth, async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    const resolved = await resolveCurrentRole({
      clinicId: req.clinicId!,
      userName: req.authUser.name,
      fallbackRole: req.authUser.role,
    });
    res.json({
      ...req.authUser,
      effectiveRole: resolved.effectiveRole,
      roleSource: resolved.source,
      activeShift: resolved.activeShift,
      resolvedAt: resolved.resolvedAt.toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.get("/deleted", requireAuth, requireAdmin, async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const deletedUsers = await db
      .select({ ...userFields, deletedAt: users.deletedAt })
      .from(users)
      .where(and(eq(users.clinicId, clinicId), isNotNull(users.deletedAt)))
      .orderBy(desc(users.deletedAt));
    res.json(deletedUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list deleted users" });
  }
});

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const clinicId = req.clinicId!;
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
      ? db
          .select(userFields)
          .from(users)
          .where(and(eq(users.clinicId, clinicId), eq(users.status, status as string), isNull(users.deletedAt)))
      : db.select(userFields).from(users).where(and(eq(users.clinicId, clinicId), isNull(users.deletedAt))).orderBy(users.createdAt);

    const whereClause = status
      ? and(eq(users.clinicId, clinicId), eq(users.status, status as string), isNull(users.deletedAt))
      : and(eq(users.clinicId, clinicId), isNull(users.deletedAt));
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
    const clinicId = req.clinicId!;
    const pendingUsers = await db
      .select(userFields)
      .from(users)
      .where(and(eq(users.clinicId, clinicId), eq(users.status, "pending"), isNull(users.deletedAt)))
      .orderBy(users.createdAt);
    res.json(pendingUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list pending users" });
  }
});

router.patch("/:id/role", requireAuth, requireAdmin, validateUuid("id"), validateBody(patchRoleSchema), async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const { role } = req.body as z.infer<typeof patchRoleSchema>;

    const [target] = await db
      .select()
      .from(users)
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id), isNull(users.deletedAt)))
      .limit(1);

    if (!target) return res.status(404).json({ error: "User not found" });

    if (target.role === "admin" && role !== "admin") {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.clinicId, clinicId), eq(users.role, "admin"), isNull(users.deletedAt)));
      if (count <= 1) {
        return res.status(409).json({ error: "Cannot demote the last admin. Promote another user to admin first." });
      }
    }

    const [user] = await db
      .update(users)
      .set({ role })
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id), isNull(users.deletedAt)))
      .returning();

    logAudit({
      clinicId,
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
    const clinicId = req.clinicId!;
    const { status } = req.body as z.infer<typeof patchStatusSchema>;

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id), isNull(users.deletedAt)))
      .limit(1);

    const [user] = await db
      .update(users)
      .set({ status })
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id), isNull(users.deletedAt)))
      .returning();

    if (!user) return res.status(404).json({ error: "User not found" });

    logAudit({
      clinicId,
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

router.patch("/:id/display_name", requireAuthAny, validateUuid("id"), validateBody(patchDisplayNameSchema), async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    const clinicId = req.clinicId!;

    const { display_name } = req.body as z.infer<typeof patchDisplayNameSchema>;
    const actorId = req.authUser.id;

    if (actorId !== req.params.id && req.authUser.role !== "admin") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id), isNull(users.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "User not found" });

    const [updated] = await db
      .update(users)
      .set({ displayName: display_name })
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id)))
      .returning();

    logAudit({
      clinicId,
      actionType: "user_display_name_changed",
      performedBy: actorId,
      performedByEmail: req.authUser.email,
      targetId: req.params.id,
      targetType: "user",
      metadata: {
        field: "display_name",
        previousDisplayName: existing.displayName,
        newDisplayName: updated.displayName,
      },
    });

    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update display name" });
  }
});

router.patch("/:id/delete", requireAuthAny, validateUuid("id"), async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    const clinicId = req.clinicId!;

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id), isNull(users.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "User not found" });

    const actorId = req.authUser.id;
    const isSelf = actorId === req.params.id;
    const isAdmin = req.authUser.role === "admin";
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (existing.role === "admin" && isAdmin && !isSelf) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(and(eq(users.clinicId, clinicId), eq(users.role, "admin"), isNull(users.deletedAt)));
      if (count <= 1) {
        return res.status(409).json({ error: "Cannot delete the last admin. Promote another user to admin first." });
      }
    }

    const [deleted] = await db
      .update(users)
      .set({ deletedAt: new Date(), deletedBy: actorId })
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id), isNull(users.deletedAt)))
      .returning();

    if (!deleted) return res.status(404).json({ error: "User not found" });

    logAudit({
      clinicId,
      actionType: "user_deleted",
      performedBy: actorId,
      performedByEmail: req.authUser.email,
      targetId: req.params.id,
      targetType: "user",
      metadata: { email: deleted.email, role: deleted.role },
    });

    res.json(deleted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

router.patch("/:id/restore", requireAuthAny, validateUuid("id"), async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    const clinicId = req.clinicId!;

    const actorId = req.authUser.id;
    const isSelf = actorId === req.params.id;
    const isAdmin = req.authUser.role === "admin";
    if (!isSelf && !isAdmin) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id), isNotNull(users.deletedAt)))
      .limit(1);

    if (!existing) return res.status(404).json({ error: "User not found or not deleted" });

    const [restored] = await db
      .update(users)
      .set({ deletedAt: null, deletedBy: null })
      .where(and(eq(users.clinicId, clinicId), eq(users.id, req.params.id)))
      .returning();

    logAudit({
      clinicId,
      actionType: "user_restored",
      performedBy: actorId,
      performedByEmail: req.authUser.email,
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
    const clinicId = req.clinicId!;
    const { clerkId, email, name } = req.body as z.infer<typeof syncUserSchema>;

    if (clerkId !== req.authUser!.clerkId) {
      return res.status(403).json({ error: "Cannot sync a different user's data" });
    }

    const [existing] = await db
      .select()
      .from(users)
      .where(and(eq(users.clinicId, clinicId), eq(users.clerkId, clerkId), isNull(users.deletedAt)))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({
          name: name || existing.name,
          email: email || existing.email,
        })
        .where(and(eq(users.clinicId, clinicId), eq(users.id, existing.id)))
        .returning();

      logAudit({
        clinicId,
        actionType: "user_login",
        performedBy: existing.id,
        performedByEmail: email,
        targetId: existing.id,
        targetType: "user",
        metadata: { name },
      });

      return res.json(serializeUser(updated));
    }

    const insertedId = randomUUID();
    let newUser;
    let wasCreated = true;
    try {
      [newUser] = await db
        .insert(users)
        .values({
          id: insertedId,
          clinicId,
          clerkId,
          email,
          name: name || "",
          displayName: name || email,
          role: "technician",
        })
        .onConflictDoUpdate({
          target: users.clerkId,
          set: {
            name: sql`
      CASE 
        WHEN EXCLUDED.name = '' THEN ${users.name} 
        ELSE EXCLUDED.name 
      END
    `,
            email: sql`
      CASE 
        WHEN EXCLUDED.email = '' THEN ${users.email} 
        ELSE EXCLUDED.email 
      END
    `,
            clinicId,
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
          .where(and(eq(users.clinicId, clinicId), eq(users.clerkId, clerkId), isNull(users.deletedAt)))
          .limit(1);
        if (race) {
          return res.json({
            ...serializeUser(race),
          });
        }
      }
      throw insertErr;
    }

    if (wasCreated) {
      logAudit({
        clinicId,
        actionType: "user_provisioned",
        performedBy: newUser.id,
        performedByEmail: email,
        targetId: newUser.id,
        targetType: "user",
        metadata: { name, role: "technician" },
      });
    } else {
      logAudit({
        clinicId,
        actionType: "user_login",
        performedBy: newUser.id,
        performedByEmail: email,
        targetId: newUser.id,
        targetType: "user",
        metadata: { name, recoveredFromRace: true },
      });
    }

    res.status(wasCreated ? 201 : 200).json(serializeUser(newUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to sync user" });
  }
});

router.post("/backfill-clerk", requireAuth, requireAdmin, authSensitiveLimiter, async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const actor = req.authUser!;
    const pageSize = 100;
    let offset = 0;

    let scanned = 0;
    let inserted = 0;
    let updated = 0;
    let skippedDemo = 0;
    let skippedIncomplete = 0;

    while (true) {
      const page = await clerkClient.organizations.getOrganizationMembershipList({
        organizationId: clinicId,
        limit: pageSize,
        offset,
      });
      const memberships = (page.data ?? []) as Array<{
        publicUserData?: {
          userId?: string;
          identifier?: string;
          firstName?: string;
          lastName?: string;
        };
      }>;

      if (memberships.length === 0) break;

      for (const membership of memberships) {
        scanned += 1;
        const clerkId = normalizeIdentityValue(membership.publicUserData?.userId);
        const email = normalizeIdentityValue(membership.publicUserData?.identifier).toLowerCase();
        const firstName = normalizeIdentityValue(membership.publicUserData?.firstName);
        const lastName = normalizeIdentityValue(membership.publicUserData?.lastName);
        const name = `${firstName} ${lastName}`.trim();
        const displayName = name || email;

        if (!clerkId || !email) {
          skippedIncomplete += 1;
          continue;
        }

        if (isDemoIdentity(clerkId, email, displayName)) {
          skippedDemo += 1;
          continue;
        }

        const [existing] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(eq(users.clerkId, clerkId), eq(users.clinicId, clinicId)))
          .limit(1);

        const [row] = await db
          .insert(users)
          .values({
            id: existing?.id ?? randomUUID(),
            clinicId,
            clerkId,
            email,
            name,
            displayName,
            role: "technician",
            status: "active",
          })
          .onConflictDoUpdate({
            target: users.clerkId,
            set: {
              clinicId,
              email,
              name: sql`CASE WHEN EXCLUDED.name = '' THEN ${users.name} ELSE EXCLUDED.name END`,
              displayName: sql`CASE WHEN EXCLUDED.display_name = '' THEN ${users.displayName} ELSE EXCLUDED.display_name END`,
              deletedAt: null,
              deletedBy: null,
            },
          })
          .returning({ id: users.id });

        if (existing?.id || row.id === existing?.id) {
          updated += 1;
        } else {
          inserted += 1;
        }
      }

      if (memberships.length < pageSize) break;
      offset += memberships.length;
    }

    logAudit({
      clinicId,
      actionType: "users_backfilled_from_clerk",
      performedBy: actor.id,
      performedByEmail: actor.email,
      targetType: "user",
      metadata: { scanned, inserted, updated, skippedDemo, skippedIncomplete },
    });

    return res.json({
      ok: true,
      scanned,
      inserted,
      updated,
      skippedDemo,
      skippedIncomplete,
    });
  } catch (err) {
    console.error("users:backfill-clerk", err);
    return res.status(500).json({ error: "Failed to backfill users from Clerk" });
  }
});

export default router;
