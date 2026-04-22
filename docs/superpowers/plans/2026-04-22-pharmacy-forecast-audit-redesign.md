# Pharmacy Forecast Audit Step & UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add correct unit labels, patient warning resolution, email format redesign, and a pre-submission audit step (Parse → Audit → Send) to the pharmacy forecast feature.

**Architecture:** All audit state is client-side React and feeds into the existing `manualQty` mechanism — no new DB tables. Audit-adjusted quantities are passed to the server as `manualQuantities` in the existing approve payload, extended with `auditTrace` for email display. The email is redesigned from a shared drug table to per-medication prescription cards.

**Tech Stack:** React + TypeScript (SPA), Express (API), Drizzle ORM, Vitest (tests), Hebrew RTL email HTML.

---

## File Map

| File | Change |
|---|---|
| `shared/drug-formulary-seed.ts` | Add `unitType?` to interface; annotate seed entries |
| `server/lib/formulary-seed-sync.ts` | Remove unitType from extension guard; add to insert/update |
| `src/types/index.ts` | Add `AuditState`, `PatientAuditState`, `DrugAuditEntry`; extend `ForecastApprovePayload` |
| `server/lib/forecast/types.ts` | Same additions on the server types side |
| `server/lib/forecast/emailBuilder.ts` | Rewrite to per-medication sections; accept `auditTrace` + `patientWeightOverrides` |
| `server/lib/forecast/forecastZod.ts` | Extend `approvePayloadSchema` with new optional fields |
| `server/routes/forecast.ts` | Pass `auditTrace`/`patientWeightOverrides` to `buildPharmacyOrderEmail` |
| `src/lib/api.ts` | Update `approve` payload type |
| `src/pages/pharmacy-forecast.tsx` | Add Audit tab, `AuditState`, gate logic, audit→manualQty wiring |
| `locales/he.json` + `locales/en.json` | New audit tab i18n keys |
| `tests/formulary-seed-sync.test.ts` | New — unit tests for unitType sync |
| `tests/forecast-email-builder.test.ts` | New — unit tests for redesigned email builder |

---

### Task 1: Formulary unitType — seed interface + sync logic

**Context:** `FormularyDrugRow.unitType` exists in the DB and `forecastEngine.ts` already reads it (`"vial"` → "בקבוקונים", `"tablet"` → "טבליות", `"bag"` → "שקיות", null → "אמפולות"). The seed interface lacks `unitType?`, so inserts/updates never set it. Additionally, `activeRowEligibleForSeedSync` guards `row.unitType != null → skip`, blocking seed updates from ever setting the field. We remove that guard.

**Files:**
- Modify: `shared/drug-formulary-seed.ts`
- Modify: `server/lib/formulary-seed-sync.ts`
- Create: `tests/formulary-seed-sync.test.ts`

- [ ] **Step 1.1: Write failing tests**

Create `tests/formulary-seed-sync.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  activeRowEligibleForSeedSync,
  seedEntryToColumns,
  seedRowMatchesSeedEntry,
} from "../server/lib/formulary-seed-sync.js";
import type { SeededDrugFormularyEntry } from "../shared/drug-formulary-seed.js";

const baseEntry: SeededDrugFormularyEntry = {
  name: "Butorphanol",
  genericName: "Butorphanol",
  concentrationMgMl: 10,
  standardDose: 0.25,
  minDose: 0.1,
  maxDose: 0.4,
  doseUnit: "mg_per_kg",
  defaultRoute: "IV/IM/SC",
  unitType: "vial",
};

function makeRow(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  const base = seedEntryToColumns(baseEntry, "clinic-1", now);
  return { ...base, createdAt: now, updatedAt: now, deletedAt: null, ...overrides } as typeof base;
}

describe("seedEntryToColumns", () => {
  it("includes unitType from entry", () => {
    const cols = seedEntryToColumns(baseEntry, "clinic-1", new Date());
    expect(cols.unitType).toBe("vial");
  });

  it("uses null when entry has no unitType", () => {
    const { unitType: _u, ...noUnit } = baseEntry;
    const cols = seedEntryToColumns(noUnit as SeededDrugFormularyEntry, "clinic-1", new Date());
    expect(cols.unitType).toBeNull();
  });
});

describe("activeRowEligibleForSeedSync", () => {
  it("is eligible when row.unitType matches seed", () => {
    const row = makeRow({ unitType: "vial" });
    expect(activeRowEligibleForSeedSync(row, baseEntry)).toBe(true);
  });

  it("is eligible when row.unitType is null (will be updated)", () => {
    const row = makeRow({ unitType: null });
    expect(activeRowEligibleForSeedSync(row, baseEntry)).toBe(true);
  });

  it("is NOT eligible when unitVolumeMl set (pharmacy extension)", () => {
    const row = makeRow({ unitType: "vial", unitVolumeMl: "5" });
    expect(activeRowEligibleForSeedSync(row, baseEntry)).toBe(false);
  });
});

describe("seedRowMatchesSeedEntry", () => {
  it("returns false when unitType differs from seed", () => {
    const row = makeRow({ unitType: null });
    expect(seedRowMatchesSeedEntry(row, baseEntry)).toBe(false);
  });

  it("returns true when unitType matches seed", () => {
    const row = makeRow({ unitType: "vial" });
    expect(seedRowMatchesSeedEntry(row, baseEntry)).toBe(true);
  });
});
```

- [ ] **Step 1.2: Run tests — expect failures**

```bash
npx vitest run tests/formulary-seed-sync.test.ts
```

Expected: several failures (unitType not yet in interface or functions).

- [ ] **Step 1.3: Add `unitType?` to `SeededDrugFormularyEntry` interface**

In `shared/drug-formulary-seed.ts`, add after `defaultRoute?`:

```typescript
/** Physical packaging unit type — drives unit label in forecast output and email.
 *  Leave undefined for ampoules (engine defaults to "אמפולות").
 *  Values: "vial" | "tablet" | "capsule" | "bag" | "syringe" */
unitType?: string;
```

- [ ] **Step 1.4: Annotate seed entries with correct unitType**

In the `SEEDED_FORMULARY` array in `shared/drug-formulary-seed.ts`, add `unitType` to these entries (all other fields stay unchanged — only add the field):

```
// Sedation/Anesthesia
Propofol          → unitType: "vial"
Ketamine          → unitType: "vial"
Dexmedetomidine   → unitType: "vial"
Acepromazine      → unitType: "vial"

// Opioids
Butorphanol       → unitType: "vial"

// Oral Analgesics/Behavioral
Trazodone         → unitType: "tablet"
Gabapentin        → unitType: "capsule"

// Cardiac
Amlodipine        → unitType: "tablet"
Pimobendan        → unitType: "tablet"
Digoxin           → unitType: "tablet"

// Vasopressors/CRI
Dobutamine        → unitType: "bag"
Dopamine          → unitType: "bag"
Norepinephrine    → unitType: "bag"

// Steroids
Prednisolone      → unitType: "tablet"
Prednisone        → unitType: "tablet"

// Antibiotics
Augmentin 5% 50mg/ml → unitType: "vial"
Ceftriaxone       → unitType: "vial"
Cisapride tab 2.5 → unitType: "tablet"

// Anti-emetics/GI
Maropitant (the injectable one, brandNames: ["Cerenia"]) → unitType: "vial"
Pantoprazole      → unitType: "vial"
Omeprazole        → unitType: "tablet"
Sucralfate        → unitType: "tablet"
Mirtazapine       → unitType: "tablet"

// Neurological
Mannitol          → unitType: "bag"

// Endocrine
Insulin Regular   → unitType: "vial"
Levothyroxine     → unitType: "tablet"
```

- [ ] **Step 1.5: Update `formulary-seed-sync.ts` — three changes**

**Change 1:** Remove `unitType` from the pharmacy-extension guard in `activeRowEligibleForSeedSync`:
```typescript
// Before:
if (row.unitVolumeMl != null || row.unitType != null || row.criBufferPct != null) return false;
// After:
if (row.unitVolumeMl != null || row.criBufferPct != null) return false;
```

**Change 2:** Add `unitType: entry.unitType ?? null` to `seedEntryToColumns` return object (after `defaultRoute`):
```typescript
unitType: entry.unitType ?? null,
```

**Change 3:** Add `unitType` to both `seedRowMatchesSeedEntry` and the UPDATE `.set({})`:

In `seedRowMatchesSeedEntry`, add before `return true`:
```typescript
if (!nullableStringsEqual(row.unitType, entry.unitType ?? null)) return false;
```

In the UPDATE `.set({})` block, add after `defaultRoute`:
```typescript
unitType: entry.unitType ?? null,
```

- [ ] **Step 1.6: Run tests — expect all pass**

```bash
npx vitest run tests/formulary-seed-sync.test.ts
```

Expected: 5/5 pass.

- [ ] **Step 1.7: Run seed sync against dev DB**

```bash
npx tsx scripts/sync-formulary-seed-all-clinics.ts
```

Expected: prints `"updated": N` for each clinic, no errors.

- [ ] **Step 1.8: Commit**

```bash
git add shared/drug-formulary-seed.ts server/lib/formulary-seed-sync.ts tests/formulary-seed-sync.test.ts
git commit -m "feat(formulary): add unitType to seed interface and sync to DB"
```

---

### Task 2: Type additions

**Files:**
- Modify: `src/types/index.ts`
- Modify: `server/lib/forecast/types.ts`

- [ ] **Step 2.1: Add audit types to `server/lib/forecast/types.ts`**

Append after the `ApproveResult` interface:

```typescript
export interface DrugAuditEntry {
  forecastedQty: number | null;
  onHandQty: number;
  orderQty: number;
  confirmed: boolean;
}

export interface PatientAuditState {
  recordNumber: string;
  warningAcknowledgements: Record<string, boolean>;
  weightOverride: number | null;
  patientNameOverride: string | null;
  /** keyed by drug.drugName */
  drugs: Record<string, DrugAuditEntry>;
}

export interface AuditState {
  forecastRunId: string;
  patients: Record<string, PatientAuditState>;
}
```

Also extend `ApprovePayload`:
```typescript
export interface ApprovePayload {
  parseId: string;
  manualQuantities: Record<string, number>;
  pharmacistDoseAcks?: string[];
  /** normalizeQuantityKey(recordNumber, drugName) → trace for email display */
  auditTrace?: Record<string, { forecastedQty: number | null; onHandQty: number }>;
  /** recordNumber → corrected weight kg */
  patientWeightOverrides?: Record<string, number>;
}
```

- [ ] **Step 2.2: Add same types to `src/types/index.ts`**

Find the `ForecastApproveResponse` interface. Add the same `DrugAuditEntry`, `PatientAuditState`, `AuditState` interfaces nearby. Also add:

```typescript
export interface ForecastApprovePayload {
  parseId: string;
  manualQuantities: Record<string, number>;
  pharmacistDoseAcks: string[];
  auditTrace?: Record<string, { forecastedQty: number | null; onHandQty: number }>;
  patientWeightOverrides?: Record<string, number>;
}
```

- [ ] **Step 2.3: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.json && npx tsc --noEmit -p tsconfig.server-check.json
```

Expected: 0 errors.

- [ ] **Step 2.4: Commit**

```bash
git add src/types/index.ts server/lib/forecast/types.ts
git commit -m "feat(forecast): add AuditState types, extend ApprovePayload with auditTrace"
```

---

### Task 3: Redesign emailBuilder

**Files:**
- Modify: `server/lib/forecast/emailBuilder.ts`
- Create: `tests/forecast-email-builder.test.ts`

- [ ] **Step 3.1: Write failing tests**

Create `tests/forecast-email-builder.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { buildPharmacyOrderEmail } from "../server/lib/forecast/emailBuilder.js";
import type { ForecastResult } from "../server/lib/forecast/types.js";

const result: ForecastResult = {
  parsedAt: new Date().toISOString(),
  windowHours: 24,
  weekendMode: false,
  totalFlags: 0,
  patients: [{
    recordNumber: "361848", name: "שון", species: "Canine", breed: "Mixed",
    sex: "M", age: "", color: "", weightKg: 3.9,
    ownerName: "ישראל ישראלי", ownerId: "", ownerPhone: "050-1234567",
    flags: [],
    drugs: [{
      drugName: "Famotidine", type: "regular", quantityUnits: 3,
      unitLabel: "אמפולות", concentration: "10 mg/mL", packDescription: "",
      route: "IV", flags: [], administrationsPer24h: 1, administrationsInWindow: 1,
    }],
  }],
};

describe("buildPharmacyOrderEmail", () => {
  it("HTML contains drug name in per-section heading", () => {
    const { html } = buildPharmacyOrderEmail({ result, technicianName: "שרה" });
    expect(html).toContain("Famotidine");
  });

  it("HTML does not use <thead> drug table (old format gone)", () => {
    const { html } = buildPharmacyOrderEmail({ result, technicianName: "שרה" });
    expect(html).not.toContain("<thead>");
  });

  it("HTML shows owner phone", () => {
    const { html } = buildPharmacyOrderEmail({ result, technicianName: "שרה" });
    expect(html).toContain("050-1234567");
  });

  it("shows audit trace when provided", () => {
    const { html } = buildPharmacyOrderEmail({
      result, technicianName: "שרה",
      auditTrace: { "361848__famotidine": { forecastedQty: 4, onHandQty: 1 } },
    });
    expect(html).toContain("חזוי: 4");
    expect(html).toContain("קיים בתא: 1");
  });

  it("uses patientWeightOverride in patient header", () => {
    const { html } = buildPharmacyOrderEmail({
      result, technicianName: "שרה",
      patientWeightOverrides: { "361848": 5.2 },
    });
    expect(html).toContain("5.2");
  });

  it("plain text contains drug name and qty", () => {
    const { text } = buildPharmacyOrderEmail({ result, technicianName: "שרה" });
    expect(text).toContain("Famotidine");
    expect(text).toContain("3");
  });
});
```

- [ ] **Step 3.2: Run — expect failures**

```bash
npx vitest run tests/forecast-email-builder.test.ts
```

Expected: `<thead>` test fails (current format has table), audit trace tests fail.

- [ ] **Step 3.3: Replace emailBuilder.ts**

Overwrite `server/lib/forecast/emailBuilder.ts` with:

```typescript
import type { ForecastResult } from "./types.js";

/** Must match src/shared/normalizeQuantityKey.ts exactly. */
function nk(recordNumber: string, drugName: string): string {
  return `${String(recordNumber).trim()}__${drugName.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

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
    <div style="padding:16px 24px">${patientSections}</div>
    <div style="background:#f7f9fc;border-top:1px solid #e2e8f0;padding:12px 24px;font-size:12px;color:#888;text-align:center">
      נוצר אוטומטית על ידי VetTrack · ICU Pharmacy Forecast · ${esc(dayStr)}
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}
```

- [ ] **Step 3.4: Run tests — expect pass**

```bash
npx vitest run tests/forecast-email-builder.test.ts
```

Expected: 6/6 pass.

- [ ] **Step 3.5: Commit**

```bash
git add server/lib/forecast/emailBuilder.ts tests/forecast-email-builder.test.ts
git commit -m "feat(email): per-medication prescription sections with audit trace"
```

---

### Task 4: Server approve route — accept auditTrace

**Files:**
- Modify: `server/lib/forecast/forecastZod.ts`
- Modify: `server/routes/forecast.ts`

- [ ] **Step 4.1: Read forecastZod.ts**

```bash
cat server/lib/forecast/forecastZod.ts
```

Locate `approvePayloadSchema` and note its current shape.

- [ ] **Step 4.2: Extend approvePayloadSchema**

In `forecastZod.ts`, add two optional fields to `approvePayloadSchema` (keep all existing fields):

```typescript
auditTrace: z.record(
  z.string(),
  z.object({ forecastedQty: z.number().nullable(), onHandQty: z.number().int().min(0) }),
).optional(),
patientWeightOverrides: z.record(z.string(), z.number().positive()).optional(),
```

- [ ] **Step 4.3: Pass new fields to buildPharmacyOrderEmail in forecast.ts**

In `server/routes/forecast.ts`, find the call to `buildPharmacyOrderEmail` inside the approve handler. Add the two new fields:

```typescript
const { subject, text, html } = buildPharmacyOrderEmail({
  result: mergedResult,
  technicianName: authUser.name || authUser.email || "",
  auditOrOrderHint: orderId,
  auditTrace: parsed.data.auditTrace,
  patientWeightOverrides: parsed.data.patientWeightOverrides,
});
```

(`parsed.data` is the Zod-validated approve body — check the variable name in the actual handler.)

- [ ] **Step 4.4: Verify compile**

```bash
npx tsc --noEmit -p tsconfig.server-check.json
```

Expected: 0 errors.

- [ ] **Step 4.5: Commit**

```bash
git add server/lib/forecast/forecastZod.ts server/routes/forecast.ts
git commit -m "feat(forecast): extend approve route with auditTrace and weight overrides"
```

---

### Task 5: i18n strings

**Files:**
- Modify: `locales/he.json`
- Modify: `locales/en.json`

- [ ] **Step 5.1: Add keys to he.json**

Inside the `"pharmacyForecast"` object (after `"tabEmail"`):

```json
"tabAudit": "ביקורת",
"auditWarningsTitle": "אזהרות מטופל — יש לאשר לפני שליחה",
"auditWeightLabel": "הכנס משקל מתוקן (ק״ג):",
"auditWeightPlaceholder": "ק״ג",
"auditAckLabel": "אישרתי ולקחתי בחשבון",
"auditForecasted": "חזוי",
"auditOnHand": "קיים בתא",
"auditOrder": "להזמין",
"auditConfirmed": "אושר",
"auditGenerateEmail": "הכן מייל הזמנה",
"auditTabLocked": "נעול עד השלמת ביקורת"
```

- [ ] **Step 5.2: Add keys to en.json**

Inside `"pharmacyForecast"`:

```json
"tabAudit": "Audit",
"auditWarningsTitle": "Patient warnings — must resolve before sending",
"auditWeightLabel": "Enter corrected weight (kg):",
"auditWeightPlaceholder": "kg",
"auditAckLabel": "I acknowledge and accept this",
"auditForecasted": "Forecasted",
"auditOnHand": "On hand",
"auditOrder": "To order",
"auditConfirmed": "Confirmed",
"auditGenerateEmail": "Generate Order Email",
"auditTabLocked": "Locked until audit complete"
```

- [ ] **Step 5.3: Verify TS compile**

```bash
npx tsc --noEmit -p tsconfig.json
```

- [ ] **Step 5.4: Commit**

```bash
git add locales/he.json locales/en.json
git commit -m "feat(i18n): add audit tab strings to pharmacy forecast"
```

---

### Task 6: Audit tab — pharmacy-forecast.tsx

**Key design decisions:**
- `WEIGHT_UNKNOWN`: entering a non-zero weight resolves the warning; drug quantities are NOT auto-recalculated (technician adjusts via on-hand inputs). The corrected weight is passed to the email as `patientWeightOverrides`.
- On "Generate Order Email": `manualQty` is populated from `auditState.patients[*].drugs[*].orderQty`, then the email tab opens.
- Email tab trigger is disabled (`disabled` prop on `TabsTrigger`) until `auditComplete`.
- `Checkbox` is already available in the project at `@/components/ui/checkbox`.

**Files:**
- Modify: `src/pages/pharmacy-forecast.tsx`
- Modify: `src/lib/api.ts`

- [ ] **Step 6.1: Update api.ts approve signature**

Find `approve:` inside `forecast` in `src/lib/api.ts`. Update its body parameter type to include the new optional fields:

```typescript
approve: (body: {
  parseId: string;
  manualQuantities: Record<string, number>;
  pharmacistDoseAcks: string[];
  auditTrace?: Record<string, { forecastedQty: number | null; onHandQty: number }>;
  patientWeightOverrides?: Record<string, number>;
}) =>
  request<ForecastApproveResponse>("/api/forecast/approve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }),
```

- [ ] **Step 6.2: Add imports and helpers at top of pharmacy-forecast.tsx**

Add to the import list:

```typescript
import type { AuditState, PatientAuditState, DrugAuditEntry } from "@/types";
import { Checkbox } from "@/components/ui/checkbox";
```

After the closing brace of `buildEmailPreviewBody`, add these helpers:

```typescript
const PATIENT_WARNING_FLAGS = [
  "PATIENT_UNKNOWN",
  "WEIGHT_UNKNOWN",
  "WEIGHT_UNCERTAIN",
  "ALL_DRUGS_EXCLUDED",
] as const;
type PatientWarningFlag = (typeof PATIENT_WARNING_FLAGS)[number];

function initAuditState(parseId: string, result: ForecastResult): AuditState {
  const patients: Record<string, PatientAuditState> = {};
  for (const p of result.patients) {
    const drugs: Record<string, DrugAuditEntry> = {};
    for (const d of p.drugs) {
      drugs[d.drugName] = {
        forecastedQty: d.quantityUnits,
        onHandQty: 0,
        orderQty: d.quantityUnits ?? 0,
        confirmed: false,
      };
    }
    patients[p.recordNumber] = {
      recordNumber: p.recordNumber,
      warningAcknowledgements: {},
      weightOverride: null,
      patientNameOverride: null,
      drugs,
    };
  }
  return { forecastRunId: parseId, patients };
}

function isPatientAuditComplete(
  pAudit: PatientAuditState,
  p: ForecastPatientEntry,
): boolean {
  for (const flag of p.flags) {
    if (!(PATIENT_WARNING_FLAGS as readonly string[]).includes(flag)) continue;
    if (flag === "WEIGHT_UNKNOWN") {
      if (pAudit.weightOverride == null || pAudit.weightOverride <= 0) return false;
    } else {
      if (!pAudit.warningAcknowledgements[flag]) return false;
    }
  }
  if (p.drugs.length > 0) {
    for (const d of p.drugs) {
      if (!pAudit.drugs[d.drugName]?.confirmed) return false;
    }
  }
  return true;
}
```

- [ ] **Step 6.3: Add state variables inside PharmacyForecastPage**

After the existing `useState` block, add:

```typescript
const [auditState, setAuditState] = useState<AuditState | null>(null);
const [activeTab, setActiveTab] = useState<"review" | "audit" | "email">("review");
```

- [ ] **Step 6.4: Initialize auditState in parseMutation.onSuccess**

In `parseMutation.onSuccess`, after `setForecastResult(rest)`, add:

```typescript
setAuditState(initAuditState(parseId, rest));
setActiveTab("review");
```

- [ ] **Step 6.5: Reset auditState in back-button onClick**

In the back-button `onClick` handler (where `setForecastResult(null)` is called), add:

```typescript
setAuditState(null);
setActiveTab("review");
```

- [ ] **Step 6.6: Add auditComplete derived value**

After the `summary` useMemo, add:

```typescript
const auditComplete = useMemo(() => {
  if (!auditState || !forecastResult) return false;
  return forecastResult.patients.every((p) => {
    const pAudit = auditState.patients[p.recordNumber];
    return pAudit != null && isPatientAuditComplete(pAudit, p);
  });
}, [auditState, forecastResult]);
```

- [ ] **Step 6.7: Replace the Tabs block**

Find `<Tabs defaultValue="review">` (in the "review" step branch). Replace the entire `<Tabs>...</Tabs>` block with:

```tsx
<Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
  <TabsList className="w-full grid grid-cols-3">
    <TabsTrigger value="review">{t.pharmacyForecast.tabReview}</TabsTrigger>
    <TabsTrigger value="audit">{t.pharmacyForecast.tabAudit}</TabsTrigger>
    <TabsTrigger
      value="email"
      disabled={!auditComplete}
      title={!auditComplete ? t.pharmacyForecast.auditTabLocked : undefined}
    >
      {t.pharmacyForecast.tabEmail}
    </TabsTrigger>
  </TabsList>

  {/* ── Review tab — unchanged content ── */}
  <TabsContent value="review" className="space-y-3 mt-3">
    {forecastResult?.patients.map((p: ForecastPatientEntry) => (
      <Card key={`${p.recordNumber}-${p.name}`}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">
            {p.name || t.common.unknown} · {p.recordNumber} · {p.weightKg} kg
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {p.flags.includes("PATIENT_UNKNOWN") ? (
            <div className="text-xs font-medium text-amber-800">{t.pharmacyForecast.patientUnknown}</div>
          ) : null}
          {p.flags.includes("WEIGHT_UNKNOWN") ? (
            <div className="text-xs font-medium text-amber-800">{t.pharmacyForecast.weightUnknownBanner}</div>
          ) : null}
          {p.flags.includes("ALL_DRUGS_EXCLUDED") ? (
            <div className="text-xs font-medium text-amber-800">{t.pharmacyForecast.allDrugsExcludedWarning}</div>
          ) : null}
          {p.drugs.map((d: ForecastDrugEntry) => {
            const key = normalizeQuantityKey(p.recordNumber, d.drugName);
            const needsInput = d.type === "prn" || d.flags.length > 0;
            const variant = badgeVariantForDrug(d);
            const showFlagBg = d.flags.length > 0;
            return (
              <div
                key={key}
                className={cn(
                  "flex flex-col gap-2 rounded-lg border p-2 text-sm",
                  showFlagBg ? "border-amber-200 bg-amber-50" : "border-border",
                )}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{d.drugName}</span>
                  <Badge variant={variant}>{d.type}</Badge>
                </div>
                <div className="text-xs text-muted-foreground">{d.concentration} · {d.route}</div>
                {d.flags.includes("DUPLICATE_LINE") ? (
                  <div className="text-xs text-amber-800">{t.pharmacyForecast.duplicateLineWarning}</div>
                ) : null}
                {(d.flags.includes("DOSE_HIGH") || d.flags.includes("DOSE_LOW")) && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={pharmacistDoseAcks[key] ?? false}
                      onChange={(e) =>
                        setPharmacistDoseAcks((prev) => ({ ...prev, [key]: e.target.checked }))
                      }
                    />
                    {t.pharmacyForecast.pharmacistDoseAckLabel}
                  </label>
                )}
                {needsInput ? (
                  <div className="flex items-center gap-2">
                    <Label className="text-xs shrink-0">{t.pharmacyForecast.quantity}</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 max-w-[100px]"
                      value={manualQty[key] ?? ""}
                      onChange={(e) => handleQtyChange(key, e.target.value)}
                    />
                    <span className="text-xs text-muted-foreground">{d.unitLabel}</span>
                  </div>
                ) : (
                  <div className="text-sm">
                    {t.pharmacyForecast.quantity}:{" "}
                    <span className="font-semibold">{d.quantityUnits ?? "—"}</span> {d.unitLabel}
                  </div>
                )}
                {mergedPreview && d.administrationsPer24h != null && d.administrationsInWindow != null ? (
                  <p className="text-xs text-muted-foreground pt-1">
                    {t.pharmacyForecast.quantityFrequencyBasis(
                      d.administrationsPer24h,
                      d.administrationsInWindow,
                      mergedPreview.windowHours,
                    )}
                  </p>
                ) : null}
              </div>
            );
          })}
        </CardContent>
      </Card>
    ))}
  </TabsContent>

  {/* ── Audit tab ── */}
  <TabsContent value="audit" className="space-y-4 mt-3">
    {forecastResult && auditState
      ? forecastResult.patients.map((p) => {
          const pAudit = auditState.patients[p.recordNumber]!;
          const patientFlags = p.flags.filter((f) =>
            (PATIENT_WARNING_FLAGS as readonly string[]).includes(f),
          );
          const resolvedWarnings = patientFlags.filter((f) =>
            f === "WEIGHT_UNKNOWN"
              ? pAudit.weightOverride != null && pAudit.weightOverride > 0
              : !!pAudit.warningAcknowledgements[f],
          ).length;
          const confirmedDrugs = p.drugs.filter((d) => pAudit.drugs[d.drugName]?.confirmed).length;
          const complete = isPatientAuditComplete(pAudit, p);

          const updateDrug = (drugName: string, patch: Partial<DrugAuditEntry>) => {
            setAuditState((prev) => {
              if (!prev) return prev;
              const pp = prev.patients[p.recordNumber]!;
              const dd = pp.drugs[drugName]!;
              const merged = { ...dd, ...patch };
              if ("onHandQty" in patch) {
                merged.orderQty = Math.max(0, (merged.forecastedQty ?? 0) - merged.onHandQty);
              }
              return {
                ...prev,
                patients: {
                  ...prev.patients,
                  [p.recordNumber]: { ...pp, drugs: { ...pp.drugs, [drugName]: merged } },
                },
              };
            });
          };

          const ackWarning = (flag: string, val: boolean) =>
            setAuditState((prev) => {
              if (!prev) return prev;
              const pp = prev.patients[p.recordNumber]!;
              return {
                ...prev,
                patients: {
                  ...prev.patients,
                  [p.recordNumber]: {
                    ...pp,
                    warningAcknowledgements: { ...pp.warningAcknowledgements, [flag]: val },
                  },
                },
              };
            });

          const setWeight = (kg: number) =>
            setAuditState((prev) => {
              if (!prev) return prev;
              const pp = prev.patients[p.recordNumber]!;
              return {
                ...prev,
                patients: { ...prev.patients, [p.recordNumber]: { ...pp, weightOverride: kg } },
              };
            });

          return (
            <Card key={p.recordNumber}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center justify-between">
                  <span>
                    {p.name || t.common.unknown} · {p.recordNumber} ·{" "}
                    {pAudit.weightOverride ?? p.weightKg} kg
                  </span>
                  {complete ? <Badge variant="ok">✓ הושלם</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Warnings panel */}
                {patientFlags.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-3">
                    <div className="text-xs font-semibold text-amber-900">
                      {t.pharmacyForecast.auditWarningsTitle}
                    </div>
                    {patientFlags.map((flag) =>
                      flag === "WEIGHT_UNKNOWN" ? (
                        <div key={flag} className="space-y-1">
                          <div className="text-xs font-medium text-amber-800">
                            ⚠ WEIGHT_UNKNOWN — {t.pharmacyForecast.auditWeightLabel}
                          </div>
                          <div className="flex items-center gap-2">
                            <Input
                              type="number"
                              min={0.1}
                              step={0.1}
                              placeholder={t.pharmacyForecast.auditWeightPlaceholder}
                              className="h-8 max-w-[90px]"
                              value={pAudit.weightOverride ?? ""}
                              onChange={(e) => {
                                const v = parseFloat(e.target.value);
                                if (v > 0) setWeight(v);
                              }}
                            />
                            {pAudit.weightOverride != null && pAudit.weightOverride > 0 && (
                              <span className="text-xs text-green-700">✓ {pAudit.weightOverride} ק״ג</span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <label key={flag} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Checkbox
                            checked={!!pAudit.warningAcknowledgements[flag]}
                            onCheckedChange={(v) => ackWarning(flag, !!v)}
                          />
                          <span className="font-medium text-amber-800">⚠ {flag}</span>
                          <span className="text-amber-700">— {t.pharmacyForecast.auditAckLabel}</span>
                        </label>
                      ),
                    )}
                  </div>
                )}

                {/* Drug audit table */}
                {p.drugs.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-right py-1 px-2 font-medium">תרופה</th>
                          <th className="text-center py-1 px-2 font-medium whitespace-nowrap">
                            {t.pharmacyForecast.auditForecasted}
                          </th>
                          <th className="text-center py-1 px-2 font-medium whitespace-nowrap">
                            {t.pharmacyForecast.auditOnHand}
                          </th>
                          <th className="text-center py-1 px-2 font-medium whitespace-nowrap">
                            {t.pharmacyForecast.auditOrder}
                          </th>
                          <th className="text-center py-1 px-2 font-medium">
                            {t.pharmacyForecast.auditConfirmed}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {p.drugs.map((d) => {
                          const entry = pAudit.drugs[d.drugName]!;
                          return (
                            <tr key={d.drugName} className="border-b last:border-0">
                              <td className="py-2 px-2">
                                <div className="font-medium">{d.drugName}</div>
                                <div className="text-xs text-muted-foreground">
                                  {d.concentration} · {d.route}
                                </div>
                              </td>
                              <td className="text-center py-2 px-2 tabular-nums">
                                {entry.forecastedQty ?? "—"}{" "}
                                <span className="text-xs text-muted-foreground">{d.unitLabel}</span>
                              </td>
                              <td className="text-center py-2 px-2">
                                <Input
                                  type="number"
                                  min={0}
                                  className="h-7 w-16 text-center mx-auto"
                                  value={entry.onHandQty}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    updateDrug(d.drugName, {
                                      onHandQty: Number.isFinite(v) && v >= 0 ? v : 0,
                                    });
                                  }}
                                />
                              </td>
                              <td className="text-center py-2 px-2 tabular-nums font-semibold text-green-700">
                                {entry.orderQty}
                              </td>
                              <td className="text-center py-2 px-2">
                                <Checkbox
                                  checked={entry.confirmed}
                                  onCheckedChange={(v) =>
                                    updateDrug(d.drugName, { confirmed: !!v })
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Progress + Generate button */}
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    {confirmedDrugs} / {p.drugs.length} תרופות · {resolvedWarnings} /{" "}
                    {patientFlags.length} אזהרות
                  </span>
                  <Button
                    size="sm"
                    disabled={!complete}
                    onClick={() => {
                      const newQty = { ...manualQty };
                      for (const d of p.drugs) {
                        const entry = pAudit.drugs[d.drugName];
                        if (entry != null) {
                          newQty[normalizeQuantityKey(p.recordNumber, d.drugName)] = entry.orderQty;
                        }
                      }
                      setManualQty(newQty);
                      // If every patient is complete, open email tab
                      const allDone = forecastResult!.patients.every((pp) => {
                        const a = auditState!.patients[pp.recordNumber];
                        return a != null && isPatientAuditComplete(a, pp);
                      });
                      if (allDone) setActiveTab("email");
                    }}
                  >
                    {t.pharmacyForecast.auditGenerateEmail}
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })
      : null}
  </TabsContent>

  {/* ── Email tab ── */}
  <TabsContent value="email" className="mt-3">
    <pre
      className="whitespace-pre-wrap rounded-lg border bg-muted/40 p-3 text-xs font-mono max-h-[420px] overflow-auto"
      dir="rtl"
    >
      {previewText}
    </pre>
  </TabsContent>
</Tabs>
```

- [ ] **Step 6.8: Update approveMutation to pass auditTrace**

In `approveMutation.mutationFn`, replace the existing `api.forecast.approve(...)` call with:

```typescript
const trace: Record<string, { forecastedQty: number | null; onHandQty: number }> = {};
const weightOverrides: Record<string, number> = {};
if (auditState) {
  for (const pAudit of Object.values(auditState.patients)) {
    if (pAudit.weightOverride != null && pAudit.weightOverride > 0) {
      weightOverrides[pAudit.recordNumber] = pAudit.weightOverride;
    }
    for (const [drugName, entry] of Object.entries(pAudit.drugs)) {
      const key = normalizeQuantityKey(pAudit.recordNumber, drugName);
      trace[key] = { forecastedQty: entry.forecastedQty, onHandQty: entry.onHandQty };
    }
  }
}
return api.forecast.approve({
  parseId: forecastParseId,
  manualQuantities: manualQty,
  pharmacistDoseAcks: Object.entries(pharmacistDoseAcks)
    .filter(([, v]) => v)
    .map(([k]) => k),
  auditTrace: Object.keys(trace).length > 0 ? trace : undefined,
  patientWeightOverrides: Object.keys(weightOverrides).length > 0 ? weightOverrides : undefined,
});
```

- [ ] **Step 6.9: Gate Send button on auditComplete**

In the Send button's `disabled` prop, add `|| !auditComplete`:

```tsx
disabled={
  approveMutation.isPending ||
  !approvalGate.ok ||
  pharmacyMissing ||
  !forecastResult ||
  !forecastParseId ||
  !auditComplete
}
```

- [ ] **Step 6.10: Verify TypeScript compiles**

```bash
npx tsc --noEmit -p tsconfig.json
```

Expected: 0 errors.

- [ ] **Step 6.11: Commit**

```bash
git add src/pages/pharmacy-forecast.tsx src/lib/api.ts
git commit -m "feat(forecast): Audit tab with warning resolution and per-drug on-hand inputs"
```

---

### Task 7: Smoke test

- [ ] **Step 7.1: Run all tests**

```bash
npx vitest run
```

Expected: all existing tests pass plus 2 new test files (formulary-seed-sync, forecast-email-builder).

- [ ] **Step 7.2: Manual smoke test**

Start dev server (`npm run dev`), open http://localhost:5000/pharmacy-forecast, upload the test PDF. Verify:

1. Results tab: Butorphanol shows "בקבוקונים", Mirtazapine shows "טבליות", Famotidine shows "אמפולות"
2. Audit tab appears as the middle tab
3. Email tab trigger shows as disabled (greyed out) before audit complete
4. On-hand input updates "להזמין" column live (`max(0, forecasted - onHand)`)
5. Checking all drugs + resolving all warnings enables "Generate Order Email"
6. Clicking that button → Email tab opens with updated plain-text preview
7. Send button enabled only when audit complete
8. Sending the order → email received has per-medication sections (not a table)

- [ ] **Step 7.3: Commit**

```bash
git add -A
git commit -m "chore: pharmacy forecast audit UX smoke test complete"
```
