import { randomUUID } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, shiftMessages, shiftSessions } from "../db.js";

// ─── In-memory presence/typing map ────────────────────────────────────────────
// Resets on server restart — presence is ephemeral by design.

interface PresenceEntry {
  name: string;
  typingUntil: number; // epoch ms
  lastSeenAt: number;  // epoch ms
}

const presenceMap = new Map<string, Map<string, PresenceEntry>>();
// shape: presenceMap.get(clinicId)?.get(userId)

const ONLINE_TTL_MS  = 5 * 60 * 1000; // 5 minutes
const TYPING_TTL_MS  = 3 * 1000;      // 3 seconds

export function touchPresence(clinicId: string, userId: string, name: string, typing = false): void {
  let clinic = presenceMap.get(clinicId);
  if (!clinic) {
    clinic = new Map();
    presenceMap.set(clinicId, clinic);
  }
  const now = Date.now();
  const existing = clinic.get(userId);
  clinic.set(userId, {
    name,
    typingUntil: typing ? now + TYPING_TTL_MS : (existing?.typingUntil ?? 0),
    lastSeenAt: now,
  });
}

export function getPresence(clinicId: string): { onlineUserIds: string[]; typing: string[] } {
  const clinic = presenceMap.get(clinicId);
  if (!clinic) return { onlineUserIds: [], typing: [] };

  const now = Date.now();
  const onlineUserIds: string[] = [];
  const typing: string[] = [];

  for (const [userId, entry] of clinic.entries()) {
    if (now - entry.lastSeenAt < ONLINE_TTL_MS) onlineUserIds.push(userId);
    if (entry.typingUntil > now) typing.push(entry.name);
  }

  return { onlineUserIds, typing };
}

// ─── System message auto-poster ───────────────────────────────────────────────
// Call from any server handler to post a system card to the active shift channel.
// No-op when no shift is open for the clinic.

export async function postSystemMessage(
  clinicId: string,
  systemEventType: string,
  systemEventPayload: Record<string, unknown>,
): Promise<void> {
  try {
    const [shift] = await db
      .select({ id: shiftSessions.id })
      .from(shiftSessions)
      .where(and(eq(shiftSessions.clinicId, clinicId), isNull(shiftSessions.endedAt)))
      .limit(1);

    if (!shift) return; // No open shift — silent no-op

    await db.insert(shiftMessages).values({
      id: randomUUID(),
      shiftSessionId: shift.id,
      clinicId,
      senderId: null,
      senderName: null,
      senderRole: null,
      body: "",
      type: "system",
      broadcastKey: null,
      systemEventType,
      systemEventPayload,
      roomTag: null,
      isUrgent: false,
      mentionedUserIds: [],
      pinnedAt: null,
      pinnedByUserId: null,
    });
  } catch (err) {
    // Never throw — system messages are best-effort
    console.error("[shift-chat] postSystemMessage failed:", err);
  }
}
