import { and, count, desc, eq, gt, gte, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { db, eventOutbox } from "../db.js";
import { getMetricsSnapshot } from "./metrics.js";

/** Dead-letter: enough failed publish attempts and the event is still unpublished past this age. */
export const DEAD_LETTER_MIN_RETRY_EXCEEDED = 3;
/** Combines with retries to avoid flagging a merely busy publisher. */
export const DEAD_LETTER_MIN_UNPUBLISHED_MS = 30 * 60_000;

/**
 * Rows matching this predicate match `dead_letter_count` on {@link evaluateOutboxHealthForClinic}
 * (unpublished, retries exhausted vs threshold, stale enough to count as DLQ).
 */
export function deadLetterConditionForClinic(clinicId: string): SQL {
  const unpublishedAgeCutoff = new Date(Date.now() - DEAD_LETTER_MIN_UNPUBLISHED_MS);
  const predicate = and(
    eq(eventOutbox.clinicId, clinicId),
    isNull(eventOutbox.publishedAt),
    gt(eventOutbox.retryCount, DEAD_LETTER_MIN_RETRY_EXCEEDED),
    lt(sql`COALESCE(${eventOutbox.lastAttemptAt}, ${eventOutbox.occurredAt})`, unpublishedAgeCutoff),
  );
  if (!predicate) {
    throw new Error("deadLetterConditionForClinic: failed to build predicate");
  }
  return predicate;
}

export interface OutboxHealthEvaluation {
  clinicId: string;
  publish_lag_ms: number | null;
  outbox_size: number;
  events_per_sec: number;
  duplicate_drops_count: number;
  gap_resync_count: number;
  /** Global cumulative counter (same value for all clinics in a given process). */
  failed_publish_attempts: number;
  dead_letter_count: number;
  /** Subset of {@link dead_letter_count} with `error_type = 'permanent'`. */
  dlq_permanent_count: number;
  /** Subset with `error_type = 'transient'`. */
  dlq_transient_count: number;
  /** Subset with no `error_type` set (legacy or not yet classified). */
  dlq_unclassified_count: number;
  /**
   * Ms until the soonest future `next_attempt_at` among unpublished, retry-eligible rows with scheduled backoff.
   * `null` if none scheduled (or no backlog waiting on backoff).
   */
  next_retry_wave_in_ms: number | null;
  /**
   * Ms until the latest future `next_attempt_at` in that same set (how far out the longest backoff runs).
   * `null` if none scheduled.
   */
  max_retry_horizon_ms: number | null;
}

/**
 * Clinic-scoped backlog, dead-letter count, and publisher lag — same semantics as
 * `GET /api/admin/outbox-health` plus global realtime metrics from {@link getMetricsSnapshot}.
 */
export async function evaluateOutboxHealthForClinic(clinicId: string): Promise<OutboxHealthEvaluation> {
  const backlog = await db
    .select({ n: count() })
    .from(eventOutbox)
    .where(and(eq(eventOutbox.clinicId, clinicId), isNull(eventOutbox.publishedAt)));

  const outbox_size = Number(backlog[0]?.n ?? 0);

  const newestUnpublished = await db
    .select({
      occurredAt: eventOutbox.occurredAt,
    })
    .from(eventOutbox)
    .where(and(eq(eventOutbox.clinicId, clinicId), isNull(eventOutbox.publishedAt)))
    .orderBy(desc(eventOutbox.id))
    .limit(1);

  let publish_lag_ms: number | null = null;
  const occurred = newestUnpublished[0]?.occurredAt;
  if (occurred instanceof Date) {
    publish_lag_ms = Math.max(0, Date.now() - occurred.getTime());
  }

  const cutoff = new Date(Date.now() - 60_000);
  const publishedLastMinute = await db
    .select({ n: count() })
    .from(eventOutbox)
    .where(
      and(
        eq(eventOutbox.clinicId, clinicId),
        isNotNull(eventOutbox.publishedAt),
        gte(eventOutbox.publishedAt, cutoff),
      ),
    );

  const publishedLastMinuteCount = Number(publishedLastMinute[0]?.n ?? 0);
  const events_per_sec = publishedLastMinuteCount / 60;

  const snap = getMetricsSnapshot();

  const deadLetter = await db
    .select({ n: count() })
    .from(eventOutbox)
    .where(deadLetterConditionForClinic(clinicId));
  const dead_letter_count = Number(deadLetter[0]?.n ?? 0);

  const dlqPermanent = await db
    .select({ n: count() })
    .from(eventOutbox)
    .where(and(deadLetterConditionForClinic(clinicId), eq(eventOutbox.errorType, "permanent")));
  const dlq_permanent_count = Number(dlqPermanent[0]?.n ?? 0);

  const dlqTransient = await db
    .select({ n: count() })
    .from(eventOutbox)
    .where(and(deadLetterConditionForClinic(clinicId), eq(eventOutbox.errorType, "transient")));
  const dlq_transient_count = Number(dlqTransient[0]?.n ?? 0);

  const dlqUnclassified = await db
    .select({ n: count() })
    .from(eventOutbox)
    .where(and(deadLetterConditionForClinic(clinicId), isNull(eventOutbox.errorType)));
  const dlq_unclassified_count = Number(dlqUnclassified[0]?.n ?? 0);

  const retryWave = await db.execute(sql`
    SELECT
      CASE
        WHEN MIN(next_attempt_at) IS NULL THEN NULL
        ELSE GREATEST(0, EXTRACT(EPOCH FROM (MIN(next_attempt_at) - NOW())) * 1000)::double precision
      END AS next_retry_wave_in_ms,
      CASE
        WHEN MAX(next_attempt_at) IS NULL THEN NULL
        ELSE GREATEST(0, EXTRACT(EPOCH FROM (MAX(next_attempt_at) - NOW())) * 1000)::double precision
      END AS max_retry_horizon_ms
    FROM vt_event_outbox
    WHERE clinic_id = ${clinicId}
      AND published_at IS NULL
      AND (error_type IS NULL OR error_type <> 'permanent')
      AND next_attempt_at IS NOT NULL
      AND next_attempt_at > NOW()
  `);

  const waveRow = retryWave.rows[0] as
    | { next_retry_wave_in_ms: unknown; max_retry_horizon_ms: unknown }
    | undefined;

  const toMs = (v: unknown): number | null => {
    if (v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const next_retry_wave_in_ms = toMs(waveRow?.next_retry_wave_in_ms);
  const max_retry_horizon_ms = toMs(waveRow?.max_retry_horizon_ms);

  return {
    clinicId,
    publish_lag_ms,
    outbox_size,
    events_per_sec,
    duplicate_drops_count: snap.realtime.duplicateDrops,
    gap_resync_count: snap.realtime.gapResyncs,
    failed_publish_attempts: snap.realtime.outboxFailedPublishAttempts,
    dead_letter_count,
    dlq_permanent_count,
    dlq_transient_count,
    dlq_unclassified_count,
    next_retry_wave_in_ms,
    max_retry_horizon_ms,
  };
}
