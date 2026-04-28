import { eq, and } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, integrationWebhookEvents } from "../../db.js";

export async function insertWebhookEvent(params: {
  clinicId: string;
  adapterId: string;
  signatureValid: boolean;
  payload: Record<string, unknown>;
}): Promise<{ id: string }> {
  const id = nanoid();
  await db.insert(integrationWebhookEvents).values({
    id,
    clinicId: params.clinicId,
    adapterId: params.adapterId,
    signatureValid: params.signatureValid,
    payload: params.payload,
    status: params.signatureValid ? "received" : "rejected_signature",
  });
  return { id };
}

export async function getWebhookEventForClinic(
  clinicId: string,
  eventId: string,
): Promise<(typeof integrationWebhookEvents.$inferSelect) | null> {
  const [row] = await db
    .select()
    .from(integrationWebhookEvents)
    .where(and(eq(integrationWebhookEvents.clinicId, clinicId), eq(integrationWebhookEvents.id, eventId)))
    .limit(1);
  return row ?? null;
}

export async function markWebhookEventTerminal(
  eventId: string,
  status: "processed" | "failed",
): Promise<void> {
  await db
    .update(integrationWebhookEvents)
    .set({
      status,
      processedAt: new Date(),
    })
    .where(eq(integrationWebhookEvents.id, eventId));
}

export async function markWebhookReplayPending(eventId: string): Promise<void> {
  await db
    .update(integrationWebhookEvents)
    .set({
      status: "replay_pending",
      processedAt: null,
    })
    .where(eq(integrationWebhookEvents.id, eventId));
}
