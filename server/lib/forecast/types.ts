/** Shared types for ICU pharmacy forecast parser, API, and frontend mirror. */

export type DrugType = "regular" | "cri" | "prn" | "ld";

export type FlagReason =
  | "DOSE_HIGH"
  | "DOSE_LOW"
  | "FREQ_MISSING"
  | "DRUG_UNKNOWN"
  | "PRN_MANUAL"
  | "PATIENT_UNKNOWN"
  | "LOW_CONFIDENCE"
  | "LINE_AMBIGUOUS"
  | "FLUID_VS_DRUG_UNCLEAR"
  | "WEIGHT_UNKNOWN"
  | "WEIGHT_UNCERTAIN"
  | "DUPLICATE_LINE"
  | "ALL_DRUGS_EXCLUDED";

/** Layer 1 output */
export interface RawPatientBlock {
  headerLine: string;
  drugLines: string[];
}

/** Layer 2 output */
export interface ExtractedDrug {
  rawLine: string;
  rawName: string;
  resolvedName: string | null;
  doseValue: number | null;
  doseUnit: string | null;
  /** When true, doseValue is per kg (mg/kg or mcg/kg) and needs animal weight. */
  doseIsPerKg: boolean;
  /** Administrations per 24-hour period (e.g. BID=2, TID=3, q12h=2). Drives order quantity. */
  freqPerDay: number | null;
  ratePerHour: number | null;
  route: string | null;
  isCri: boolean;
  isPrn: boolean;
}

/** Layer 3 output */
export interface ScoredDrug extends ExtractedDrug {
  confidence: number;
  type: DrugType;
  flags: FlagReason[];
}

export interface ParsedPatientBlock {
  rawHeader: string;
  recordNumber: string | null;
  drugs: ScoredDrug[];
  flags: FlagReason[];
}

/** Forecast engine output */
export interface ForecastDrugEntry {
  drugName: string;
  concentration: string;
  packDescription: string;
  route: string;
  type: DrugType;
  quantityUnits: number | null;
  unitLabel: string;
  flags: FlagReason[];
  /** Effective administrations per 24h used for quantity (parsed or inferred). */
  administrationsPer24h: number | null;
  /** Total administrations in the forecast window (24 or 72h). */
  administrationsInWindow: number | null;
}

export interface ForecastPatientEntry {
  recordNumber: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  /** Animal age from flowsheet (e.g. "4 years") when present. */
  age: string;
  color: string;
  weightKg: number;
  ownerName: string;
  ownerId: string;
  ownerPhone: string;
  drugs: ForecastDrugEntry[];
  flags: FlagReason[];
}

export interface ForecastParseFailure {
  fileName: string;
  message: string;
}

export interface ForecastResult {
  windowHours: 24 | 72;
  weekendMode: boolean;
  patients: ForecastPatientEntry[];
  totalFlags: number;
  parsedAt: string;
  parseFailures?: ForecastParseFailure[];
}

/** API payloads */
export interface ApprovePayload {
  parseId: string;
  /** `${recordNumber}__${normalizedDrugName}` → resolved quantity */
  manualQuantities: Record<string, number>;
  /** Keys for lines where pharmacist acknowledged DOSE_HIGH / DOSE_LOW. */
  pharmacistDoseAcks?: string[];
  /** normalizeQuantityKey(recordNumber, drugName) → trace for email display */
  auditTrace?: Record<string, { forecastedQty: number | null; onHandQty: number }>;
  /** recordNumber → corrected weight kg */
  patientWeightOverrides?: Record<string, number>;
}

export interface ApproveResult {
  orderId: string;
  deliveryMethod: "smtp" | "mailto";
  mailtoUrl?: string;
}

export interface DrugAuditEntry {
  forecastedQty: number | null;
  onHandQty: number;
  orderQty: number;
  confirmed: boolean;
}

export interface PatientAuditState {
  recordNumber: string;
  warningAcknowledgements: Record<string, boolean>;
  weightOverride: number | null;
  patientNameOverride: string | null;
  /** keyed by drug.drugName */
  drugs: Record<string, DrugAuditEntry>;
}

export interface AuditState {
  forecastRunId: string;
  patients: Record<string, PatientAuditState>;
}
