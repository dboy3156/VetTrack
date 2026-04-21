const PHARM_DOSE_RE =
  /\d+(?:\.\d+)?\s*(?:mg\/kg|mcg\/kg|mg\s*\/\s*kg|mcg\s*\/\s*kg|mg|mcg|mEq|%|tab|tabs|tablet)\b/i;

const FLUID_START_RE =
  /^\s*(?:LRS|Plasma|FFP|DW|NS|0\.9%\s*NaCl|dextrose|5%D|5DW|10%D|Sterofundin|Normosol|saline)\b/i;

const MONITORING_START_RE =
  /^\s*(?:Resp\.?\s*rate|Heart\s*rate|Temperature|BP\b|Attitude|MM\b|Blood\s*Glucose|glu\b|PCV\b|Weight\b|Diet\s*-\s*Food|Water\b|Walk\b|Urination|Defaecation)\b/i;

function normalizeRaw(s: string): string {
  return s
    .replace(/\r\n/g, "\n")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\u00a0/g, " ");
}

/** When both appear, keep only lines inside MEDICATIONS … before PROCEDURES (exclusive of PROCEDURES block). */
function sliceMedicationsRegion(text: string): string {
  const u = text.toUpperCase();
  let iMed = u.indexOf("\nMEDICATIONS");
  if (iMed !== -1) iMed += 1;
  else if (u.startsWith("MEDICATIONS")) iMed = 0;
  else iMed = -1;
  const iProc = u.indexOf("\nPROCEDURES");
  if (iMed === -1 || iProc === -1 || iProc <= iMed) return text;
  return text.slice(iMed, iProc).trim();
}

function shouldDropLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (PHARM_DOSE_RE.test(t)) return false;
  if (MONITORING_START_RE.test(t)) return true;
  if (FLUID_START_RE.test(t) && /\bml\/h(?:r)?\b/i.test(t)) return true;
  if (/^\s*Time\s+/i.test(t)) return true;
  return false;
}

/** Merge "DrugName…" then next line "12.3 mg PO …" into one line (never glue monitoring/fluids to the next row). */
function mergeContinuations(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]!.trim();
    const next = lines[i + 1]?.trim() ?? "";
    const curIsNoiseLine =
      MONITORING_START_RE.test(cur) ||
      (FLUID_START_RE.test(cur) && /\bml\/h(?:r)?\b/i.test(cur)) ||
      /^\s*Time\s+/i.test(cur);
    if (
      next &&
      PHARM_DOSE_RE.test(next) &&
      !PHARM_DOSE_RE.test(cur) &&
      cur.length >= 3 &&
      !curIsNoiseLine
    ) {
      out.push(`${cur} ${next}`);
      i += 1;
      continue;
    }
    out.push(cur);
  }
  return out;
}

/** SmartFlow Flowsheet paste/PDF text — normalize, optional meds region, drop obvious non-med lines. */
export function preprocessFlowsheetText(raw: string): string {
  const normalized = normalizeRaw(String(raw ?? ""));
  const region = sliceMedicationsRegion(normalized);
  const rawLines = region.split("\n");
  const merged = mergeContinuations(rawLines.map((l) => l.trim()).filter(Boolean));
  const kept = merged.filter((l) => !shouldDropLine(l));
  return kept.join("\n\n");
}
