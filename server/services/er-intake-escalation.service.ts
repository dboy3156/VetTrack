import { and, eq, inArray, isNotNull, lte } from "drizzle-orm";
import { clinics, db, erIntakeEvents } from "../db.js";
import { insertRealtimeDomainEvent } from "../lib/realtime-outbox.js";
import type { ErSeverity } from "../../shared/er-types.js";

export const DEFAULT_ER_INTAKE_ESCALATE_LOW_MINUTES = 15;
export const DEFAULT_ER_INTAKE_ESCALATE_MEDIUM_MINUTES = 15;

const ACTIVE_INTAKE_STATUSES = ["waiting", "assigned", "in_progress"] as const;
const ESCALATABLE_SEVERITIES: ErSeverity[] = ["low", "medium"];

/** Next automatic escalation time when creating an intake (stored on row + reflected on ER_INTAKE_CREATED path). */
export function computeInitialEscalatesAt(params: {
  severity: ErSeverity;
  now: Date;
  escalateLowMinutes: number;
  escalateMediumMinutes: number;
}): Date | null {
  const { severity, now, escalateLowMinutes, escalateMediumMinutes } = params;
  if (severity === "low") {
    return new Date(now.getTime() + escalateLowMinutes * 60_000);
  }
  if (severity === "medium") {
    return new Date(now.getTime() + escalateMediumMinutes * 60_000);
  }
  return null;
}

function nextSeverity(current: ErSeverity): ErSeverity | null {
  if (current === "low") return "medium";
  if (current === "medium") return "high";
  return null;
}

/**
 * Bumps low→medium→high when `escalates_at` has passed; emits `QUEUE_SEVERITY_ESCALATED` via outbox (same TX).
 */
export async function scanErIntakeEscalations(now: Date = new Date()): Promise<void> {
  const candidates = await db
    .select({
      intake: erIntakeEvents,
      escalateMediumMinutes: clinics.erIntakeEscalateMediumMinutes,
    })
    .from(erIntakeEvents)
    .innerJoin(clinics, eq(erIntakeEvents.clinicId, clinics.id))
    .where(
      and(
        isNotNull(erIntakeEvents.escalatesAt),
        lte(erIntakeEvents.escalatesAt, now),
        inArray(erIntakeEvents.severity, ESCALATABLE_SEVERITIES),
        inArray(erIntakeEvents.status, [...ACTIVE_INTAKE_STATUSES]),
      ),
    )
    .limit(100);

  for (const row of candidates) {
    const prev = row.intake.severity as ErSeverity;
    const bumped = nextSeverity(prev);
    if (!bumped) continue;

    await db.transaction(async (tx) => {
      const newEscalatesAt =
        bumped === "medium"
          ? new Date(now.getTime() + Math.max(1, row.escalateMediumMinutes) * 60_000)
          : null;

      const [updated] = await tx
        .update(erIntakeEvents)
        .set({
          severity: bumped,
          escalatesAt: newEscalatesAt,
          updatedAt: now,
        })
        .where(
          and(
            eq(erIntakeEvents.id, row.intake.id),
            eq(erIntakeEvents.severity, prev),
            isNotNull(erIntakeEvents.escalatesAt),
            lte(erIntakeEvents.escalatesAt, now),
          ),
        )
        .returning({ id: erIntakeEvents.id });

      if (!updated) return;

      await insertRealtimeDomainEvent(tx, {
        clinicId: row.intake.clinicId,
        type: "QUEUE_SEVERITY_ESCALATED",
        payload: {
          intakeId: row.intake.id,
          previousSeverity: prev,
          newSeverity: bumped,
        },
      });
    });
  }
}

/** Periodic escalation scan — no Redis; idempotent per row via conditional UPDATE. */
export function startErIntakeEscalationScheduler(): void {
  const tick = (): void => {
    void scanErIntakeEscalations().catch((err) => {
      console.error("[er-intake-escalation] scan failed", err);
    });
  };
  tick();
  setInterval(tick, 60 * 1000);
}
