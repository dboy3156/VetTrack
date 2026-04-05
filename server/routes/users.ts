import { Router } from "express";
import { randomUUID } from "crypto";
import { db, users } from "../db.js";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/me", requireAuth, async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    res.json(req.authUser);
  } catch (err) {
    res.status(500).json({ error: "Failed to get user" });
  }
});

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const allUsers = await db.select().from(users).orderBy(users.createdAt);
    res.json(allUsers);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list users" });
  }
});

router.patch("/:id/role", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { role } = req.body;
    if (!["admin", "vet", "technician", "viewer"].includes(role)) {
      return res.status(400).json({ error: "Invalid role" });
    }

    const [user] = await db
      .update(users)
      .set({ role })
      .where(eq(users.id, req.params.id))
      .returning();

    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update role" });
  }
});

router.post("/sync", requireAuth, async (req, res) => {
  try {
    const { clerkId, email, name } = req.body;
    if (!clerkId || !email) return res.status(400).json({ error: "Missing fields" });

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
