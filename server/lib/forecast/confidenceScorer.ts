import type {
  DrugType,
  ExtractedDrug,
  FlagReason,
  ParsedPatientBlock,
  RawPatientBlock,
  ScoredDrug,
} from "./types.js";
import { extractDrugLine, type FormularyFuse } from "./fieldExtractor.js";

const FLUID_FAMILY_IN_LINE = /\b(?:LRS|Plasma|FFP|DW|5DW|NGT)\b/i;
const PHARM_DOSE_LINE_RE =
  /\d+(?:\.\d+)?\s*(?:mg\/kg|mcg\/kg|mg\s*\/\s*kg|mcg\s*\/\s*kg|mg|mcg|mEq|%|tab|tabs|tablet)\b/i;

function baseConfidence(extracted: ExtractedDrug): number {
  if (extracted.isCri && extracted.ratePerHour != null) return 0.95;
  if (extracted.isPrn) return 0.9;
  if (!extracted.rawName.trim()) return 0.2;
  return 0.82;
}

function classifyType(extracted: ExtractedDrug): DrugType {
  if (extracted.isPrn) return "prn";
  if (extracted.isCri) return "cri";
  return "regular";
}

export function scoreExtractedDrug(extracted: ExtractedDrug): ScoredDrug {
  const type = classifyType(extracted);
  let confidence = baseConfidence(extracted);
  const flags: FlagReason[] = [];

  if (!extracted.isCri && !extracted.rawName.trim()) {
    confidence = 0.2;
    flags.push("LOW_CONFIDENCE");
  }

  if (!extracted.isCri && extracted.resolvedName == null && !extracted.isPrn) {
    flags.push("DRUG_UNKNOWN");
    confidence = Math.min(confidence, 0.55);
  }

  if (!extracted.isCri && !extracted.isPrn && extracted.freqPerDay == null) {
    flags.push("FREQ_MISSING");
    confidence = Math.min(confidence, 0.65);
  }

  if (extracted.isPrn) {
    flags.push("PRN_MANUAL");
  }

  if (confidence < 0.75 && !flags.includes("LOW_CONFIDENCE")) {
    flags.push("LOW_CONFIDENCE");
  }

  const line = extracted.rawLine;
  if (FLUID_FAMILY_IN_LINE.test(line) && PHARM_DOSE_LINE_RE.test(line)) {
    flags.push("FLUID_VS_DRUG_UNCLEAR");
  }
  if (
    flags.includes("DRUG_UNKNOWN") &&
    PHARM_DOSE_LINE_RE.test(line) &&
    !flags.includes("LINE_AMBIGUOUS")
  ) {
    flags.push("LINE_AMBIGUOUS");
  }

  return {
    ...extracted,
    confidence,
    type,
    flags,
  };
}

/** Within a block, mark first higher duplicate drug line as LD (same resolved name). */
export function applyLoadingDoseHeuristic(drugs: ScoredDrug[]): ScoredDrug[] {
  const byName = new Map<string, number[]>();
  drugs.forEach((d, idx) => {
    const key = (d.resolvedName ?? d.rawName).trim().toLowerCase();
    if (!key || d.type !== "regular") return;
    const arr = byName.get(key) ?? [];
    arr.push(idx);
    byName.set(key, arr);
  });

  const out = drugs.map((d) => ({ ...d }));
  for (const [, idxs] of byName) {
    if (idxs.length < 2) continue;
    const sorted = [...idxs].sort((a, b) => {
      const da = drugs[a]?.doseValue ?? 0;
      const db = drugs[b]?.doseValue ?? 0;
      return db - da;
    });
    const ldIdx = sorted[0];
    if (ldIdx === undefined) continue;
    const first = out[ldIdx];
    if (!first) continue;
    const secondDose = sorted[1] !== undefined ? drugs[sorted[1]!]?.doseValue ?? 0 : 0;
    const firstDose = first.doseValue ?? 0;
    if (secondDose > 0 && firstDose >= 1.5 * secondDose) {
      out[ldIdx] = {
        ...first,
        type: "ld",
        flags: first.flags.filter((f) => f !== "FREQ_MISSING"),
      };
    }
  }

  return out;
}

export function parsePatientBlocks(
  blocks: RawPatientBlock[],
  fuse: FormularyFuse,
  recordHintFromHeader: (header: string) => string | null,
): ParsedPatientBlock[] {
  const out: ParsedPatientBlock[] = [];

  for (const block of blocks) {
    const recordNumber = recordHintFromHeader(block.headerLine);
    const drugs: ScoredDrug[] = [];

    let drugLinesOnly = [...block.drugLines];

    if (drugLinesOnly.length === 0) {
      const headerAsDrug = extractDrugLine(block.headerLine, fuse);
      const headerLooksLikeDrug =
        headerAsDrug.rawName.length > 2 &&
        (headerAsDrug.doseValue != null || headerAsDrug.isPrn || headerAsDrug.isCri);
      if (headerLooksLikeDrug) drugLinesOnly.push(block.headerLine);
    }

    for (const line of drugLinesOnly) {
      const ext = extractDrugLine(line, fuse);
      drugs.push(scoreExtractedDrug(ext));
    }

    const flagged = applyLoadingDoseHeuristic(drugs);

    const patientFlags: FlagReason[] = [];

    const parsed: ParsedPatientBlock = {
      rawHeader: block.headerLine,
      recordNumber,
      drugs: flagged,
      flags: patientFlags,
    };
    out.push(parsed);
  }

  return out;
}
