import type {
  ForecastDrugEntry,
  ForecastPatientEntry,
  ForecastResult,
  FlagReason,
  ParsedPatientBlock,
  ScoredDrug,
} from "./types.js";
import { hasPdfIdentity, type PdfPatientDemographics } from "./flowsheetDemographics.js";

export interface FormularyDrugRow {
  id: string;
  name: string;
  concentrationMgMl: number;
  minDose: number | null;
  maxDose: number | null;
  doseUnit: string;
  defaultRoute: string | null;
  unitVolumeMl: number | null;
  unitType: string | null;
  criBufferPct: number | null;
}

function ceilPositive(n: number): number {
  return Math.max(1, Math.ceil(n));
}

/** Forecast windows are multiples of one calendar day; frequency is always expressed per 24h. */
export const FORECAST_HOURS_PER_DAY = 24;

/** Absolute prescribed dose in mg (or tablet count tracked separately). */
function absoluteDoseMg(drug: ScoredDrug, weightKg: number): number | null {
  if (drug.type === "cri" || drug.type === "prn") return null;
  const v = drug.doseValue;
  if (v == null || !drug.doseUnit) return null;

  const u = drug.doseUnit.toLowerCase();
  if (u.includes("tablet") || u.includes("tab")) return null;

  if (drug.doseIsPerKg) {
    if (weightKg <= 0) return null;
    if (u.includes("mcg")) return (v * weightKg) / 1000;
    return v * weightKg;
  }

  return v;
}

function checkDoseBounds(
  drug: ScoredDrug,
  prescribedMgPerKg: number | null,
  formulary: FormularyDrugRow | undefined,
  flags: FlagReason[],
): FlagReason[] {
  const next = [...flags];
  if (!formulary || formulary.minDose == null || formulary.maxDose == null) return next;
  if (prescribedMgPerKg == null || drug.type === "cri") return next;

  const du = formulary.doseUnit;
  let mgPerKg = prescribedMgPerKg;

  if (du === "mcg_per_kg") mgPerKg = prescribedMgPerKg / 1000;

  if (mgPerKg < formulary.minDose) next.push("DOSE_LOW");
  if (mgPerKg > formulary.maxDose) next.push("DOSE_HIGH");

  return next;
}

/** mg/kg prescribed for formulary bounds when dose is per-kg */
function prescribedMgPerKg(drug: ScoredDrug): number | null {
  const v = drug.doseValue;
  if (v == null || drug.doseUnit == null) return null;
  const u = drug.doseUnit.toLowerCase();
  if (drug.doseIsPerKg) {
    return u.includes("mcg") ? v / 1000 : v;
  }
  return null;
}

function describePack(row: FormularyDrugRow): string {
  const vol = row.unitVolumeMl != null ? `${row.unitVolumeMl} מ״ל` : "יח׳";
  const kind =
    row.unitType === "tablet"
      ? "טבליות"
      : row.unitType === "vial"
        ? "בקבוקון"
        : row.unitType === "bag"
          ? "שקית"
          : "יחידה";
  return `${kind} · ${vol}`;
}

/**
 * Vial/liquid quantity from scheduled (non-PRN) drugs:
 *   totalMg = mgPerAdministration × administrationsPer24h × (forecastWindowHours / 24)
 * Tablets: totalTabs = tabsPerAdmin × administrationsPer24h × (forecastWindowHours / 24)
 */
function physicalUnitsForRegular(
  drug: ScoredDrug,
  mgPerAdmin: number | null,
  administrationsPer24h: number | null,
  windowHours: number,
  formulary: FormularyDrugRow | undefined,
): { qty: number | null; unitLabel: string; concentrationLabel: string } {
  const conc = formulary?.concentrationMgMl ?? 10;
  const unitVolMl = formulary?.unitVolumeMl != null ? Number(formulary.unitVolumeMl) : 1;
  const windowDays = windowHours / FORECAST_HOURS_PER_DAY;

  const du = drug.doseUnit?.toLowerCase() ?? "";
  const isTablet =
    drug.type === "regular" &&
    formulary?.doseUnit === "tablet" &&
    (du.includes("tablet") || du.includes("tab"));

  if (isTablet && drug.doseValue != null && administrationsPer24h != null) {
    const administrationsInWindow = administrationsPer24h * windowDays;
    const qty = ceilPositive(drug.doseValue * administrationsInWindow);
    return { qty, unitLabel: "טבליות", concentrationLabel: `${conc} טבלה` };
  }

  if (mgPerAdmin == null || administrationsPer24h == null) {
    return { qty: null, unitLabel: "יח׳", concentrationLabel: `${conc} mg/mL` };
  }

  const administrationsInWindow = administrationsPer24h * windowDays;
  const mgTotal = mgPerAdmin * administrationsInWindow;
  const mgPerUnit = conc * unitVolMl;
  const qty = mgPerUnit > 0 ? ceilPositive(mgTotal / mgPerUnit) : null;

  let unitLabel = "אמפולות";
  if (formulary?.unitType === "tablet") unitLabel = "טבליות";
  else if (formulary?.unitType === "bag") unitLabel = "שקיות";
  else if (formulary?.unitType === "vial") unitLabel = "בקבוקונים";

  return {
    qty,
    unitLabel,
    concentrationLabel: `${conc} mg/mL · ${describePack(formulary ?? ({} as FormularyDrugRow))}`,
  };
}

function criUnits(
  drug: ScoredDrug,
  windowHours: number,
  formulary: FormularyDrugRow | undefined,
): number | null {
  const rate = drug.ratePerHour;
  if (rate == null) return null;
  const unitVolMl = formulary?.unitVolumeMl != null ? Number(formulary.unitVolumeMl) : 1;
  const buffer = formulary?.criBufferPct != null ? Number(formulary.criBufferPct) : 0.25;
  const mlTotal = rate * windowHours * (1 + buffer);
  return ceilPositive(mlTotal / unitVolMl);
}

function administrationsInOrderWindow(
  administrationsPer24h: number | null,
  windowHours: number,
): number | null {
  if (administrationsPer24h == null) return null;
  return administrationsPer24h * (windowHours / FORECAST_HOURS_PER_DAY);
}

export function enrichAndForecast(params: {
  parsedBlocks: ParsedPatientBlock[];
  windowHours: 24 | 72;
  weekendMode: boolean;
  formularyByNormalizedName: Map<string, FormularyDrugRow>;
  /** Patient display + weight from PDF extract; pharmacy does not use vt_animals. */
  pdfPatient: PdfPatientDemographics | null;
  /** Substrings (matched case-insensitively) against raw line, extracted name, and formulary-resolved name — drug omitted if any hit. */
  exclusionSubstrings: string[];
}): ForecastResult {
  const patients: ForecastPatientEntry[] = [];

  const normalizeKey = (s: string) => s.trim().toLowerCase();
  const pdf = params.pdfPatient;

  function normalizeForSubstringMatch(s: string): string {
    return s.normalize("NFKC").trim().toLowerCase();
  }

  const exclusions = params.exclusionSubstrings
    .map((s) => normalizeForSubstringMatch(s))
    .filter((s) => s.length > 0);

  /** Match against full line, extracted drug token, and resolved formulary name (CRI often has no resolved name). */
  function isExcludedDrug(drug: ScoredDrug): boolean {
    if (exclusions.length === 0) return false;
    const haystacks = [drug.rawLine, drug.rawName, drug.resolvedName ?? ""]
      .map((s) => normalizeForSubstringMatch(s))
      .filter((s) => s.length > 0);
    for (const ex of exclusions) {
      for (const h of haystacks) {
        if (h.includes(ex)) return true;
      }
    }
    return false;
  }

  for (const block of params.parsedBlocks) {
    const recFromParse = block.recordNumber?.trim() ?? "";
    const displayRecord = pdf?.recordNumber?.trim() || recFromParse;

    const animalFlags = [...block.flags];
    const identified = hasPdfIdentity(pdf) || Boolean(recFromParse);
    if (!identified) animalFlags.push("PATIENT_UNKNOWN");

    const weightKg =
      pdf?.weightKg != null && pdf.weightKg > 0 ? pdf.weightKg : 12;

    const forecastDrugs: ForecastDrugEntry[] = [];

    for (const drug of block.drugs) {
      if (isExcludedDrug(drug)) continue;

      let flags = [...drug.flags];

      const formulary =
        drug.resolvedName != null
          ? params.formularyByNormalizedName.get(normalizeKey(drug.resolvedName))
          : undefined;

      const prescribedPerKg = prescribedMgPerKg(drug);
      flags = checkDoseBounds(drug, prescribedPerKg, formulary, flags);

      const inferredFreq =
        drug.freqPerDay ??
        ((drug.type === "regular" || drug.type === "ld") && formulary != null ? 1 : null);
      if (drug.freqPerDay == null && inferredFreq != null) {
        flags = flags.filter((f) => f !== "FREQ_MISSING");
      }

      let quantityUnits: number | null = null;
      let unitLabel = "יח׳";
      let packDescription = "";
      let concentrationStr = formulary ? `${formulary.concentrationMgMl} mg/mL` : "?";
      let administrationsPer24h: number | null = null;
      let administrationsInWindow: number | null = null;

      if (drug.type === "cri") {
        quantityUnits = criUnits(drug, params.windowHours, formulary);
        concentrationStr = `${formulary?.concentrationMgMl ?? "?"} mg/mL`;
        unitLabel =
          formulary?.unitType === "bag"
            ? "שקיות"
            : formulary?.unitType === "vial"
              ? "בקבוקונים"
              : "יח׳";
        packDescription = formulary ? describePack(formulary) : "";
      } else if (drug.type === "prn") {
        quantityUnits = null;
        unitLabel = "יח׳";
        packDescription = formulary ? describePack(formulary) : "";
      } else {
        const mgAbs = absoluteDoseMg(drug, weightKg);
        const freqForCalc = drug.freqPerDay ?? inferredFreq;
        administrationsPer24h = freqForCalc;
        administrationsInWindow = administrationsInOrderWindow(freqForCalc, params.windowHours);
        const phys = physicalUnitsForRegular(drug, mgAbs, freqForCalc, params.windowHours, formulary);
        quantityUnits = phys.qty;
        unitLabel = phys.unitLabel;
        concentrationStr = phys.concentrationLabel.split("·")[0]?.trim() ?? concentrationStr;
        packDescription = formulary ? describePack(formulary) : "";
      }

      forecastDrugs.push({
        drugName: drug.resolvedName ?? drug.rawName,
        concentration: concentrationStr,
        packDescription,
        route: drug.route ?? formulary?.defaultRoute ?? "",
        type: drug.type,
        quantityUnits,
        unitLabel,
        flags,
        administrationsPer24h,
        administrationsInWindow,
      });
    }

    if (forecastDrugs.length === 0) continue;

    patients.push({
      recordNumber: displayRecord,
      name: pdf?.name ?? "",
      species: pdf?.species ?? "",
      breed: pdf?.breed ?? "",
      sex: pdf?.sex ?? "",
      color: pdf?.color ?? "",
      weightKg,
      ownerName: pdf?.ownerName ?? "",
      ownerId: "",
      ownerPhone: pdf?.ownerPhone ?? "",
      drugs: forecastDrugs,
      flags: animalFlags,
    });
  }

  const totalFlags = patients.reduce(
    (sum, p) => sum + p.flags.length + p.drugs.reduce((s, d) => s + d.flags.length, 0),
    0,
  );

  return {
    windowHours: params.windowHours,
    weekendMode: params.weekendMode,
    patients,
    totalFlags,
    parsedAt: new Date().toISOString(),
  };
}
