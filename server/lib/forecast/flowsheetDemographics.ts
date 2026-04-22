/**
 * Extract patient identity from SmartFlow / ward PDF text so pharmacy forecast does not depend on vt_animals.
 * Hebrew and Latin labels are supported.
 */

export interface PdfPatientDemographics {
  recordNumber: string | null;
  name: string;
  species: string;
  breed: string;
  sex: string;
  /** e.g. "4 years" when the flowsheet uses `Age: …` on the same line. */
  age: string;
  color: string;
  weightKg: number | null;
  /** True when weight came from the first bare `… kg` match (may be CRI denominator), not `Weight: … kg`. */
  weightUncertain: boolean;
  ownerName: string;
  ownerPhone: string;
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
}

/**
 * PDF text extractors often emit Hebrew words in visual (right-to-left) order,
 * so "שון" comes out as "ןוש". If every token is purely Hebrew script,
 * reverse character order within each space-separated word.
 */
function fixHebrewVisualOrder(s: string): string {
  const trimmed = s.trim();
  if (!trimmed) return s;
  // Only apply when every word token is entirely Hebrew letters / common Hebrew punctuation
  const tokens = trimmed.split(/\s+/);
  if (!tokens.every((t) => /^[\u05D0-\u05EA\u05F0-\u05F4\uFB1D-\uFB4E׳'"]+$/.test(t))) return s;
  return tokens.map((t) => t.split("").reverse().join("")).join(" ");
}

/**
 * True when we have chart identity from the header block and/or a record # parsed from the med block header.
 */
export function hasPdfIdentity(
  p: PdfPatientDemographics | null,
  recordFromParsedBlock?: string | null,
): boolean {
  const fromRecBlock = Boolean(recordFromParsedBlock?.trim());
  if (!p) return fromRecBlock;
  const fromLabel = Boolean(p.recordNumber?.trim() || p.name?.trim());
  return fromLabel || fromRecBlock;
}

/**
 * Best-effort extraction from full document text (run on raw PDF extract before meds-only preprocess).
 */
export function extractPdfPatientDemographics(rawText: string): PdfPatientDemographics {
  const n = normalize(String(rawText ?? ""));
  const head = n.slice(0, 25_000);

  const recordNumber = head.match(/\bFile\s*Number:\s*(\d{4,10})\b/i)?.[1] ?? null;

  let weightKg: number | null = null;
  let weightUncertain = false;
  const labeled = head.match(/\bWeight[:\s]+(\d+(?:\.\d+)?)\s*kg\b/i);
  if (labeled) {
    const v = Number.parseFloat(labeled[1]!);
    if (v > 0.05 && v < 250) weightKg = v;
  } else {
    for (const m of head.matchAll(/\b(\d+(?:\.\d+)?)\s*kg\b/gi)) {
      const v = Number.parseFloat(m[1]!);
      if (v > 0.05 && v < 250) {
        weightKg = v;
        weightUncertain = true;
        break;
      }
    }
  }

  let species = "";
  let breed = "";
  let sex = "";
  const speciesLine = head.match(
    /\b(Canine|Feline|Felis catus|Cat|Dog)\b\s*-\s*([^-\n]+?)\s*-\s*([MFS])\b/i,
  );
  if (speciesLine) {
    species = speciesLine[1]!.trim();
    breed = speciesLine[2]!.trim();
    sex = speciesLine[3]!.trim();
  }

  let color = "";
  const colorM = head.match(/\bColou?r:\s*([^\n]+)/i);
  if (colorM) {
    const c = colorM[1]!.trim();
    if (c.length < 80) color = c;
  }

  let age = "";
  const ageM = head.match(/\bAge:\s*([^\n]+)/i);
  if (ageM) {
    const a = ageM[1]!.trim();
    if (a.length < 80) age = a;
  }

  // SmartFlow sometimes emits "Age:\n<color>" with no age value — the next line is actually the color.
  // Detect: age looks like a color word and color is still empty → swap.
  const COLOR_WORDS = /^(?:white|black|brown|grey|gray|cream|tan|red|orange|yellow|blue|golden|chocolate|silver|tricolor|tri-color|brindle|spotted|tabby|calico)\b/i;
  if (age && COLOR_WORDS.test(age) && !color) {
    color = age;
    age = "";
  }

  let name = "";
  const parenName = head.match(/\(\s*[^)]+\)\s*([^\n]+)/);
  if (parenName) {
    const candidate = parenName[1]!.trim().replace(/\s*\d+(?:\.\d+)?\s*kg.*$/i, "").trim();
    name = fixHebrewVisualOrder(candidate);
  }
  if (!name) {
    const hebLine = head.match(/\n\s*([א-ת][א-ת׳'\s]{1,48})\s*\n\s*\d+(?:\.\d+)?\s*kg\b/i);
    if (hebLine) name = fixHebrewVisualOrder(hebLine[1]!.trim());
  }

  let ownerName = "";
  let ownerPhone = "";
  const clientIdx = head.search(/\bCLIENT\b/i);
  if (clientIdx !== -1) {
    const chunk = head.slice(clientIdx, clientIdx + 1200);
    const beforeGen = chunk.split(/\bGENERAL INFO\b/i)[0] ?? chunk;
    for (const m of beforeGen.matchAll(/Tel:\s*([^\n]*)/gi)) {
      const t = m[1]!.trim();
      if (t && t !== "--" && /\d/.test(t)) {
        ownerPhone = t;
        break;
      }
    }
    const lines = beforeGen.split("\n").map((l) => l.trim());
    for (const line of lines) {
      if (!line || /^CLIENT$/i.test(line)) continue;
      if (/^Tel:/i.test(line)) continue;
      if (/[\u0590-\u05FF]{2,}/.test(line) && line.length < 120) {
        ownerName = line;
        break;
      }
    }
  }

  return {
    recordNumber,
    name,
    species,
    breed,
    sex,
    age,
    color,
    weightKg,
    weightUncertain,
    ownerName,
    ownerPhone,
  };
}
