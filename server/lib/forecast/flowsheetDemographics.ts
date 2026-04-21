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
  color: string;
  weightKg: number | null;
  ownerName: string;
  ownerPhone: string;
}

function normalize(s: string): string {
  return s.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ");
}

/** True when we have at least file # or patient name from the PDF. */
export function hasPdfIdentity(p: PdfPatientDemographics | null): boolean {
  if (!p) return false;
  return Boolean(p.recordNumber?.trim()) || Boolean(p.name?.trim());
}

/**
 * Best-effort extraction from full document text (run on raw PDF extract before meds-only preprocess).
 */
export function extractPdfPatientDemographics(rawText: string): PdfPatientDemographics {
  const n = normalize(String(rawText ?? ""));
  const head = n.slice(0, 25_000);

  const recordNumber = head.match(/\bFile\s*Number:\s*(\d{4,10})\b/i)?.[1] ?? null;

  let weightKg: number | null = null;
  for (const m of head.matchAll(/\b(\d+(?:\.\d+)?)\s*kg\b/gi)) {
    const v = Number.parseFloat(m[1]!);
    if (v > 0.05 && v < 250) {
      weightKg = v;
      break;
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
  const colorM = head.match(/\bAge:\s*\n\s*([^\n]+)/i);
  if (colorM) {
    const c = colorM[1]!.trim();
    if (c.length < 80 && !/^\d/.test(c)) color = c;
  }

  let name = "";
  const parenName = head.match(/\(\s*[^)]+\)\s*([^\n]+)/);
  if (parenName) {
    name = parenName[1]!.trim().replace(/\s*3\.\d+\s*kg.*$/i, "").trim();
  }
  if (!name) {
    const hebLine = head.match(/\n\s*([א-ת][א-ת׳'\s]{1,48})\s*\n\s*\d+(?:\.\d+)?\s*kg\b/i);
    if (hebLine) name = hebLine[1]!.trim();
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
    color,
    weightKg,
    ownerName,
    ownerPhone,
  };
}
