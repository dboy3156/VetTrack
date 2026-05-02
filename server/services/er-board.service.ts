import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  animals,
  db,
  erIntakeEvents,
  hospitalizations,
  operationalTasks,
  shiftHandoffItems,
  shiftHandoffs,
  users,
} from "../db.js";
import type {
  ErBoardItem,
  ErBoardResponse,
  ErLane,
  ErNextActionCode,
  ErSeverity,
} from "../../shared/er-types.js";

/** Minutes without progression before an intake row is treated as overdue. */
export const ER_INTAKE_OVERDUE_MINUTES = 30;

/** Intakes waiting at most this many minutes map to the “next 15m” lane when not critical/overdue. */
export const ER_NEXT_WINDOW_MINUTES = 15;

/** Unacked handoff item older than this gets overdue badge + escalated label. */
export const ER_HANDOFF_SLA_MINUTES = 60;

const SEVERITIES: readonly ErSeverity[] = ["low", "medium", "high", "critical"];

export function parseErSeverity(raw: string | null | undefined): ErSeverity {
  const s = (raw ?? "").trim().toLowerCase();
  return SEVERITIES.includes(s as ErSeverity) ? (s as ErSeverity) : "medium";
}

export function intakeMinutesWaiting(waitingSince: Date, now: Date): number {
  return Math.max(0, (now.getTime() - waitingSince.getTime()) / 60_000);
}

export function isIntakeOverdue(waitingSince: Date, now: Date): boolean {
  return intakeMinutesWaiting(waitingSince, now) >= ER_INTAKE_OVERDUE_MINUTES;
}

/**
 * Deterministic lane for an active intake (not used for handoff rows).
 * Priority: criticalNow if severity is critical OR SLA overdue; else next15m.
 */
export function laneForIntake(params: {
  severity: ErSeverity;
  waitingSince: Date;
  now: Date;
}): ErLane {
  const overdue = isIntakeOverdue(params.waitingSince, params.now);
  if (params.severity === "critical" || overdue) return "criticalNow";
  return "next15m";
}

/** All open, unacknowledged handoff items use the handoff-risk lane. */
export function laneForHandoffItem(): ErLane {
  return "handoffRisk";
}

export function nextActionForIntake(params: {
  status: string;
  overdue: boolean;
}): { code: ErNextActionCode; label: string } {
  if (params.overdue) {
    return { code: "monitor", label: "Immediate attention" };
  }
  const st = params.status.trim().toLowerCase();
  if (st === "admission_complete") return { code: "prepare_handoff", label: "Prepare handoff" };
  if (st === "waiting") return { code: "assign_vet", label: "Assign vet" };
  if (st === "assigned") return { code: "start_treatment", label: "Start treatment" };
  if (st === "in_progress") return { code: "monitor", label: "Monitor" };
  return { code: "monitor", label: "Monitor" };
}

export function nextActionForHandoffItem(slaOverdue: boolean): { code: ErNextActionCode; label: string } {
  if (slaOverdue) return { code: "monitor", label: "Immediate attention" };
  return { code: "acknowledge_handoff", label: "Acknowledge handoff" };
}

export function badgesForIntake(params: {
  assignedUserId: string | null;
  overdue: boolean;
}): Array<"handoffRisk" | "overdue" | "unassigned"> {
  const out: Array<"handoffRisk" | "overdue" | "unassigned"> = [];
  if (!params.assignedUserId) out.push("unassigned");
  if (params.overdue) out.push("overdue");
  return out;
}

export function badgesForHandoffItem(slaOverdue: boolean): Array<"handoffRisk" | "overdue" | "unassigned"> {
  const o: Array<"handoffRisk" | "overdue" | "unassigned"> = ["handoffRisk"];
  if (slaOverdue) o.push("overdue");
  return o;
}

function overdueAtIso(waitingSince: Date): string {
  return new Date(
    waitingSince.getTime() + ER_INTAKE_OVERDUE_MINUTES * 60_000,
  ).toISOString();
}

function sortBoardItems(items: ErBoardItem[]): ErBoardItem[] {
  return [...items].sort((a, b) => {
    const ta = new Date(a.waitingSince).getTime();
    const tb = new Date(b.waitingSince).getTime();
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

function applyReconciliationTaskFlag(
  items: ErBoardItem[],
  reconciliationPatientIds: ReadonlySet<string>,
): ErBoardItem[] {
  return items.map((item) => ({
    ...item,
    hasOpenReconciliationTask:
      item.animalId != null && reconciliationPatientIds.has(item.animalId),
  }));
}

export interface IntakeBoardInput {
  id: string;
  animalId: string | null;
  severityRaw: string;
  status: string;
  waitingSince: Date;
  /** Next SLA aging escalation instant; omitted/null when not scheduled (high/critical or legacy rows). */
  escalatesAt?: Date | null;
  assignedUserId: string | null;
  assignedDisplayName: string | null;
  species: string;
  ownerName: string | null;
  animalName: string | null;
  chiefComplaint: string;
  ambulation?: string | null;
  acceptedByUserId?: string | null;
  acceptedByDisplayName?: string | null;
  hasOpenHandoff?: boolean;
}

export interface HandoffItemBoardInput {
  id: string;
  animalId: string | null;
  waitingSince: Date;
  etaMinutes: number;
  slaOverdue: boolean;
  assignedUserId: string | null;
  assignedDisplayName: string | null;
  patientLabel: string;
  hospitalizationStatus: string | null;
}

export function intakeRowToBoardItem(row: IntakeBoardInput, now: Date): ErBoardItem {
  const severity = parseErSeverity(row.severityRaw);
  const overdue = isIntakeOverdue(row.waitingSince, now);
  const lane = laneForIntake({ severity, waitingSince: row.waitingSince, now });
  const action = nextActionForIntake({ status: row.status, overdue });

  const patientLabel =
    row.animalName?.trim() ||
    [row.species?.trim(), row.ownerName?.trim()].filter(Boolean).join(" · ") ||
    row.chiefComplaint.slice(0, 80) ||
    "Intake";

  const esc = row.escalatesAt;
  const escalatesAtIso =
    esc instanceof Date
      ? esc.toISOString()
      : esc
        ? new Date(esc).toISOString()
        : null;

  const st = row.status.trim().toLowerCase();
  const hasOpen = row.hasOpenHandoff === true;
  const admissionComplete = st === "admission_complete" && !hasOpen;

  return {
    id: row.id,
    animalId: row.animalId,
    type: "intake",
    lane,
    severity,
    patientLabel,
    waitingSince: row.waitingSince.toISOString(),
    escalatesAt: escalatesAtIso,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedDisplayName,
    nextActionCode: action.code,
    nextActionLabel: action.label,
    badges: badgesForIntake({ assignedUserId: row.assignedUserId, overdue }),
    overdueAt: overdue ? overdueAtIso(row.waitingSince) : null,
    ambulation: (row.ambulation as "ambulatory" | "non_ambulatory" | null | undefined) ?? null,
    acceptedByUserId: row.acceptedByUserId ?? null,
    acceptedByUserName: row.acceptedByDisplayName?.trim() || null,
    admissionComplete,
    intakeWorkflowStatus: row.status,
  };
}

function severityFromHospitalization(status: string | null | undefined): ErSeverity {
  const s = (status ?? "").trim().toLowerCase();
  if (s === "critical") return "critical";
  if (s === "observation" || s === "recovering") return "medium";
  return "medium";
}

export function handoffItemRowToBoardItem(row: HandoffItemBoardInput, _now: Date): ErBoardItem {
  const lane = laneForHandoffItem();
  const action = nextActionForHandoffItem(row.slaOverdue);
  const severity = severityFromHospitalization(row.hospitalizationStatus);

  return {
    id: row.id,
    animalId: row.animalId,
    type: "hospitalization",
    lane,
    severity,
    patientLabel: row.patientLabel,
    waitingSince: row.waitingSince.toISOString(),
    escalatesAt: null,
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedDisplayName,
    nextActionCode: action.code,
    nextActionLabel: action.label,
    badges: badgesForHandoffItem(row.slaOverdue),
    overdueAt: row.slaOverdue
      ? new Date(row.waitingSince.getTime() + ER_HANDOFF_SLA_MINUTES * 60_000).toISOString()
      : null,
  };
}

export function assembleErBoardResponse(
  clinicId: string,
  intakes: IntakeBoardInput[],
  handoffItems: HandoffItemBoardInput[],
  now: Date,
  reconciliationPatientIds: ReadonlySet<string> = new Set(),
): ErBoardResponse {
  const intakeItems = intakes.map((r) => intakeRowToBoardItem(r, now));
  const hoItems = handoffItems.map((r) => handoffItemRowToBoardItem(r, now));

  const all = [...intakeItems, ...hoItems];
  const criticalNow = applyReconciliationTaskFlag(
    sortBoardItems(all.filter((i) => i.lane === "criticalNow")),
    reconciliationPatientIds,
  );
  const next15m = applyReconciliationTaskFlag(
    sortBoardItems(all.filter((i) => i.lane === "next15m")),
    reconciliationPatientIds,
  );
  const handoffRisk = applyReconciliationTaskFlag(
    sortBoardItems(all.filter((i) => i.lane === "handoffRisk")),
    reconciliationPatientIds,
  );

  return {
    clinicId,
    generatedAt: now.toISOString(),
    lanes: {
      criticalNow,
      next15m,
      handoffRisk,
    },
  };
}

/** Caps each source query so the board endpoint stays bounded under load. */
export const ER_BOARD_QUERY_ROW_CAP = 500;

const ACTIVE_INTAKE_STATUSES: readonly string[] = ["waiting", "assigned", "in_progress", "admission_complete"];

export async function getErBoard(clinicId: string, now: Date = new Date()): Promise<ErBoardResponse> {
  const cap = ER_BOARD_QUERY_ROW_CAP;
  const acceptedByUser = alias(users, "er_accepted_by_user");

  const [intakeRows, hoRows, reconRows] = await Promise.all([
    db
      .select({
        row: erIntakeEvents,
        assigneeDisplay: users.displayName,
        assigneeName: users.name,
        animalName: animals.name,
        acceptedByDisplay: acceptedByUser.displayName,
        acceptedByName: acceptedByUser.name,
        hasOpenHandoff: sql<boolean>`CASE
          WHEN ${erIntakeEvents.animalId} IS NULL THEN false
          ELSE EXISTS (
            SELECT 1 FROM vt_shift_handoffs sh
            INNER JOIN vt_hospitalizations h ON h.id = sh.hospitalization_id AND h.animal_id = ${erIntakeEvents.animalId}
            WHERE sh.clinic_id = ${clinicId} AND sh.status <> 'cancelled'
          )
        END`,
      })
      .from(erIntakeEvents)
      .leftJoin(users, eq(erIntakeEvents.assignedUserId, users.id))
      .leftJoin(acceptedByUser, eq(erIntakeEvents.acceptedByUserId, acceptedByUser.id))
      .leftJoin(animals, eq(erIntakeEvents.animalId, animals.id))
      .where(
        and(
          eq(erIntakeEvents.clinicId, clinicId),
          inArray(erIntakeEvents.status, ACTIVE_INTAKE_STATUSES),
        ),
      )
      .limit(cap),
    db
      .select({
        item: shiftHandoffItems,
        animalName: animals.name,
        animalId: hospitalizations.animalId,
        hospStatus: hospitalizations.status,
        ownerDisplay: users.displayName,
        ownerName: users.name,
      })
      .from(shiftHandoffItems)
      .innerJoin(shiftHandoffs, eq(shiftHandoffItems.handoffId, shiftHandoffs.id))
      .leftJoin(hospitalizations, eq(shiftHandoffs.hospitalizationId, hospitalizations.id))
      .leftJoin(animals, eq(hospitalizations.animalId, animals.id))
      .leftJoin(users, eq(shiftHandoffItems.ownerUserId, users.id))
      .where(
        and(
          eq(shiftHandoffItems.clinicId, clinicId),
          eq(shiftHandoffs.status, "open"),
          isNull(shiftHandoffItems.ackAt),
        ),
      )
      .limit(cap),
    db
      .select({ patientId: operationalTasks.patientId })
      .from(operationalTasks)
      .where(
        and(
          eq(operationalTasks.clinicId, clinicId),
          eq(operationalTasks.tag, "BILLING_RECONCILIATION_REQUIRED"),
          isNotNull(operationalTasks.patientId),
        ),
      )
      .limit(cap),
  ]);

  const reconciliationPatientIds = new Set(
    reconRows.map((r) => r.patientId).filter((id): id is string => id != null && id.length > 0),
  );

  const intakes: IntakeBoardInput[] = intakeRows.map((r) => {
    const esc = r.row.escalatesAt;
    return {
      id: r.row.id,
      animalId: r.row.animalId,
      severityRaw: r.row.severity,
      status: r.row.status,
      waitingSince: r.row.waitingSince instanceof Date ? r.row.waitingSince : new Date(r.row.waitingSince),
      escalatesAt:
        esc === null || esc === undefined
          ? null
          : esc instanceof Date
            ? esc
            : new Date(esc),
      assignedUserId: r.row.assignedUserId,
      assignedDisplayName:
        r.assigneeDisplay?.trim() || r.assigneeName?.trim() || null,
      species: r.row.species,
      ownerName: r.row.ownerName,
      animalName: r.animalName,
      chiefComplaint: r.row.chiefComplaint,
      ambulation: r.row.ambulation,
      acceptedByUserId: r.row.acceptedByUserId,
      acceptedByDisplayName: r.acceptedByDisplay?.trim() || r.acceptedByName?.trim() || null,
      hasOpenHandoff: r.hasOpenHandoff,
    };
  });

  const handoffItems: HandoffItemBoardInput[] = hoRows.map((r) => {
    const created =
      r.item.createdAt instanceof Date ? r.item.createdAt : new Date(r.item.createdAt);
    const label =
      r.animalName?.trim() ||
      (r.item.activeIssue.length > 80 ? `${r.item.activeIssue.slice(0, 77)}…` : r.item.activeIssue);
    const minutesWaiting = (now.getTime() - created.getTime()) / 60_000;
    return {
      id: r.item.id,
      animalId: r.animalId,
      waitingSince: created,
      etaMinutes: r.item.etaMinutes,
      slaOverdue: minutesWaiting >= ER_HANDOFF_SLA_MINUTES,
      assignedUserId: r.item.ownerUserId,
      assignedDisplayName: r.ownerDisplay?.trim() || r.ownerName?.trim() || null,
      patientLabel: label || "Handoff",
      hospitalizationStatus: r.hospStatus,
    };
  });

  return assembleErBoardResponse(clinicId, intakes, handoffItems, now, reconciliationPatientIds);
}
