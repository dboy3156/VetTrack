/**
 * POST /api/webhooks/clerk
 *
 * Receives Clerk user lifecycle events and keeps vt_users in sync.
 *
 * Events handled:
 *   user.created  — upsert into vt_users (idempotent)
 *   user.updated  — update email / name if changed
 *   user.deleted  — soft-delete the vt_users row
 *
 * All events are verified using svix signature verification before processing.
 * If CLERK_WEBHOOK_SECRET is not set the handler returns 501 (not configured).
 *
 * This route MUST be mounted BEFORE the global express.json() body parser so
 * that we can read the raw request body for signature verification. The route
 * calls express.raw() itself.
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { Webhook } from "svix";
import express from "express";
import { db, users } from "../db.js";
import { and, eq, isNull } from "drizzle-orm";
import { logAudit } from "../lib/audit.js";

const router = Router();

interface ClerkEmailAddress {
  id: string;
  email_address: string;
}

interface ClerkUserPayload {
  id: string;
  email_addresses?: ClerkEmailAddress[];
  primary_email_address_id?: string;
  first_name?: string | null;
  last_name?: string | null;
  deleted?: boolean;
}

interface ClerkWebhookEvent {
  type: string;
  data: ClerkUserPayload;
}

function extractEmail(data: ClerkUserPayload): string {
  const primary = data.email_addresses?.find(
    (e) => e.id === data.primary_email_address_id,
  );
  return primary?.email_address ?? data.email_addresses?.[0]?.email_address ?? "";
}

function extractName(data: ClerkUserPayload): string {
  return `${data.first_name ?? ""} ${data.last_name ?? ""}`.trim();
}

// This route needs the raw body for svix signature verification.
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const secret = process.env.CLERK_WEBHOOK_SECRET?.trim();
    if (!secret) {
      console.warn("[webhook/clerk] CLERK_WEBHOOK_SECRET not configured — webhook verification disabled");
      return res.status(501).json({ code: "NOT_CONFIGURED", error: "NOT_CONFIGURED", reason: "WEBHOOK_NOT_CONFIGURED", message: "Webhook not configured" });
    }

    const svixId = req.headers["svix-id"] as string | undefined;
    const svixTimestamp = req.headers["svix-timestamp"] as string | undefined;
    const svixSignature = req.headers["svix-signature"] as string | undefined;

    if (!svixId || !svixTimestamp || !svixSignature) {
      return res.status(400).json({ code: "BAD_REQUEST", error: "BAD_REQUEST", reason: "MISSING_SVIX_HEADERS", message: "Missing svix headers" });
    }

    let event: ClerkWebhookEvent;
    try {
      const wh = new Webhook(secret);
      const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : JSON.stringify(req.body);
      event = wh.verify(rawBody, {
        "svix-id": svixId,
        "svix-timestamp": svixTimestamp,
        "svix-signature": svixSignature,
      }) as ClerkWebhookEvent;
    } catch (err) {
      console.warn("[webhook/clerk] Signature verification failed", err);
      return res.status(400).json({ code: "BAD_REQUEST", error: "BAD_REQUEST", reason: "INVALID_WEBHOOK_SIGNATURE", message: "Invalid webhook signature" });
    }

    const { type, data } = event;
    const clerkUserId = data.id;

    try {
      if (type === "user.created" || type === "user.updated") {
        const email = extractEmail(data);
        const name = extractName(data);

        // Find any existing row across all clinics for this clerkId.
        // Webhooks don't carry org context — we update the canonical row.
        const [existing] = await db
          .select({ id: users.id, clinicId: users.clinicId, deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.clerkId, clerkUserId))
          .limit(1);

        if (existing) {
          // Update email/name only — never overwrite role, status, or clinicId from webhook.
          if (email || name) {
            await db
              .update(users)
              .set({
                ...(email ? { email } : {}),
                ...(name ? { name, displayName: name } : {}),
              })
              .where(eq(users.id, existing.id));
          }

          if (type === "user.updated" && existing.deletedAt) {
            // If Clerk sends user.updated for a soft-deleted user, restore them.
            await db
              .update(users)
              .set({ deletedAt: null, deletedBy: null })
              .where(eq(users.id, existing.id));

            logAudit({
              actorRole: "system",
              clinicId: existing.clinicId,
              actionType: "user_restored",
              performedBy: "clerk-webhook",
              performedByEmail: "clerk-webhook@system",
              targetId: existing.id,
              targetType: "user",
              metadata: { source: "clerk_webhook", event: type, clerkUserId },
            });
          }
        } else if (type === "user.created") {
          // We can't create a vt_users row without a clinicId — that's set at
          // first login via the org claim. Log so operators know a Clerk user
          // exists that has no vt_users row yet.
          console.log(
            `[webhook/clerk] user.created for clerkId=${clerkUserId} ` +
              `— no vt_users row (will be created at first login)`,
          );
        }
      } else if (type === "user.deleted") {
        const [existing] = await db
          .select({ id: users.id, clinicId: users.clinicId, email: users.email, role: users.role })
          .from(users)
          .where(and(eq(users.clerkId, clerkUserId), isNull(users.deletedAt)))
          .limit(1);

        if (existing) {
          await db
            .update(users)
            .set({ deletedAt: new Date(), deletedBy: "clerk-webhook" })
            .where(eq(users.id, existing.id));

          logAudit({
            actorRole: "system",
            clinicId: existing.clinicId,
            actionType: "user_deleted",
            performedBy: "clerk-webhook",
            performedByEmail: "clerk-webhook@system",
            targetId: existing.id,
            targetType: "user",
            metadata: { source: "clerk_webhook", event: type, clerkUserId, email: existing.email, role: existing.role },
          });

          console.log(`[webhook/clerk] user.deleted: soft-deleted vt_users row for clerkId=${clerkUserId}`);
        }
      }

      return res.status(200).json({ ok: true, event: type });
    } catch (err) {
      console.error("[webhook/clerk] handler error", { type, clerkUserId, err });
      return res.status(500).json({ code: "INTERNAL_ERROR", error: "INTERNAL_ERROR", reason: "WEBHOOK_HANDLER_ERROR", message: "Internal error" });
    }
  },
);

export default router;
