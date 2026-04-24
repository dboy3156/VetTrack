import type { ForecastResult } from "./types.js";
import { normalizeQuantityKey as nk } from "../../../src/shared/normalizeQuantityKey.js";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function hebrewFreq(n: number | null): string {
  if (n == null) return "—";
  const map: Record<number, string> = {
    1: "פעם ביום (SID)",
    2: "פעמיים ביום (BID)",
    3: "שלוש פעמים ביום (TID)",
    4: "ארבע פעמים ביום (QID)",
  };
  return map[n] ?? `${n} פעמים ב-24ש׳`;
}

function tdRow(label: string, val: string): string {
  return `<tr>
    <td style="color:#6b7280;width:42%;padding:3px 0;font-size:13px;vertical-align:top">${label}</td>
    <td style="padding:3px 0;font-size:13px">${val}</td>
  </tr>`;
}

export function buildPharmacyOrderEmail(params: {
  result: ForecastResult;
  technicianName: string;
  auditOrOrderHint?: string;
  auditTrace?: Record<string, { forecastedQty: number | null; onHandQty: number }>;
  patientWeightOverrides?: Record<string, number>;
}): { subject: string; text: string; html: string } {
  // ORIGINAL
  // export function buildPharmacyOrderEmail(params: {
  //   result: ForecastResult;
  //   technicianName: string;
  //   auditOrOrderHint?: string;
  //   auditTrace?: Record<string, { forecastedQty: number | null; onHandQty: number }>;
  //   patientWeightOverrides?: Record<string, number>;
  // }): { subject: string; text: string; html: string } {
  //   const {
  //     result,
  //     technicianName,
  //     auditTrace = {},
  //     patientWeightOverrides = {},
  //   } = params;
  //   const n = result.patients.length;
  //   const mode = result.weekendMode || result.windowHours === 72 ? "סוף שבוע" : "רגיל";
  //   const dayStr = new Date(result.parsedAt).toLocaleDateString("he-IL");
  //   const subject = `הזמנת תרופות ICU · ${n} מטופלים · ${result.windowHours}ש׳ (${mode}) · ${dayStr} · אישר/ה: ${technicianName}`;
  //   const sorted = [...result.patients].sort((a, b) =>
  //     a.recordNumber.localeCompare(b.recordNumber, undefined, { numeric: true }),
  //   );
  //   // ... full implementation preserved in git history; only parse-failure sections added below.
  // }
  const {
    result,
    technicianName,
    auditTrace = {},
    patientWeightOverrides = {},
  } = params;
  const n = result.patients.length;
  const mode = result.weekendMode || result.windowHours === 72 ? "סוף שבוע" : "רגיל";
  const dayStr = new Date(result.parsedAt).toLocaleDateString("he-IL");

  const subject = `הזמנת תרופות ICU · ${n} מטופלים · ${result.windowHours}ש׳ (${mode}) · ${dayStr} · אישר/ה: ${technicianName}`;

  const sorted = [...result.patients].sort((a, b) =>
    a.recordNumber.localeCompare(b.recordNumber, undefined, { numeric: true }),
  );

  // ── Plain text ──────────────────────────────────────────────────────────────
  const lines: string[] = [
    subject, "",
    `טכנאי/ית: ${technicianName}`,
    `תאריך: ${dayStr}  |  חלון: ${result.windowHours}ש׳ (${mode})`,
  ];
  if (params.auditOrOrderHint) lines.push(`מזהה: ${params.auditOrOrderHint}`);
  lines.push("");
  if (result.parseFailures && result.parseFailures.length > 0) {
    lines.push("קבצים שלא פוענחו:");
    for (const failure of result.parseFailures) {
      lines.push(`• ${failure.fileName} — ${failure.message}`);
    }
    lines.push("");
  }

  for (const p of sorted) {
    const wt = patientWeightOverrides[p.recordNumber] ?? p.weightKg;
    lines.push("─────────────────────────────────");
    lines.push(`${p.name}  ·  מס׳ תיק: ${p.recordNumber}  ·  ${p.species} ${p.breed}  ·  ${wt} ק״ג`);
    if (p.ownerName || p.ownerPhone)
      lines.push(`בעלים: ${p.ownerName}${p.ownerPhone ? `  |  ${p.ownerPhone}` : ""}`);
    lines.push("");
    if (p.flags.includes("PATIENT_UNKNOWN")) lines.push("⚠ זיהוי מטופל לא מלא.");
    if (p.flags.includes("WEIGHT_UNKNOWN")) lines.push(`⚠ משקל מוגדר ידנית: ${wt} ק״ג.`);
    if (p.flags.includes("ALL_DRUGS_EXCLUDED")) lines.push("⚠ כל התרופות סוננו.");
    p.drugs.forEach((d, i) => {
      const key = nk(p.recordNumber, d.drugName);
      const tr = auditTrace[key];
      const qty = d.quantityUnits ?? 0;
      const trace = tr ? `  (חזוי: ${tr.forecastedQty ?? "—"} · קיים בתא: ${tr.onHandQty})` : "";
      const admins = d.administrationsInWindow;
      const perAdmin = admins && admins > 0 ? `${Math.ceil(qty / admins)} ${d.unitLabel}` : "—";
      lines.push(`${i + 1}. ${d.drugName} — ${d.concentration} · ${d.unitLabel}`);
      lines.push(`   כמות כוללת: ${qty} ${d.unitLabel}${trace}`);
      lines.push(`   מינון בכל מתן: ${perAdmin}  ·  מסלול: ${d.route || "—"}  ·  תדירות: ${hebrewFreq(d.administrationsPer24h)}  ·  משך: ${result.windowHours}ש׳`);
      lines.push("");
    });
  }
  lines.push(`הוכן ע״י: ${technicianName}  ·  ${dayStr}  ·  חלון: ${result.windowHours}ש׳`);
  const text = lines.join("\n");

  // ── HTML ─────────────────────────────────────────────────────────────────────
  const patientSections = sorted.map((p) => {
    const wt = patientWeightOverrides[p.recordNumber] ?? p.weightKg;

    const warnings: string[] = [];
    if (p.flags.includes("PATIENT_UNKNOWN"))
      warnings.push(`<div style="color:#c0392b;margin-bottom:5px">⚠ זיהוי מטופל לא מלא — אמתו מול התיק הקליני.</div>`);
    if (p.flags.includes("WEIGHT_UNKNOWN"))
      warnings.push(`<div style="color:#e67e22;margin-bottom:5px">⚠ משקל מוגדר ידנית: ${esc(String(wt))} ק״ג.</div>`);
    if (p.flags.includes("ALL_DRUGS_EXCLUDED"))
      warnings.push(`<div style="color:#c0392b;margin-bottom:5px">⚠ כל שורות התרופות סוננו — אין פריטים לבקשה.</div>`);

    const drugCards = p.drugs.map((d, idx) => {
      const key = nk(p.recordNumber, d.drugName);
      const tr = auditTrace[key];
      const qty = d.quantityUnits ?? 0;
      const tracePart = tr
        ? ` <span style="color:#6b7280;font-size:12px">(חזוי: ${tr.forecastedQty ?? "—"} · קיים בתא: ${tr.onHandQty})</span>`
        : "";
      const admins = d.administrationsInWindow;
      const perAdmin = admins && admins > 0 ? `${Math.ceil(qty / admins)} ${esc(d.unitLabel)}` : "—";

      return `
      <div style="border:1px solid #d1d5db;border-radius:6px;padding:10px 14px;margin-bottom:8px">
        <div style="font-weight:700;font-size:14px;margin-bottom:6px;color:#1a3a6b">${idx + 1}. ${esc(d.drugName)}</div>
        <table style="width:100%;border-collapse:collapse">
          ${tdRow("שם / עוצמה / צורה", `${esc(d.drugName)} ${esc(d.concentration)} · ${esc(d.unitLabel)}`)}
          ${tdRow("כמות כוללת להספקה", `<strong>${qty} ${esc(d.unitLabel)}</strong>${tracePart}`)}
          ${tdRow("מינון בכל מתן", perAdmin)}
          ${tdRow("מסלול מתן", esc(d.route || "—"))}
          ${tdRow("תדירות", esc(hebrewFreq(d.administrationsPer24h)))}
          ${tdRow("משך טיפול", `${result.windowHours} שעות`)}
        </table>
      </div>`;
    }).join("\n");

    return `
    <div style="margin-bottom:28px;border:1px solid #ddd;border-radius:8px;overflow:hidden">
      <div style="background:#1a3a6b;color:#fff;padding:10px 16px">
        <span style="font-size:16px;font-weight:bold">${esc(p.name)}</span>
        <span style="margin-right:10px;opacity:.85;font-size:13px">מס׳ תיק: ${esc(p.recordNumber)}</span>
        <span style="opacity:.75;font-size:13px">${esc(p.species)} ${esc(p.breed)}</span>
      </div>
      <div style="padding:8px 16px;background:#f7f9fc;border-bottom:1px solid #ddd;font-size:13px;color:#444" dir="rtl">
        <div>${esc(String(wt))} ק״ג${p.sex ? `  ·  ${esc(p.sex)}` : ""}${p.age ? `  ·  גיל: ${esc(p.age)}` : ""}</div>
        ${(p.ownerName || p.ownerPhone)
          ? `<div style="margin-top:3px">בעלים: <strong>${esc(p.ownerName)}</strong>${p.ownerPhone ? `  |  ${esc(p.ownerPhone)}` : ""}</div>`
          : ""}
      </div>
      ${warnings.length ? `<div style="padding:8px 16px;background:#fff8f0;border-bottom:1px solid #fce4b0">${warnings.join("")}</div>` : ""}
      <div style="padding:12px 16px" dir="rtl">
        <div style="font-weight:600;font-size:13px;color:#374151;margin-bottom:8px">תרופות להזמנה</div>
        ${p.drugs.length > 0 ? drugCards : `<div style="color:#888;font-size:13px">אין תרופות</div>`}
      </div>
    </div>`;
  }).join("\n");

  const parseFailuresSection =
    result.parseFailures && result.parseFailures.length > 0
      ? `
    <div style="margin:0 0 20px;border:1px solid #f59e0b;border-radius:8px;overflow:hidden">
      <div style="background:#fef3c7;color:#92400e;padding:10px 16px;font-size:14px;font-weight:700">
        קבצים שלא פוענחו
      </div>
      <div style="padding:12px 16px;background:#fffbeb" dir="rtl">
        ${result.parseFailures
          .map((failure) => `<div style="font-size:13px;color:#92400e;margin-bottom:6px"><strong>${esc(failure.fileName)}</strong> — ${esc(failure.message)}</div>`)
          .join("")}
      </div>
    </div>`
      : "";

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#f0f2f5;font-family:Arial,'Segoe UI',sans-serif;direction:rtl">
  <div style="max-width:720px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)">
    <div style="background:#1a3a6b;color:#fff;padding:20px 24px">
      <div style="font-size:20px;font-weight:bold;margin-bottom:4px">🏥 הזמנת תרופות ICU</div>
      <div style="opacity:.85;font-size:14px">${esc(dayStr)}  ·  חלון: ${result.windowHours}ש׳ (${esc(mode)})  ·  ${n} מטופלים</div>
    </div>
    <div style="background:#2c5282;color:#e2e8f0;padding:10px 24px;font-size:13px;display:flex;justify-content:space-between">
      <span>הוכן ע״י: <strong>${esc(technicianName)}</strong></span>
      ${params.auditOrOrderHint ? `<span style="opacity:.75">מזהה: ${esc(params.auditOrOrderHint)}</span>` : ""}
    </div>
    <div style="padding:16px 24px">${parseFailuresSection}${patientSections}</div>
    <div style="background:#f7f9fc;border-top:1px solid #e2e8f0;padding:12px 24px;font-size:12px;color:#888;text-align:center">
      נוצר אוטומטית על ידי VetTrack · ICU Pharmacy Forecast · ${esc(dayStr)}
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
