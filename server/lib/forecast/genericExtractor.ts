import type { FormularyDrugRow } from "./forecastEngine.js";
import { createFormularyFuse, type FormularyFuse } from "./fieldExtractor.js";
import { parsePatientBlocks } from "./confidenceScorer.js";
import { enrichAndForecast } from "./forecastEngine.js";
import { extractPdfPatientDemographics } from "./flowsheetDemographics.js";
import { extractRecordNumberHint } from "./structureDetector.js";
import type { ForecastResult, ParsedPatientBlock, RawPatientBlock } from "./types.js";

const MIN_GENERIC_LINE_LENGTH = 5;
const GENERIC_KEYWORD_RE =
  /\b(mg\/kg|mcg\/kg|mg|mcg|tablet|tab|capsule|cap|q\d+h|bid|tid|qid|sid|prn|iv|im|sc|po|cri|infusion)\b/i;
const GENERIC_SPLIT_RE = /[\r\n]+|(?<=[.;])\s+(?=[A-Za-z\u0590-\u05FF])/g;

function normalizeGenericRawText(rawText: string): string[] {
  return rawText
    .replace(/\r\n/g, "\n")
    .split(GENERIC_SPLIT_RE)
    .map((line) => line.trim())
    .filter((line) => line.length >= MIN_GENERIC_LINE_LENGTH);
}

function looksLikeMedicationLine(line: string): boolean {
  const compact = line.replace(/\s+/g, " ").trim();
  if (compact.length < MIN_GENERIC_LINE_LENGTH) return false;
  if (!/[A-Za-z\u0590-\u05FF]/.test(compact)) return false;
  return GENERIC_KEYWORD_RE.test(compact);
}

function buildGenericMedicationLines(rawText: string): string[] {
  const unique = new Set<string>();
  const lines: string[] = [];
  for (const line of normalizeGenericRawText(rawText)) {
    if (!looksLikeMedicationLine(line)) continue;
    const key = line.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    lines.push(line);
  }
  return lines;
}

export function parseGenericPatientBlocks(params: {
  rawText: string;
  fuse: FormularyFuse;
  extractRecordNumberHint: (header: string) => string | null;
}): ParsedPatientBlock[] {
  const medicationLines = buildGenericMedicationLines(params.rawText);
  if (medicationLines.length === 0) return [];
  const syntheticBlock: RawPatientBlock = {
    headerLine: medicationLines[0] ?? "generic-parse",
    drugLines: medicationLines,
  };
  return parsePatientBlocks([syntheticBlock], params.fuse, params.extractRecordNumberHint).map((block) => ({
    ...block,
    drugs: block.drugs.map((drug) => {
      const missingDoseSignal = drug.doseValue == null && drug.ratePerHour == null;
      const shouldForceReview =
        drug.flags.includes("LOW_CONFIDENCE") ||
        drug.confidence < 0.7 ||
        (drug.isCri && missingDoseSignal);
      if (shouldForceReview) {
        return drug.flags.includes("LOW_CONFIDENCE")
          ? drug
          : { ...drug, flags: [...drug.flags, "LOW_CONFIDENCE"] };
      }
      return drug;
    }),
  }));
}

export async function buildGenericForecastResult(params: {
  rawText: string;
  formularyRows: FormularyDrugRow[];
  windowHours: 24 | 72;
  weekendMode: boolean;
  exclusionSubstrings: string[];
}): Promise<ForecastResult> {
  const fuse = await createFormularyFuse(params.formularyRows.map((row) => row.name));
  const parsedBlocks = parseGenericPatientBlocks({
    rawText: params.rawText,
    fuse,
    extractRecordNumberHint,
  });
  const formularyByNormalizedName = new Map<string, FormularyDrugRow>();
  for (const row of params.formularyRows) {
    formularyByNormalizedName.set(row.name.trim().toLowerCase(), row);
  }
  const result = enrichAndForecast({
    parsedBlocks,
    windowHours: params.windowHours,
    weekendMode: params.weekendMode,
    formularyByNormalizedName,
    pdfPatient: extractPdfPatientDemographics(params.rawText),
    exclusionSubstrings: params.exclusionSubstrings,
  });
  return {
    ...result,
    pdfSourceFormat: "generic",
  };
}
