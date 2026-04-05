import { Router } from "express";
import { randomUUID } from "crypto";
import { db, supportTickets, users } from "../db.js";
import { eq, desc, ne, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { sendPushToAll } from "../lib/push.js";

const router = Router();

router.post("/", requireAuth, async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });

    const { title, description, severity, pageUrl, deviceInfo, appVersion } = req.body;

    if (!title || !description) {
      return res.status(400).json({ error: "title and description are required" });
    }

    const validSeverities = ["low", "medium", "high"];
    const ticketSeverity = validSeverities.includes(severity) ? severity : "medium";

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        id: randomUUID(),
        title,
        description,
        severity: ticketSeverity,
        status: "open",
        userId: req.authUser.id,
        userEmail: req.authUser.email,
        pageUrl: pageUrl || null,
        deviceInfo: deviceInfo || null,
        appVersion: appVersion || null,
        adminNote: null,
      })
      .returning();

    sendPushToAll({
      title: "New Support Ticket",
      body: `${req.authUser.email}: ${title}`,
      tag: `support-ticket-${ticket.id}`,
      url: "/admin",
    }).catch(() => {});

    res.status(201).json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tickets = await db
      .select()
      .from(supportTickets)
      .orderBy(desc(supportTickets.createdAt));

    res.json(tickets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to list tickets" });
  }
});

router.get("/unresolved-count", requireAuth, requireAdmin, async (req, res) => {
  try {
    const tickets = await db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(ne(supportTickets.status, "resolved"));

    res.json({ count: tickets.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to count tickets" });
  }
});

router.patch("/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { status, adminNote } = req.body;

    const validStatuses = ["open", "in_progress", "resolved"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const updateData: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    if (status !== undefined) updateData.status = status;
    if (adminNote !== undefined) updateData.adminNote = adminNote;

    const [ticket] = await db
      .update(supportTickets)
      .set(updateData)
      .where(eq(supportTickets.id, req.params.id))
      .returning();

    if (!ticket) return res.status(404).json({ error: "Ticket not found" });

    res.json(ticket);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

export default router;
