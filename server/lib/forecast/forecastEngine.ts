import type {
  ForecastDrugEntry,
  ForecastPatientEntry,
  ForecastResult,
  FlagReason,
  ParsedPatientBlock,
  ScoredDrug,
} from "./types.js";

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

export interface AnimalRow {
  id: string;
  recordNumber: string | null;
  name: string;
  species: string | null;
  breed: string | null;
  sex: string | null;
  color: string | null;
  weightKg: number | null;
  ownerFullName: string | null;
  ownerNationalId: string | null;
  ownerPhone: string | null;
}

function ceilPositive(n: number): number {
  return Math.max(1, Math.ceil(n));
}

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

function physicalUnitsForRegular(
  drug: ScoredDrug,
  mgPerAdmin: number | null,
  freqPerDay: number | null,
  windowHours: number,
  formulary: FormularyDrugRow | undefined,
): { qty: number | null; unitLabel: string; concentrationLabel: string } {
  const conc = formulary?.concentrationMgMl ?? 10;
  const unitVolMl = formulary?.unitVolumeMl != null ? Number(formulary.unitVolumeMl) : 1;

  const du = drug.doseUnit?.toLowerCase() ?? "";
  const isTablet =
    drug.type === "regular" &&
    formulary?.doseUnit === "tablet" &&
    (du.includes("tablet") || du.includes("tab"));

  if (isTablet && drug.doseValue != null && freqPerDay != null) {
    const doses = freqPerDay * (windowHours / 24);
    const qty = ceilPositive(drug.doseValue * doses);
    return { qty, unitLabel: "טבליות", concentrationLabel: `${conc} טבלה` };
  }

  if (mgPerAdmin == null || freqPerDay == null) return { qty: null, unitLabel: "יח׳", concentrationLabel: `${conc} mg/mL` };

  const mgTotal = mgPerAdmin * freqPerDay * (windowHours / 24);
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

export function enrichAndForecast(params: {
  parsedBlocks: ParsedPatientBlock[];
  windowHours: 24 | 72;
  weekendMode: boolean;
  formularyByNormalizedName: Map<string, FormularyDrugRow>;
  animalsByRecord: Map<string, AnimalRow>;
}): ForecastResult {
  const patients: ForecastPatientEntry[] = [];

  const normalizeKey = (s: string) => s.trim().toLowerCase();

  for (const block of params.parsedBlocks) {
    const rec = block.recordNumber?.trim();
    const animal = rec ? (params.animalsByRecord.get(rec) ?? null) : null;

    const animalFlags = [...block.flags];
    if (rec && !animal) animalFlags.push("PATIENT_UNKNOWN");

    const weightKg = animal?.weightKg != null && animal.weightKg > 0 ? animal.weightKg : 12;

    const forecastDrugs: ForecastDrugEntry[] = [];

    for (const drug of block.drugs) {
      let flags = [...drug.flags];

      const formulary =
        drug.resolvedName != null
          ? params.formularyByNormalizedName.get(normalizeKey(drug.resolvedName))
          : undefined;

      const prescribedPerKg = prescribedMgPerKg(drug);
      flags = checkDoseBounds(drug, prescribedPerKg, formulary, flags);

      let quantityUnits: number | null = null;
      let unitLabel = "יח׳";
      let packDescription = "";
      let concentrationStr = formulary ? `${formulary.concentrationMgMl} mg/mL` : "?";

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
        const freq = drug.freqPerDay;
        const phys = physicalUnitsForRegular(drug, mgAbs, freq, params.windowHours, formulary);
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
      });
    }

    patients.push({
      recordNumber: rec ?? "",
      name: animal?.name ?? "",
      species: animal?.species ?? "",
      breed: animal?.breed ?? "",
      sex: animal?.sex ?? "",
      color: animal?.color ?? "",
      weightKg,
      ownerName: animal?.ownerFullName ?? "",
      ownerId: animal?.ownerNationalId ?? "",
      ownerPhone: animal?.ownerPhone ?? "",
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
