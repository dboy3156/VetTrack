// ER Wedge v1 API contracts — frozen per decision ledger Task 2.1.
// Do not change field names or remove fields; add optional fields only.
export type ErModeState = "disabled" | "preview" | "enforced";
export type ErSeverity = "low" | "medium" | "high" | "critical";
export type ErIntakeStatus =
  | "waiting"
  | "assigned"
  | "in_progress"
  | "admission_complete"
  | "discharged"
  | "cancelled";
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
/**
 * ICU / monitoring snapshot for ER board hydration (handoff rows only; optional on ErBoardItem).
 * Times are ISO 8601; numeric vitals use SI/clinical units stated in field names.
 * `extensions` carries device-specific or site-defined parameters without breaking the contract.
 */
export interface ErPhysiologicSnapshot {
  recordedAt: string;
  /** SpO₂ — peripheral oxygen saturation (0–100). */
  spo2Percent?: number | null;
  /** EtCO₂ — end-tidal CO₂ (mmHg); normalize at ingestion if the monitor reports kPa. */
  etco2MmHg?: number | null;
  /** Respiratory rate (breaths/min). */
  rrPerMin?: number | null;
  /** Heart rate (beats/min). */
  hrBpm?: number | null;
  /** Systolic blood pressure (mmHg). */
  bpSystolicMmHg?: number | null;
  /** Diastolic blood pressure (mmHg). */
  bpDiastolicMmHg?: number | null;
  /** Temperature (°C). */
  tempCelsius?: number | null;
  /** Inspired O₂ fraction (0–100). */
  fio2Percent?: number | null;
  /** PEEP (cm H₂O). */
  peepCmH2o?: number | null;
  /** Ventilator or oxygen-delivery mode label when applicable. */
  ventilationMode?: string | null;
  /** True when ventilatory support is active at snapshot time (invasive or non-invasive). */
  isVentilated?: boolean | null;
  /** Additional parameters (device keys, wave indices, site-defined numerics). */
  extensions?: Record<string, number | string | boolean | null>;
}
// ── GET /api/er/mode ──────────────────────────────────────────────────────────
export interface ErModeResponse {
  clinicId: string;
  state: ErModeState;
}
// ── GET /api/er/board ─────────────────────────────────────────────────────────
export interface ErBoardItem {
  id: string;
  /** Linked animal (patient) when known — used for bedside dispense / quick scan. */
  animalId?: string | null;
  /**
   * True when an open operational task (`BILLING_RECONCILIATION_REQUIRED`) exists for this patient.
   * Resolved server-side in GET /api/er/board (no per-card fetch).
   */
  hasOpenReconciliationTask?: boolean;
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
  /** Latest ICU monitor snapshot for this stay when `type === "hospitalization"` and source data exists. */
  icuSignals?: ErPhysiologicSnapshot | null;
  /** Set at intake creation; never mutated. */
  ambulation?: "ambulatory" | "non_ambulatory" | null;
  /** userId of the doctor who claimed this patient via Accept Patient. */
  acceptedByUserId?: string | null;
  acceptedByUserName?: string | null;
  /**
   * Server-derived: true when intake.status = "admission_complete" AND no
   * vt_shift_handoffs row exists for this intake (status != "cancelled").
   */
  admissionComplete?: boolean;
  /** Mirrors `vt_er_intake_events.status` when `type === "intake"` (card state / CTAs). */
  intakeWorkflowStatus?: string | null;
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

// ── GET /api/analytics/outcome-kpi-roi — Phase 7 leadership ROI (activation-anchored baseline) ──
export interface OutcomeKpiRoiMetric {
  baseline: number | null;
  current: number | null;
  /** Oriented so positive = improvement vs baseline (faster triage, higher integrity / recovery). */
  improvementPercent: number | null;
  baselineSampleSize: number;
  currentSampleSize: number;
}

export interface OutcomeKpiRoiWindowInfo {
  start: string;
  end: string;
  days: number;
  label: "pre_activation_14d" | "trailing_post_activation_14d";
}

export interface OutcomeKpiRoiResponse {
  clinicId: string;
  hasActivation: boolean;
  activationAt: string | null;
  baselineWindow: OutcomeKpiRoiWindowInfo | null;
  currentWindow: OutcomeKpiRoiWindowInfo | null;
  generatedAt: string;
  timeToTriageMinutesP50: OutcomeKpiRoiMetric;
  /** Direct acknowledge rate % (0–100), excluding forced overrides. */
  handoffIntegrityDirectAckPercent: OutcomeKpiRoiMetric;
  /** 100 − consumable billing leakage gap % (dispensed vs billed); higher = better capture. */
  revenueRecoveryScore: OutcomeKpiRoiMetric;
  avgDailyBillingCents: OutcomeKpiRoiMetric;
}