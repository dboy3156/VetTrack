/**
 * Normalize SmartFlow / ICU lines before dose extraction: volume noise, section headers,
 * staff tags, brand→formulary names, and composite Hebrew+fluid+drug rows.
 */

import { PHARM_DOSE_RE } from "../../../src/lib/constants/regex.js";

/** Strip /100ml, \100ml, / 100 ml, etc. */
export function stripVolumeSuffixes(line: string): string {
  return line
    .replace(/(?:[/\\]\s*100\s*ml\b|\\100ml\b|\/100ml\b)/gi, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Remove glued section headers before a dose line, e.g. "PROCEDURES 100 Hexakapron" → "100 Hexakapron". */
export function stripSectionHeaderPrefix(line: string): string {
  return line
    .replace(
      /^\s*(?:PROCEDURES|MEDICATIONS|FLUIDS|MONITORINGS|ACTIVITIES|TREATMENT\s+PROTOCOL[^\n]*)\s+/i,
      "",
    )
    .trim();
}

/** Short Hebrew tokens at end of line (common staff initials), after Latin drug text. */
export function stripTrailingStaffHebrew(line: string): string {
  if (/[\u0590-\u05FF]{8,}/.test(line)) return line;
  return line.replace(/\s+[\u0590-\u05FF]{2,4}\s*$/u, "").trim();
}

/**
 * Strip leading Hebrew words that appear before a Latin/numeric drug name (staff initials or annotations).
 * e.g. "ישרחש 1 Cisapride Syr" → "1 Cisapride Syr", "היסט... zofran" → "... zofran".
 * Does NOT strip pure-Hebrew lines (e.g. drug names or patient names in Hebrew).
 */
export function stripLeadingHebrew(line: string): string {
  // Strip leading Hebrew word(s) optionally followed by noise chars (spaces, dots, ellipsis)
  // Only when what follows is a Latin letter or digit (actual drug name / dose).
  return line.replace(/^[\u0590-\u05FF]+(?:\s+[\u0590-\u05FF]+)*[\s.…\-]+(?=[A-Za-z\d])/, "").trim();
}

const BRAND_REPLACEMENTS: Array<{ re: RegExp; to: string }> = [
  { re: /\ba?AUGMENTIN\b/gi, to: "Augmentin" },
  { re: /\bbaAUGMENTIN\b/gi, to: "Augmentin" },
  { re: /\bbytril\*?\b/gi, to: "Enrofloxacin" },
  { re: /\bBaytril\b/gi, to: "Enrofloxacin" },
  { re: /\bHexakapron\b/gi, to: "Tranexamic Acid" },
  // Zofran may be directly glued to dose digits (e.g. "zofran1.95 mg"), so drop the trailing \b
  { re: /\bZofran(?![a-zA-Z])/gi, to: "Ondansetron" },
  { re: /\bRemeron\b/gi, to: "Mirtazapine" },
  { re: /\bMirtazipine\b/gi, to: "Mirtazapine" },
  { re: /\bCerenia\s+inj\b/gi, to: "Cerenia" },
  { re: /\bOptalgin\b/gi, to: "Optalgin" },
  { re: /\bCeftriaxone\b/gi, to: "Ceftriaxone" },
  { re: /\bCEFTRIAXONE\b/g, to: "Ceftriaxone" },
  { re: /\bMetronidazol\b/gi, to: "Metronidazole" },
];

export function applyBrandAliases(line: string): string {
  let s = line;
  for (const { re, to } of BRAND_REPLACEMENTS) s = s.replace(re, to);
  return s;
}

/**
 * Blood / transfusion products — exclude from pharmacy medication list (not vial orders).
 */
export function isBloodProductLine(line: string): boolean {
  const t = line.toLowerCase();
  if (/\b(?:packed\s*cells|prbc|whole\s*blood|blood\s*transfusion|transfusion)\b/.test(t)) return true;
  // "PC 50 ml" or "PC 50ml12" — packed cells CRI; match without requiring word boundary after ml
  if (/\bpc\s+\d+\s*ml/i.test(t)) return true;
  if (/\bffp\b/.test(t) && /\bml\/h/.test(t)) return true;
  return false;
}

/**
 * When a line mixes Hebrew + NGT/ml/hr noise with a trailing drug (e.g. … Butorphanol … mg),
 * keep the last meaningful medication segment.
 */
export function extractLastMedicationSegment(line: string): string {
  const trimmed = line.trim();
  if (!/[\u0590-\u05FF]/.test(trimmed) || !/(?:NGT|ml\/hr|הזנה)/i.test(trimmed)) {
    return trimmed;
  }
  // Also split on dash+space when immediately preceded by a Hebrew char or digit and followed by ASCII/digit.
  // This handles SmartFlow compound lines like "…אלאל- 10 Butorphanol…" where the separator has no
  // leading whitespace.
  const chunks = trimmed
    .split(/\s+[-–—]\s+|(?<=[\u0590-\u05FF\d])[-–—]\s+(?=[A-Za-z\d])/)
    .map((c) => c.trim())
    .filter(Boolean);
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i]!;
    if (PHARM_DOSE_RE.test(c)) return c;
    if (/\b(?:Butorphanol|Morphine|Cerenia|Famotidine|Ondansetron|Metoclopramide)\b/i.test(c) && /\d/.test(c)) {
      return c;
    }
  }
  return trimmed;
}

/**
 * Strip the SmartFlow PRN star prefix (⭐ or ★) that marks as-needed drugs.
 * Must run before brand alias so "⭐ 50 aAUGMENTIN" → "50 aAUGMENTIN" → "Augmentin".
 */
export function stripPrnStar(line: string): string {
  return line.replace(/^[\u2B50\u2605\u2606]\s*/u, "").trim();
}

/**
 * Strip a bare leading integer that has no dose-unit suffix and precedes the drug name.
 * e.g. "10 Cerenia inj" → "Cerenia inj", "500 Optalgin" → "Optalgin", "100 ml Pramin" → "Pramin".
 * Does NOT strip when the number is immediately followed by mg/mcg/ml/% (dose token — kept for extraction).
 */
export function stripLeadingBareNumber(line: string): string {
  // Strip leading number + optional volume (ml/mL) that precede the drug name
  return line
    .replace(/^\d+(?:\.\d+)?\s*(?:ml|mL)\s+/i, "")  // "100 ml Pramin" → "Pramin"
    .replace(/^\d+(?:\.\d+)?\s+(?![a-z]*(?:mg|mcg|mEq|%|tab)\b)/i, "") // "10 Cerenia" → "Cerenia"
    .trim();
}

/** Strip trailing injection/route noise: "inj", "inj.", "injection". */
export function stripInjectionSuffix(line: string): string {
  return line.replace(/\s+inj\.?\s*$/i, "").trim();
}

export function cleanMedicationLine(line: string): string {
  let s = extractLastMedicationSegment(line);
  s = stripVolumeSuffixes(s);
  s = stripSectionHeaderPrefix(s);
  s = stripTrailingStaffHebrew(s);
  s = stripLeadingHebrew(s);
  s = stripPrnStar(s);
  s = applyBrandAliases(s);
  // NOTE: stripLeadingBareNumber and stripInjectionSuffix are intentionally NOT called here
  // so that dose numbers survive for extractDose(). They are applied inside extractRawName
  // (fieldExtractor.ts) for name-only extraction.
  return s.trim();
}
