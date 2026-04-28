/**
 * Integration sync failure anomaly hooks — Phase C Sprint 8.
 * Stores minimal non-PHI diagnostics; optional webhook (disabled by default).
 */

import { createHash, randomUUID } from "crypto";

export type IntegrationFailureCategory = "timeout" | "auth" | "schema" | "rate_limit" | "unknown";

export interface IntegrationSyncFailureRecord {
  failureCategory: IntegrationFailureCategory;
  correlationId: string;
  payloadFingerprint: string;
  adapterId?: string;
  recordedAt: string;
}

const ring: IntegrationSyncFailureRecord[] = [];
const RING_MAX = 100;

function fingerprintPayload(parts: { adapterId: string; message: string; correlationId: string }): string {
  const h = createHash("sha256");
  h.update(JSON.stringify(parts));
  return h.digest("hex");
}

export function classifyIntegrationFailure(err: unknown): IntegrationFailureCategory {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (/rate limit|ratelimit|integration rate limit/i.test(msg)) return "rate_limit";
  if (/abort|timeout|timed out|etimedout/i.test(lower)) return "timeout";
  if (/401|403|unauthorized|forbidden|auth/i.test(msg)) return "auth";
  if (/json|parse|schema|invalid/i.test(lower)) return "schema";
  return "unknown";
}

export function recordSyncFailureAnomaly(input: {
  err: unknown;
  correlationId: string;
  adapterId: string;
}): IntegrationSyncFailureRecord {
  const failureCategory = classifyIntegrationFailure(input.err);
  const message = input.err instanceof Error ? input.err.message : String(input.err);
  const payloadFingerprint = fingerprintPayload({
    adapterId: input.adapterId,
    message: message.slice(0, 500),
    correlationId: input.correlationId,
  });

  const record: IntegrationSyncFailureRecord = {
    failureCategory,
    correlationId: input.correlationId,
    payloadFingerprint,
    adapterId: input.adapterId,
    recordedAt: new Date().toISOString(),
  };

  ring.push(record);
  if (ring.length > RING_MAX) ring.shift();

  const webhook = process.env.INTEGRATION_ANOMALY_WEBHOOK_URL?.trim();
  if (webhook) {
    void fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...record,
        event: "integration_sync_failure",
        requestId: randomUUID(),
      }),
    }).catch(() => {
      /* webhook is best-effort */
    });
  }

  console.warn("[integration] sync failure anomaly", {
    failureCategory,
    correlationId: input.correlationId,
    payloadFingerprint,
    adapterId: input.adapterId,
  });

  return record;
}

/** Test helper — read buffered records without exposing PHI. */
export function __peekAnomalyRingForTests(): IntegrationSyncFailureRecord[] {
  return [...ring];
}

/** Test helper */
export function __clearAnomalyRingForTests(): void {
  ring.length = 0;
}
