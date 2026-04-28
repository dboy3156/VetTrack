/**
 * Vendor → VetTrack inbound webhooks (no Clerk session).
 * Mounted with raw body parser before express.json — see server/index.ts.
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { eq, and } from "drizzle-orm";
import { db, integrationConfigs } from "../../db.js";
import { isKnownAdapter } from "../index.js";
import { getCredentials } from "../credential-manager.js";
import {
  integrationQueue,
  classifyIntegrationQueueError,
} from "../../queues/integration.queue.js";
import { evaluateIntegrationGloballyKill } from "../feature-flags.js";
import { verifyVetTrackWebhookSignature } from "./verify-signature.js";
import { isWebhookSourceAllowed } from "./cidr.js";
import { insertWebhookEvent } from "./repository.js";

const router = Router({ mergeParams: true });

function jsonErr(res: Response, status: number, code: string, message: string) {
  return res.status(status).json({ ok: false, code, message });
}

function readSecurityAllowCidrs(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const sec = (metadata as Record<string, unknown>).security;
  if (!sec || typeof sec !== "object") return [];
  const raw = (sec as Record<string, unknown>).webhookAllowCidrs;
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

function resolveWebhookSecret(
  credentials: Record<string, string>,
  metadata: unknown,
): string | null {
  let activeId: string | undefined;
  if (metadata && typeof metadata === "object") {
    const sec = (metadata as Record<string, unknown>).security;
    if (sec && typeof sec === "object") {
      const id = (sec as Record<string, unknown>).activeSecretId;
      if (typeof id === "string" && id.trim()) activeId = id.trim();
    }
  }
  if (activeId) {
    const v = credentials[activeId]?.trim();
    return v || null;
  }
  const wh = credentials.webhook_secret?.trim();
  if (wh) return wh;
  const api = credentials.api_key?.trim();
  return api || null;
}

router.post("/", async (req: Request, res: Response) => {
  const adapterId = typeof req.params.adapterId === "string" ? req.params.adapterId.trim() : "";
  const clinicHeader = req.headers["x-vetrack-clinic"];
  const clinicId =
    typeof clinicHeader === "string"
      ? clinicHeader.trim()
      : Array.isArray(clinicHeader)
        ? clinicHeader[0]?.trim()
        : "";

  if (!adapterId || !isKnownAdapter(adapterId)) {
    return jsonErr(res, 404, "UNKNOWN_ADAPTER", "Unknown adapter");
  }
  if (!clinicId) {
    return jsonErr(res, 400, "MISSING_CLINIC", "X-VetTrack-Clinic header is required");
  }

  const rawBody = req.body;
  if (!Buffer.isBuffer(rawBody)) {
    return jsonErr(res, 400, "INVALID_BODY", "Expected raw request body");
  }

  const clientIp = typeof req.ip === "string" ? req.ip : "";

  const kill = evaluateIntegrationGloballyKill();
  if (!kill.allowed) {
    return res.status(503).json({
      ok: false,
      code: "INTEGRATIONS_DEGRADED",
      message: kill.message ?? "Integration enqueue blocked",
      degraded: true,
    });
  }

  const [cfg] = await db
    .select({
      enabled: integrationConfigs.enabled,
      syncPatients: integrationConfigs.syncPatients,
      metadata: integrationConfigs.metadata,
    })
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)))
    .limit(1);

  const allowCidrs = readSecurityAllowCidrs(cfg?.metadata ?? undefined);
  if (!isWebhookSourceAllowed(clientIp, allowCidrs)) {
    console.warn("[integration] webhook rejected (CIDR)", { clinicId, adapterId, clientIp });
    return jsonErr(res, 403, "WEBHOOK_SOURCE_BLOCKED", "Source IP not allowed");
  }

  const credentials = await getCredentials(clinicId, adapterId);
  const secret = credentials ? resolveWebhookSecret(credentials, cfg?.metadata ?? undefined) : null;

  const sigHeader = req.headers["x-vetrack-signature"];
  const okSig = Boolean(secret && verifyVetTrackWebhookSignature(rawBody, secret, sigHeader));

  let payload: Record<string, unknown> = {};
  if (okSig) {
    try {
      const parsed = JSON.parse(rawBody.toString("utf8")) as unknown;
      payload =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { _: "non_object_json" };
    } catch {
      payload = { _: "invalid_json" };
    }
  } else {
    payload = { _: "signature_invalid" };
  }

  const inserted = await insertWebhookEvent({
    clinicId,
    adapterId,
    signatureValid: okSig,
    payload,
  });

  if (!okSig) {
    return jsonErr(res, 401, "INVALID_SIGNATURE", "Webhook signature verification failed");
  }

  if (!cfg?.enabled || !cfg.syncPatients) {
    return jsonErr(
      res,
      400,
      "INTEGRATION_DISABLED",
      "Integration is disabled or inbound patient sync is off for this clinic",
    );
  }

  try {
    const job = await integrationQueue.add(
      {
        clinicId,
        adapterId,
        syncType: "patients",
        direction: "inbound",
        correlationId: inserted.id,
        webhookEventId: inserted.id,
      },
      {
        jobId: `${clinicId}:${adapterId}:patients:inbound:webhook:${inserted.id}`,
      },
    );
    return res.status(202).json({ ok: true, accepted: true, eventId: inserted.id, jobId: job.id });
  } catch (err) {
    const classified = classifyIntegrationQueueError(err);
    console.warn("[integration] webhook enqueue failed", { clinicId, adapterId, reason: classified.reason });
    return res.status(503).json({
      ok: false,
      code: classified.code,
      reason: classified.reason,
      message: classified.message,
      degraded: true,
      eventId: inserted.id,
    });
  }
});

export default router;
