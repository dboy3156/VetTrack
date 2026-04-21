import type { ExtractedDrug } from "./types.js";

/** Narrow surface so callers do not import fuse.js at module scope (CJS/ESM interop). */
export interface FormularyFuse {
  search(query: string): Array<{ item: string; score?: number }>;
}

const FREQ_TOKEN = new Map<string, number>([
  ["bid", 2],
  ["b.i.d.", 2],
  ["tid", 3],
  ["t.i.d.", 3],
  ["qid", 4],
  ["sid", 1],
  ["qd", 1],
  ["q24h", 1],
  ["q12h", 2],
  ["q8h", 3],
  ["q6h", 4],
  ["q4h", 6],
]);

function normalizeFreqToken(raw: string): number | null {
  const k = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (FREQ_TOKEN.has(k)) return FREQ_TOKEN.get(k)!;
  const qh = k.match(/^q(\d+)h$/);
  if (qh) {
    const h = Number(qh[1]);
    if (h > 0 && h <= 24 && 24 % h === 0) return 24 / h;
  }
  return null;
}

/**
 * Administrations per 24-hour day from tokens (BID, TID, q12h, etc.).
 * This value is multiplied by (forecastWindowHours / 24) for total doses in the order window.
 */
function extractAdministrationsPer24h(line: string): number | null {
  const lower = line.toLowerCase();
  const tokens = lower.split(/[\s,/()]+/).filter(Boolean);
  for (const t of tokens) {
    const n = normalizeFreqToken(t);
    if (n != null) return n;
  }
  return null;
}

function extractCriRate(line: string): number | null {
  const m = line.match(/(\d+(?:\.\d+)?)\s*(?:ml\/h|ml\s*\/\s*h|מל\/ש)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Best-effort drug name: substring before first dose-like number sequence.
 */
function extractRawName(line: string): string {
  const withoutRoute = line.replace(/\b(IV|IM|SC|PO|SID|PRN)\b/gi, " ").trim();
  const doseStart = withoutRoute.search(/\d+(?:\.\d+)?\s*(mg|mcg|mEq|%|tab|tabs|tablet)/i);
  const slice = doseStart > 0 ? withoutRoute.slice(0, doseStart) : withoutRoute;
  return slice.replace(/[,|]+/g, " ").replace(/\s+/g, " ").trim() || withoutRoute.trim();
}

function extractDose(line: string): { value: number | null; unit: string | null; perKg: boolean } {
  const m = line.match(/(\d+(?:\.\d+)?)\s*(mg\/kg|mcg\/kg|mg\s*\/\s*kg|mcg\s*\/\s*kg)/i);
  if (m) {
    return { value: Number(m[1]), unit: m[2]!.toLowerCase().includes("mcg") ? "mcg/kg" : "mg/kg", perKg: true };
  }
  const m2 = line.match(/(\d+(?:\.\d+)?)\s*(mg|mcg|mEq|%)\b/i);
  if (m2) return { value: Number(m2[1]), unit: m2[2]!.toLowerCase(), perKg: false };
  const tab = line.match(/(\d+(?:\.\d+)?)\s*(tab|tabs|tablet)\b/i);
  if (tab) return { value: Number(tab[1]), unit: "tablet", perKg: false };
  return { value: null, unit: null, perKg: false };
}

function extractRoute(line: string): string | null {
  const m = line.match(/\b(IV|IM|SC|PO)\b/i);
  return m ? m[1]!.toUpperCase() : null;
}

export async function createFormularyFuse(formularyNames: string[]): Promise<FormularyFuse> {
  const { default: Fuse } = await import("fuse.js");
  return new Fuse(formularyNames, {
    includeScore: true,
    threshold: 0.3,
    ignoreLocation: true,
    minMatchCharLength: 2,
  }) as FormularyFuse;
}

export function extractDrugLine(line: string, fuse: FormularyFuse): ExtractedDrug {
  const trimmed = line.trim();
  const isPrn = /\bprn\b/i.test(trimmed);
  const ratePerHour = extractCriRate(trimmed);
  const isCri = ratePerHour != null || /\bcri\b/i.test(trimmed) || /\binfusion\b/i.test(trimmed);

  const rawName = extractRawName(trimmed);
  const dose = extractDose(trimmed);
  const freqPerDay = isPrn ? null : extractAdministrationsPer24h(trimmed);

  let resolvedName: string | null = null;
  if (rawName.length >= 2 && !isCri) {
    const hits = fuse.search(rawName);
    const best = hits[0];
    if (best && best.score != null && best.score <= 0.3) {
      resolvedName = best.item;
    }
  }

  return {
    rawLine: trimmed,
    rawName,
    resolvedName,
    doseValue: dose.value,
    doseUnit: dose.unit,
    doseIsPerKg: dose.perKg,
    freqPerDay,
    ratePerHour,
    route: extractRoute(trimmed),
    isCri,
    isPrn,
  };
}
