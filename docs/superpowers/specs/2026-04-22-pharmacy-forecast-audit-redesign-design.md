# Pharmacy Forecast — Audit Step & UX Fixes

**Date:** 2026-04-22  
**Status:** Approved  

## Overview

Four improvements to the pharmacy forecast feature:

1. **Unit labels** — show correct unit types (vials, tablets, capsules, syringes) instead of always showing "אמפולות".
2. **Patient warning resolution** — give technicians a way to acknowledge or fix warnings before approving the order.
3. **Email format redesign** — replace the current medication table with per-medication sections that show dosing details.
4. **Pre-submission audit** — per-drug "on hand" input so technicians can deduct existing stock before ordering.

All four changes are scoped to the pharmacy forecast feature and do not touch other parts of the app.

---

## Issue 1 — Unit Labels

### Problem

`physicalUnitsForRegular()` in `forecastEngine.ts` derives `unitLabel` from `formulary.unitType`. All current formulary DB entries have `unitType = null`, so every drug defaults to "אמפולות" regardless of its actual packaging.

### Solution

Update `shared/drug-formulary-seed.ts` to set `unitType` correctly for every entry:

| unitType value | Hebrew label | Use for |
|---|---|---|
| `ampoule` | אמפולות | Injectable ampoules (current default) |
| `vial` | בקבוקונים | Multi-dose vials (e.g. Cerenia, Butorphanol) |
| `tablet` | טבליות | Oral tablets (e.g. Mirtazapine, Cisapride) |
| `capsule` | קפסולות | Oral capsules |
| `syringe` | מזרקים | Pre-filled syringes |
| `bag` | שקיות | IV bags (e.g. LRS — excluded, but formulary entry may exist) |

After updating the seed, run `scripts/sync-formulary-seed-all-clinics.ts` to push changes to all clinic DB rows. No changes to `forecastEngine.ts` — the rendering logic already handles all these types.

---

## Issue 2 — Patient Warning Resolution

### Problem

The current UI shows a "Resolve all patient warnings before approving" message but provides no mechanism to act on warnings. The approval gate is permanently blocked for patients with any patient-level flag.

### Warning types and resolution actions

| Flag | Action |
|---|---|
| `WEIGHT_UNKNOWN` | Inline weight input (number field, kg). Submitting triggers a re-enrichment call to the server with the corrected weight, which recalculates drug quantities. |
| `WEIGHT_UNCERTAIN` | Checkbox acknowledgement only. Quantities are already calculated with the uncertain weight — technician confirms they accept it. |
| `PATIENT_UNKNOWN` | Checkbox acknowledgement. Optionally the technician may type the patient name for the email header, but this does not affect drug quantities. |
| `ALL_DRUGS_EXCLUDED` | Checkbox acknowledgement only. No drugs to audit; patient is noted in the email with a "no medications" note. |

### Resolution state

Resolution state is **client-side only** — no DB writes for acknowledgements. State is keyed by `(forecastRunId, recordNumber)` so that uploading a new PDF resets all acknowledgements.

For `WEIGHT_UNKNOWN` with a corrected weight: the client calls a new lightweight server endpoint (`POST /api/forecast/reweight`) that re-runs `enrichAndForecast` with the new weight for the affected patient and returns updated drug quantities.

---

## Issue 3 — Email Format Redesign

### Problem

The current email is a compact HTML table (drug | qty | route | concentration). It does not show per-dose details, patient identity, owner contact, or the technician's name — information the pharmacy team needs to fill the order correctly.

### New format

**Header block:**
- Clinic name
- Order number and issue date
- Technician name ("הוכן ע״י: [name]")

**Patient block (one per patient):**
- Name, species, breed, weight (kg), record number
- Owner name and phone number

**Per-medication sections (one card per drug):**
- Name / strength / formulation (e.g. "Famotidine 10 mg/mL · אמפולה")
- **Total quantity to supply** — the audit-adjusted quantity, with audit trace in parentheses: "(חזוי: 4 · קיים בתא: 1)"
- Amount per administration (dose × unit)
- Route of administration
- Frequency (e.g. "פעם ביום (SID)")
- Duration of treatment (derived from forecast window: 24h or 72h)

**Footer:**
- Technician name, issue date, forecast window hours

### Implementation

`buildPharmacyOrderEmail()` in `server/lib/forecast/emailBuilder.ts` is updated to accept an `auditResult` parameter alongside `ForecastResult`. `auditResult` carries per-drug final quantities and on-hand values. The function generates the new per-section format instead of the table.

The existing plain-text (`text`) output is updated to match the new structure.

---

## Issue 4 — Pre-Submission Audit

### Workflow

The page gains a linear three-phase flow: **Results → Audit → Send**.

This is implemented as a new **Audit tab** inserted between the existing Results and Email tabs. The Email tab is disabled (locked) until the audit is complete.

### Audit tab layout

1. **Patient header** — name, species, breed, weight, record #, owner, phone (read-only summary).
2. **Warnings panel** — appears only if the patient has patient-level flags. Each warning shown with its resolution control (see Issue 2).
3. **Drug audit table** — one row per drug:
   - Drug name + concentration + route (read-only)
   - Forecasted quantity (read-only)
   - On hand (editable number input, default 0)
   - Order quantity (computed: `max(0, forecast − onHand)`, updates live)
   - Confirmed checkbox (technician ticks when they've verified the row)
4. **Progress indicator** — "X / N תרופות אושרו · Y / M אזהרות טופלו"
5. **"Generate Order Email" button** — enabled only when all drugs are confirmed and all warnings resolved/acknowledged. Clicking locks the audit values and switches to the Email tab.

### State

`AuditState` (client-side, React state):

```typescript
interface DrugAuditEntry {
  drugName: string;
  forecastedQty: number | null;
  onHandQty: number;          // technician input, default 0
  orderQty: number;           // max(0, forecastedQty - onHandQty)
  confirmed: boolean;
}

interface PatientAuditState {
  recordNumber: string;
  warningAcknowledgements: Record<string, boolean>;  // flagName → acked
  weightOverride: number | null;                      // kg, if entered
  patientNameOverride: string | null;
  drugs: DrugAuditEntry[];
  auditComplete: boolean;    // all drugs confirmed + all warnings resolved
}

interface AuditState {
  forecastRunId: string;     // reset when a new PDF is uploaded
  patients: PatientAuditState[];
}
```

`AuditState` is not persisted — refreshing the page resets the audit. This matches the existing session-based workflow.

### Re-enrichment endpoint (for weight override)

`POST /api/forecast/reweight`

Request:
```json
{ "forecastRunId": "...", "recordNumber": "361848", "weightKg": 5.2 }
```

Response: updated `ForecastPatientEntry` with recalculated drug quantities.

The server looks up the cached parse result for `forecastRunId`, re-runs `enrichAndForecast` for the single patient with the corrected weight, and returns the updated patient entry.

---

## Files Changed

| File | Change |
|---|---|
| `shared/drug-formulary-seed.ts` | Add `unitType` to all drug entries |
| `scripts/sync-formulary-seed-all-clinics.ts` | Run after seed update (no code change) |
| `src/pages/pharmacy-forecast.tsx` | New Audit tab; `AuditState` management; Email tab lock; "Generate Order" button |
| `src/types/index.ts` | Add `AuditState`, `PatientAuditState`, `DrugAuditEntry` types |
| `server/lib/forecast/emailBuilder.ts` | New per-medication section HTML/text format; accept `auditResult` param |
| `server/routes/forecast.ts` | New `POST /api/forecast/reweight` endpoint |

---

## Out of Scope

- Persisting audit state to the database (sessions are short; in-memory is sufficient)
- Drug-level flag resolution in the Audit tab (DUPLICATE_LINE, DOSE_HIGH, etc. remain informational)
- Multi-patient audit (each patient's audit is independent; current PDFs have one patient)
- Prescription legal compliance (this is an internal pharmacy order, not a regulated prescription)
