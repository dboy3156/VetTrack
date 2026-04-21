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

/** SmartFlow exports `File Number: ######` once per PDF; meds slice may drop it. Prepend digits so `extractRecordNumberHint` sees a chart #. */
function extractMedicalRecordIdFromFileNumber(fullText: string): string | null {
  const m = fullText.match(/\bFile\s*Number:\s*(\d{4,10})\b/i);
  return m?.[1] ?? null;
}

function prependRecordIdIfMissing(text: string, fileId: string): string {
  const t = text.trim();
  if (!t) return text;
  const firstLine = t.split("\n").find((l) => l.trim().length > 0)?.trim() ?? "";
  if (firstLine === fileId || firstLine.includes(fileId)) return text;
  /** Single `\n` keeps one `detectStructure` paragraph so chart id applies to med lines below. */
  return `${fileId}\n${t}`;
}

const PAGE_FOOTER_RE = /\n--\s*\d+\s+of\s+\d+\s+--/;

/**
 * SmartFlow PDFs often place `MEDICATIONS` and `PROCEDURES` as adjacent column headers; real drug rows
 * follow `PROCEDURES` until the `-- N of M --` page footer. Older exports keep meds strictly between
 * the two headers — when no page footer is found after PROCEDURES, fall back to that narrow window.
 */
function sliceMedicationsRegion(text: string): string {
  const u = text.toUpperCase();
  const chunks: string[] = [];
  let searchFrom = 0;

  while (true) {
    let iMed = u.indexOf("\nMEDICATIONS", searchFrom);
    if (iMed !== -1) iMed += 1;
    else if (searchFrom === 0 && u.startsWith("MEDICATIONS")) iMed = 0;
    else break;

    const iProc = u.indexOf("\nPROCEDURES", iMed + 1);
    if (iProc === -1 || iProc <= iMed) break;

    const afterProc = iProc + "\nPROCEDURES".length;
    const tail = text.slice(afterProc);
    const relFooter = tail.search(PAGE_FOOTER_RE);
    const iEnd = relFooter === -1 ? iProc : afterProc + relFooter;
    const chunk = text.slice(iMed, iEnd).trim();
    if (chunk.length > 0) chunks.push(chunk);
    searchFrom = iEnd > iMed ? iEnd : iMed + 1;
  }

  if (chunks.length === 0) return text;
  return chunks.join("\n\n");
}

function shouldDropLine(line: string): boolean {
  const t = line.trim();
  if (!t) return true;
  if (/^(MEDICATIONS|PROCEDURES)$/i.test(t)) return true;
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
  const fileId = extractMedicalRecordIdFromFileNumber(normalized);
  const region = sliceMedicationsRegion(normalized);
  const rawLines = region.split("\n");
  const merged = mergeContinuations(rawLines.map((l) => l.trim()).filter(Boolean));
  const kept = merged.filter((l) => !shouldDropLine(l));
  const joined = kept.join("\n\n");
  if (fileId) return prependRecordIdIfMissing(joined, fileId);
  return joined;
}
