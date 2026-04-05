import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, supportTickets, users } from "../db.js";
import { eq, desc, ne, and } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { sendPushToAll } from "../lib/push.js";

/*
 * PERMISSIONS MATRIX — /api/support
 * ─────────────────────────────────────────────────────
 * POST  /                  viewer+     Submit a support ticket
 * GET   /                  admin-only  List all support tickets
 * GET   /unresolved-count  admin-only  Count of open/in-progress tickets
 * PATCH /:id               admin-only  Update ticket status / admin note
 * ─────────────────────────────────────────────────────
 */

const router = Router();

const VALID_SEVERITIES = ["low", "medium", "high"] as const;
const VALID_TICKET_STATUSES = ["open", "in_progress", "resolved"] as const;

const createTicketSchema = z.object({
  title: z.string().min(1, "title is required").max(500),
  description: z.string().min(1, "description is required").max(5000),
  severity: z.enum(VALID_SEVERITIES).optional().default("medium"),
  pageUrl: z.string().max(1000).optional().nullable(),
  deviceInfo: z.string().max(1000).optional().nullable(),
  appVersion: z.string().max(100).optional().nullable(),
});

const patchTicketSchema = z.object({
  status: z.enum(VALID_TICKET_STATUSES).optional(),
  adminNote: z.string().max(5000).optional().nullable(),
}).refine((data) => data.status !== undefined || data.adminNote !== undefined, {
  message: "At least one of status or adminNote must be provided",
});

router.post("/", requireAuth, validateBody(createTicketSchema), async (req, res) => {
  try {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });

    const { title, description, severity, pageUrl, deviceInfo, appVersion } = req.body as z.infer<typeof createTicketSchema>;

    const [ticket] = await db
      .insert(supportTickets)
      .values({
        id: randomUUID(),
        title,
        description,
        severity,
        status: "open",
        userId: req.authUser.id,
        userEmail: req.authUser.email,
        pageUrl: pageUrl ?? null,
        deviceInfo: deviceInfo ?? null,
        appVersion: appVersion ?? null,
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

router.patch("/:id", requireAuth, requireAdmin, validateUuid("id"), validateBody(patchTicketSchema), async (req, res) => {
  try {
    const { status, adminNote } = req.body as z.infer<typeof patchTicketSchema>;

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
