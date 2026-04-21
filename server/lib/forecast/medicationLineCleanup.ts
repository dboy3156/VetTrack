/**
 * Normalize SmartFlow / ICU lines before dose extraction: volume noise, section headers,
 * staff tags, brand→formulary names, and composite Hebrew+fluid+drug rows.
 */

const PHARM_DOSE_RE =
  /\d+(?:\.\d+)?\s*(?:mg\/kg|mcg\/kg|mg\s*\/\s*kg|mcg\s*\/\s*kg|mg|mcg|mEq|%|tab|tabs|tablet)\b/i;

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

const BRAND_REPLACEMENTS: Array<{ re: RegExp; to: string }> = [
  { re: /\bbaAUGMENTIN\b/gi, to: "Augmentin" },
  { re: /\bAUGMENTIN\b/g, to: "Augmentin" },
  { re: /\bbytril\*?\b/gi, to: "Enrofloxacin" },
  { re: /\bBaytril\b/gi, to: "Enrofloxacin" },
  { re: /\bHexakapron\b/gi, to: "Tranexamic Acid" },
  { re: /\bZofran\b/gi, to: "Ondansetron" },
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
  if (/\bpc\s+\d+\s*ml\b/i.test(t)) return true;
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
  const chunks = trimmed.split(/\s+[-–—]\s+/).map((c) => c.trim()).filter(Boolean);
  for (let i = chunks.length - 1; i >= 0; i--) {
    const c = chunks[i]!;
    if (PHARM_DOSE_RE.test(c)) return c;
    if (/\b(?:Butorphanol|Morphine|Cerenia|Famotidine|Ondansetron|Metoclopramide)\b/i.test(c) && /\d/.test(c)) {
      return c;
    }
  }
  return trimmed;
}

export function cleanMedicationLine(line: string): string {
  let s = extractLastMedicationSegment(line);
  s = stripVolumeSuffixes(s);
  s = stripSectionHeaderPrefix(s);
  s = stripTrailingStaffHebrew(s);
  s = applyBrandAliases(s);
  return s.trim();
}
