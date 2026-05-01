// ER Wedge v1 API contracts — frozen per decision ledger Task 2.1.
// Do not change field names or remove fields; add optional fields only.
export type ErModeState = "disabled" | "preview" | "enforced";
export type ErSeverity = "low" | "medium" | "high" | "critical";
export type ErIntakeStatus = "waiting" | "assigned" | "in_progress" | "discharged" | "cancelled";
export type ErHandoffStatus = "open" | "acknowledged" | "overdue";
export type ErLane = "criticalNow" | "next15m" | "handoffRisk";
export type ErNextActionCode =
  | "assign_vet"
  | "start_treatment"
  | "medication_due"
  | "await_results"
  | "prepare_handoff"
  | "acknowledge_handoff"
  | "monitor";
// ── GET /api/er/mode ──────────────────────────────────────────────────────────
export interface ErModeResponse {
  clinicId: string;
  state: ErModeState;
}
// ── GET /api/er/board ─────────────────────────────────────────────────────────
export interface ErBoardItem {
  id: string;
  type: "intake" | "hospitalization";
  lane: ErLane;
  severity: ErSeverity;
  patientLabel: string;
  waitingSince: string;
  /** When queue severity is scheduled to auto-escalate (low/medium); null if not applicable. */
  escalatesAt: string | null;
  assignedUserId: string | null;
  assignedUserName: string | null;
  nextActionCode: ErNextActionCode;
  nextActionLabel: string;
  badges: Array<"handoffRisk" | "overdue" | "unassigned">;
  overdueAt: string | null;
}
export interface ErBoardResponse {
  clinicId: string;
  generatedAt: string;
  lanes: {
    criticalNow: ErBoardItem[];
    next15m: ErBoardItem[];
    handoffRisk: ErBoardItem[];
  };
}
// ── POST /api/er/intake ───────────────────────────────────────────────────────
export interface CreateErIntakeRequest {
  species: string;
  severity: ErSeverity;
  chiefComplaint: string;
  animalId?: string;
  ownerName?: string;
}
export interface ErIntakeResponse {
  id: string;
  clinicId: string;
  species: string;
  severity: ErSeverity;
  chiefComplaint: string;
  status: ErIntakeStatus;
  waitingSince: string;
  assignedUserId: string | null;
  animalId: string | null;
  ownerName: string | null;
  createdAt: string;
  /** Next automatic severity bump; mirrors board anticipation timer. */
  escalatesAt: string | null;
}
// ── PATCH /api/er/intake/:id/assign ──────────────────────────────────────────
export interface AssignErIntakeRequest {
  assignedUserId: string;
}
export interface AssignErIntakeResponse {
  id: string;
  assignedUserId: string;
  status: ErIntakeStatus;
  updatedAt: string;
}
// ── GET /api/er/assignees ─────────────────────────────────────────────────────
export interface ErAssignee {
  id: string;
  name: string;
  role: string;
}
export interface ErAssigneesResponse {
  assignees: ErAssignee[];
}
// ── GET /api/er/handoffs/eligible-hospitalizations ─────────────────────────────
export interface ErEligibleHospitalizationRow {
  id: string;
  animalName: string;
  status: string;
}
export interface ErEligibleHospitalizationsResponse {
  hospitalizations: ErEligibleHospitalizationRow[];
}
// ── POST /api/er/handoffs ─────────────────────────────────────────────────────
export interface CreateErHandoffItemInput {
  /** Structured Clinical Handoff — current patient stability (mandatory). */
  currentStability: string;
  /** Structured Clinical Handoff — outstanding tasks for incoming owner (mandatory). */
  pendingTasks: string;
  /** Structured Clinical Handoff — critical warnings incoming owner must know (mandatory). */
  criticalWarnings: string;
  activeIssue: string;
  nextAction: string;
  etaMinutes: number;
  ownerUserId?: string | null;
}
export interface CreateErHandoffRequest {
  hospitalizationId: string;
  items: CreateErHandoffItemInput[];
  outgoingUserId?: string | null;
}
export interface CreateErHandoffResponse {
  id: string;
  clinicId: string;
  hospitalizationId: string | null;
  itemIds: string[];
  createdAt: string;
}
// ── POST /api/er/handoffs/:id/ack ─────────────────────────────────────────────
export interface AckErHandoffRequest {
  overrideReason?: string;
}
export interface AckErHandoffResponse {
  id: string;
  status: ErHandoffStatus;
  ackBy: string;
  ackAt: string;
}
// ── GET /api/er/impact ────────────────────────────────────────────────────────
export type ErKpiWindowDays = 7 | 14 | 30;
export type ErConfidenceLevel = "low" | "medium" | "high";
export interface ErKpiComparison {
  kpi: "doorToTriageMinutesP50" | "missedHandoffRate" | "medDelayRate";
  baselineValue: number | null;
  currentValue: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
  confidence: ErConfidenceLevel;
}
// ── Outcome KPI extensions (optional fields; do not remove or rename above fields) ──
/** Handoff Integrity KPI: rate of Structured Clinical Handoffs acknowledged directly by the
 *  incoming assignee vs. resolved via Forced Ack Override. */
export interface ErHandoffIntegrityKpi {
  totalHandoffs: number;
  directAckCount: number;
  forcedAckOverrideCount: number;
  /** 0–1 fraction; null when totalHandoffs === 0. */
  directAckRate: number | null;
  /** Pre-Go-Live Baseline direct-ack rate; null if no baseline snapshot exists. */
  baselineDirectAckRate: number | null;
}
/** SLA Performance KPI: frequency of Time Aging Escalation triggers within the window. */
export interface ErSlaEscalationKpi {
  escalationCount: number;
  /** Pre-Go-Live Baseline escalation count (same window length); null if no baseline. */
  baselineEscalationCount: number | null;
}
/** Financial Correlation KPI: captured billing revenue within the window vs. baseline average. */
export interface ErFinancialCorrelationKpi {
  capturedRevenueThisPeriodCents: number;
  currentAvgDailyRevenueCents: number;
  /** Average daily revenue in the Pre-Go-Live Baseline window; null if no baseline data. */
  baselineAvgDailyRevenueCents: number | null;
}
export interface ErImpactResponse {
  clinicId: string;
  windowDays: ErKpiWindowDays;
  baselineStartDate: string;
  baselineEndDate: string;
  comparisons: ErKpiComparison[];
  generatedAt: string;
  // Outcome KPI supplemental data (optional — populated when source data is available)
  handoffIntegrity?: ErHandoffIntegrityKpi | null;
  slaEscalation?: ErSlaEscalationKpi | null;
  financialCorrelation?: ErFinancialCorrelationKpi | null;
}