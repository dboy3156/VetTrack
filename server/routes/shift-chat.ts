import { Router } from "express";
import { and, asc, eq, gt, inArray, isNull } from "drizzle-orm";
import {
  db, shiftMessages, shiftMessageAcks, shiftMessageReactions, shiftSessions,
} from "../db.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
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

    const shift = await getOpenShift(clinicId);
    if (!shift) {
      return res.json({ messages: [], pinnedMessage: null, typing: [], onlineUserIds: [] });
    }

    const afterDate = after ? new Date(after) : undefined;

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
        ? { ...pinnedRow, acks: [], reactions: [] }
        : null,
      typing: presence.typing,
      onlineUserIds: presence.onlineUserIds,
    });
  },
);

export default router;
