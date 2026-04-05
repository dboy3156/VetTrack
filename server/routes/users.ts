import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, users } from "../db.js";
import { eq, sql } from "drizzle-orm";
import { requireAuth, requireAuthAny, requireAdmin } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { authSensitiveLimiter } from "../middleware/rate-limiters.js";

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

router.get("/me", requireAuthAny, async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    res.json(req.authUser);
  } catch (err) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const validStatuses = ["pending", "active", "blocked"];
    if (status !== undefined && !validStatuses.includes(status as string)) {
      return res.status(400).json({ error: "Invalid status filter. Must be one of: pending, active, blocked" });
    }
    const query = db.select().from(users);
    const allUsers = status
      ? await query.where(eq(users.status, status as string)).orderBy(users.createdAt)
      : await query.orderBy(users.createdAt);
    res.json(allUsers);
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
      .where(eq(users.status, "pending"))
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
        .where(eq(users.role, "admin"));
      if (count <= 1) {
        return res.status(400).json({ error: "Cannot remove or demote the last admin" });
      }
    }

    const [user] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, req.params.id))
      .returning();

    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.patch("/:id/status", requireAuth, requireAdmin, validateUuid("id"), validateBody(patchStatusSchema), async (req, res) => {
  try {
    const { status } = req.body as z.infer<typeof patchStatusSchema>;

    const [user] = await db
      .update(users)
      .set({ status })
      .where(eq(users.id, req.params.id))
      .returning();

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update status" });
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
      .where(eq(users.clerkId, clerkId))
      .limit(1);

    if (existing) {
      const [updated] = await db
        .update(users)
        .set({ email, name: name || existing.name })
        .where(eq(users.id, existing.id))
        .returning();
      return res.json(updated);
    }

    const [newUser] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        clerkId,
        email,
        name: name || "",
        role: "technician",
      })
      .returning();

    res.status(201).json(newUser);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to sync user" });
  }
});

export default router;
