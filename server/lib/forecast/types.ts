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
  | "FLUID_VS_DRUG_UNCLEAR";

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
}

export interface ForecastPatientEntry {
  recordNumber: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  color: string;
  weightKg: number;
  ownerName: string;
  ownerId: string;
  ownerPhone: string;
  drugs: ForecastDrugEntry[];
  flags: FlagReason[];
}

export interface ForecastResult {
  windowHours: 24 | 72;
  weekendMode: boolean;
  patients: ForecastPatientEntry[];
  totalFlags: number;
  parsedAt: string;
}

/** API payloads */
export interface ApprovePayload {
  parseId: string;
  /** `${recordNumber}__${normalizedDrugName}` → resolved quantity */
  manualQuantities: Record<string, number>;
}

export interface ApproveResult {
  orderId: string;
  deliveryMethod: "smtp" | "mailto";
  mailtoUrl?: string;
}
