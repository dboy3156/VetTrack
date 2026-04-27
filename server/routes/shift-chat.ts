import { Router } from "express";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "crypto";
import {
  db, shiftMessages, shiftMessageAcks, shiftMessageReactions, shiftSessions,
} from "../db.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { sendPushToUser, sendPushToRole } from "../lib/push.js";
import { touchPresence, getPresence } from "../lib/shift-chat-presence.js";

const router = Router();

/** Returns the open shift session for a clinic, or null. */
async function getOpenShift(clinicId: string) {
  const [row] = await db
    .select()
    .from(shiftSessions)
    .where(and(eq(shiftSessions.clinicId, clinicId), isNull(shiftSessions.endedAt)))
    .limit(1);
  return row ?? null;
}

// ─── GET /api/shift-chat/messages ────────────────────────────────────────────

router.get(
  "/messages",
  requireAuth,
  requireEffectiveRole("technician"),
  async (req, res) => {
    const clinicId = req.clinicId!;
    const userId   = req.authUser!.id;
    const userName = req.authUser!.name ?? "Unknown";
    const after    = req.query.after as string | undefined;

    // Update presence (marks user as online)
    touchPresence(clinicId, userId, userName);

    try {
      const shift = await getOpenShift(clinicId);
      if (!shift) {
        return res.json({ messages: [], pinnedMessage: null, typing: [], onlineUserIds: [] });
      }

      const afterDate = after ? new Date(after) : undefined;
      if (afterDate && Number.isNaN(afterDate.getTime())) {
        return res.status(400).json({ error: "VALIDATION_FAILED", reason: "INVALID_AFTER", message: "Invalid after timestamp" });
      }

      const rows = await db
        .select()
        .from(shiftMessages)
        .where(
          and(
            eq(shiftMessages.shiftSessionId, shift.id),
            afterDate ? gt(shiftMessages.createdAt, afterDate) : undefined,
          ),
        )
        .orderBy(asc(shiftMessages.createdAt));

      // Fetch acks for broadcast messages in this batch
      const broadcastIds = rows
        .filter((m) => m.type === "broadcast")
        .map((m) => m.id);

      const acksMap = new Map<string, { userId: string; status: string }[]>();
      if (broadcastIds.length > 0) {
        const acks = await db
          .select()
          .from(shiftMessageAcks)
          .where(inArray(shiftMessageAcks.messageId, broadcastIds));
        for (const ack of acks) {
          const list = acksMap.get(ack.messageId) ?? [];
          list.push({ userId: ack.userId, status: ack.status });
          acksMap.set(ack.messageId, list);
        }
      }

      // Fetch reactions for all messages in this batch
      const messageIds = rows.map((m) => m.id);
      const reactionsMap = new Map<string, { userId: string; emoji: string }[]>();
      if (messageIds.length > 0) {
        const reactions = await db
          .select()
          .from(shiftMessageReactions)
          .where(inArray(shiftMessageReactions.messageId, messageIds));
        for (const r of reactions) {
          const list = reactionsMap.get(r.messageId) ?? [];
          list.push({ userId: r.userId, emoji: r.emoji });
          reactionsMap.set(r.messageId, list);
        }
      }

      // Find pinned message (last pinned, compatible with ES2020 target)
      const pinnedRow = rows.filter((m) => m.pinnedAt !== null).at(-1) ?? null;

      const messages = rows.map((m) => ({
        ...m,
        acks: acksMap.get(m.id) ?? [],
        reactions: reactionsMap.get(m.id) ?? [],
      }));

      const presence = getPresence(clinicId);

      return res.json({
        messages,
        pinnedMessage: pinnedRow
          ? { ...pinnedRow, acks: acksMap.get(pinnedRow.id) ?? [], reactions: reactionsMap.get(pinnedRow.id) ?? [] }
          : null,
        typing: presence.typing,
        onlineUserIds: presence.onlineUserIds,
      });
    } catch (err) {
      console.error("[shift-chat] GET /messages error:", err);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Internal server error" });
    }
  },
);

// ─── POST /api/shift-chat/messages ───────────────────────────────────────────

export const BROADCAST_TEMPLATES: Record<string, { label: string; subtitle: string }> = {
  department_close: { label: "סגירת מחלקה", subtitle: "כל הטכנאים — לנקות ולסדר את המחלקה" },
};

const postMessageSchema = z.object({
  body: z.string().max(1000),
  type: z.enum(["regular", "broadcast"]),
  broadcastKey: z.string().optional(),
  roomTag: z.string().max(50).optional(),
  isUrgent: z.boolean().optional().default(false),
  mentionedUserIds: z.array(z.string()).optional().default([]),
});

router.post(
  "/messages",
  requireAuth,
  requireEffectiveRole("technician"),
  validateBody(postMessageSchema),
  async (req, res) => {
    const clinicId = req.clinicId!;
    const user = req.authUser!;
    const { body, type, broadcastKey, roomTag, isUrgent, mentionedUserIds } =
      req.body as z.infer<typeof postMessageSchema>;

    // Broadcast requires senior_technician or admin
    if (type === "broadcast") {
      const role = req.effectiveRole ?? user.role;
      if (role !== "senior_technician" && role !== "admin" && user.role !== "admin") {
        return res.status(403).json({ error: "FORBIDDEN", reason: "BROADCAST_FORBIDDEN", message: "Only senior technicians can send broadcasts" });
      }
      if (!broadcastKey || !BROADCAST_TEMPLATES[broadcastKey]) {
        return res.status(400).json({ error: "BAD_REQUEST", reason: "INVALID_BROADCAST_KEY", message: "Unknown broadcast key" });
      }
    }

    try {
      const shift = await getOpenShift(clinicId);
      if (!shift) {
        return res.status(409).json({ error: "CONFLICT", reason: "NO_OPEN_SHIFT", message: "No active shift for this clinic" });
      }

      const [message] = await db
        .insert(shiftMessages)
        .values({
          id: randomUUID(),
          shiftSessionId: shift.id,
          clinicId,
          senderId: user.id,
          senderName: user.name ?? null,
          senderRole: req.effectiveRole ?? user.role,
          body,
          type,
          broadcastKey: broadcastKey ?? null,
          systemEventType: null,
          systemEventPayload: null,
          roomTag: roomTag ?? null,
          isUrgent,
          mentionedUserIds,
          pinnedAt: null,
          pinnedByUserId: null,
        })
        .returning();

      // ── Push notifications ──────────────────────────────────────────────────

      // @mentions → push to each mentioned user
      for (const mentionedUserId of mentionedUserIds) {
        sendPushToUser(clinicId, mentionedUserId, {
          title: `${user.name ?? "מישהו"} אזכר אותך`,
          body: body.slice(0, 80),
          tag: `shift-chat-mention-${message!.id}`,
        }).catch(() => {});
      }

      // URGENT flag → push to all shift members
      if (isUrgent) {
        sendPushToRole(clinicId, "technician", {
          title: "⚡ הודעה דחופה במשמרת",
          body: body.slice(0, 80),
          tag: `shift-chat-urgent-${message!.id}`,
        }).catch(() => {});
        sendPushToRole(clinicId, "vet", {
          title: "⚡ הודעה דחופה במשמרת",
          body: body.slice(0, 80),
          tag: `shift-chat-urgent-${message!.id}`,
        }).catch(() => {});
      }

      // Broadcast → push to all technicians
      if (type === "broadcast" && broadcastKey) {
        const template = BROADCAST_TEMPLATES[broadcastKey]!;
        sendPushToRole(clinicId, "technician", {
          title: `📢 ${template.label}`,
          body: template.subtitle,
          tag: `shift-chat-broadcast-${message!.id}`,
        }).catch(() => {});
        sendPushToRole(clinicId, "senior_technician", {
          title: `📢 ${template.label}`,
          body: template.subtitle,
          tag: `shift-chat-broadcast-${message!.id}`,
        }).catch(() => {});
      }

      return res.status(201).json({ message });
    } catch (err) {
      console.error("[shift-chat] POST /messages error:", err);
      return res.status(500).json({ error: "INTERNAL_ERROR", message: "Internal server error" });
    }
  },
);

export default router;
