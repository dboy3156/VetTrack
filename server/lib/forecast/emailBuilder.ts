import type { ForecastResult } from "./types.js";

/** Hebrew plaintext + minimal HTML for pharmacy ICU order email. */
export function buildPharmacyOrderEmail(params: {
  result: ForecastResult;
  technicianName: string;
  auditOrOrderHint?: string;
}): { subject: string; text: string; html: string } {
  const { result, technicianName } = params;
  const n = result.patients.length;
  const mode =
    result.weekendMode || result.windowHours === 72 ? "סוף שבוע" : "רגיל";
  const dayStr = new Date(result.parsedAt).toLocaleDateString("he-IL");

  const subject = `הזמנת תרופות ICU · ${n} מטופלים · ${result.windowHours}ש׳ (${mode}) · ${dayStr} · אישר/ה: ${technicianName}`;

  const lines: string[] = [];
  lines.push(subject);
  lines.push("");
  lines.push(`טכנאי/ית: ${technicianName}`);
  lines.push("");

  for (const p of [...result.patients].sort((a, b) =>
    a.recordNumber.localeCompare(b.recordNumber, undefined, { numeric: true }),
  )) {
    lines.push("---");
    lines.push(
      `${p.name} · ${p.recordNumber} · ${p.species}${p.breed ? ` · ${p.breed}` : ""}${p.sex ? ` · ${p.sex}` : ""}${p.color ? ` · ${p.color}` : ""} · ${p.weightKg} ק״ג`,
    );
    lines.push(
      `בעלים: ${p.ownerName}${p.ownerId ? ` · ת״ז ${p.ownerId}` : ""} · ${p.ownerPhone}`,
    );
    lines.push("");
    for (const d of p.drugs) {
      const qty =
        d.quantityUnits == null ? "ידני (PRN)" : String(d.quantityUnits);
      lines.push(
        `• ${d.drugName} (${d.type}) · ${qty} ${d.unitLabel} · ${d.route} · ${d.concentration}`,
      );
    }
    lines.push("");
  }

  if (params.auditOrOrderHint) {
    lines.push(`מזהה: ${params.auditOrOrderHint}`);
  }

  const text = lines.join("\n");

  const htmlParts: string[] = [`<pre dir="rtl" style="font-family:sans-serif">`];
  htmlParts.push(text.replace(/&/g, "&amp;").replace(/</g, "&lt;"));
  htmlParts.push(`</pre>`);
  const html = htmlParts.join("");

  return { subject, text, html };
}
