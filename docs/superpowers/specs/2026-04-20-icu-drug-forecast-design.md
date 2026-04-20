# Smart ICU Drug Forecasting & Automated Pharmacy Ordering — Design Spec

**Date:** 2026-04-20  
**Status:** Approved for implementation  
**Feature route:** `/pharmacy-forecast`

---

## 1. Problem Statement

ICU technicians manually review every patient's flowsheet to calculate medication needs for the upcoming 24–72 hour window, then fill out a paper form per animal for the pharmacy. This takes 45–60 minutes per shift, is error-prone under cognitive load, and generates frequent pharmacy complaints about incorrect or missing orders. No API exists between SmartFlow and VetTrack, so data must currently be transcribed by hand.

---

## 2. Solution Overview

A two-step PWA workflow at `/pharmacy-forecast`:

1. **Input** — technician uploads a SmartFlow ward report PDF, or pastes the ward whiteboard content.
2. **Parse → Forecast** — the Node.js backend runs the multi-layer structured parser, enriches with patient and formulary data, and calculates physical unit counts for each drug.
3. **Review & Approve** — a mobile-optimised screen shows one card per patient with flagged fields highlighted in amber. The technician resolves flags (tap-to-edit) and enters PRN quantities before approving.
4. **Output** — on approval, a formatted Hebrew email is sent to the pharmacy (Nodemailer SMTP, with `mailto:` fallback). The order is written to the audit log.

---

## 3. Data Input

Two paths, one backend endpoint (`POST /api/forecast/parse`):

| Path | Mechanism | Frontend action |
|---|---|---|
| PDF Upload | `pdf-parse` extracts raw text server-side | File picker / drag-drop |
| Smart Paste | Clipboard text sent as request body | Paste into textarea |

Both inputs produce the same raw text string that enters the parser pipeline. The frontend does not distinguish between sources after submission.

---

## 4. Parser Pipeline

Three layers run sequentially. A failure at any layer degrades gracefully — uncertain items are flagged for manual review rather than rejected.

### Layer 1 — Structure Detection

Identifies table boundaries, column positions, and row separators in the raw text. Outputs a structured list of candidate rows, each with detected field positions. Handles both tabular PDF exports and freeform whiteboard paste layouts.

### Layer 2 — Field Extraction & Normalisation

Applies named regex patterns to each candidate row to extract:

| Field | Notes |
|---|---|
| Patient record number | Primary key — matched against `vt_animals.record_number` |
| Drug name | Fuzzy-matched via **fuse.js** against the active ICU formulary (fuse.js `threshold: 0.3` — lower = stricter; 0.3 rejects poor matches). Corrected name stored; original preserved for display. |
| Dose | Numeric value + unit (mg, mcg, mEq, %, tablet) |
| Frequency | Normalised to doses/day: `BID→2`, `TID→3`, `SID/QD→1`, `q8h→3`, `q6h→4`, `q12h→2`, `tabs/tablet→tablet` |
| Route of administration | IV, SC, IM, PO, etc. |
| Infusion type | CRI flag if the row contains rate-per-hour pattern |

### Layer 3 — Confidence Scoring & Clinical Checks

Each extracted item receives a confidence score (0–1). Items below **0.75** are flagged for manual review. Additional clinical checks run regardless of confidence score:

| Check | Action |
|---|---|
| Dose exceeds formulary max (mg/kg) | Flag as `DOSE_HIGH` |
| Dose below formulary min (mg/kg) | Flag as `DOSE_LOW` |
| **Loading dose heuristic**: D₁ ≥ 1.5 × D₂ | Auto-classify first dose as **LD**, remainder as maintenance |
| PRN medication detected | Set qty to 0, flag as `PRN_MANUAL` |
| Frequency not parsed | Flag as `FREQ_MISSING` |
| Drug not found in formulary after fuzzy match | Flag as `DRUG_UNKNOWN` |

Flags are surfaced in the validation UI as amber rows. The approve button is disabled until all flags are resolved.

---

## 5. Forecasting Engine

Runs after parsing. Calculates the **physical unit count** for each drug — ampoules, vials, bags, or tablets. Milligram totals are intermediate values only and are never shown in the UI or email.

### Mode Detection

| Condition | Default mode | Banner |
|---|---|---|
| Day is Thursday | 72h Weekend Mode | Amber banner shown, one-tap override to 24h |
| Any other day | 24h Standard Mode | No banner |

Technician can always override the mode manually.

### Calculation Rules

| Drug type | Formula |
|---|---|
| **Regular** | `ceil((dose_mg × freq_per_day × window_hours / 24) / concentration_mg_per_unit / unit_volume) × units_per_pack` → rounded up to whole physical units |
| **CRI** | `ceil((rate_ml_per_hr × window_hours × (1 + cri_buffer)) / unit_volume)` — buffer default: **25%**, configurable per drug in formulary |
| **Loading dose (LD)** | Counted as a single dose, separate line item |
| **PRN** | Quantity = 0; surfaced as manual input field in UI |

Unit form (ampoule / vial / bag / tablet) and size come from `vt_inventory_containers` / the drug formulary entry.

### Patient & Drug Data Enrichment

| Data | Source |
|---|---|
| Patient name, species, breed, sex, color, weight | `vt_animals` — looked up by `record_number`. If no match found, the entire patient block is flagged as `PATIENT_UNKNOWN` and the technician must confirm or skip the animal before approving. |
| Owner name, owner ID, phone | `vt_owners` — joined via `vt_animals.owner_id` |
| Drug concentration, unit form, unit volume, min/max dose bounds | Drug formulary (`useDrugFormulary`) |

---

## 6. Validation UI (`/pharmacy-forecast`)

### Layout

Mobile-first, RTL-native using the existing `tailwindcss-rtl` setup and Rubik font. Built entirely from existing VetTrack Radix UI components.

**Step 1 — Input**
- Toggle between PDF Upload and Smart Paste
- If today is Thursday: amber weekend banner with 72h active + "עבור ל-24 שע׳" override button
- Single "Parse Report →" action button

**Step 2 — Review & Approve**
Two tabs:
- **סקירה ואישור** — the review screen
- **תצוגה מקדימה — אימייל** — the generated email preview

Review screen structure:
- Summary chip row: drug count, CRI count, PRN count, LD count, flag count
- One `Card` per patient, header shows animal name + weight + record number
- Each drug as a row: name | badge | **physical unit count** | unit type
- Badge variants: `sterilized` (blue) for CRI, `ok` (emerald) for LD, `secondary` (gray) for PRN, `maintenance` (amber) for any flag

### Flagged Row Behaviour

Flagged rows use the amber `maintenance` background (`#fffbeb` / `border-amber-200`). The quantity cell renders as an amber tappable chip showing the calculated value (or `?` if unparseable). Tapping opens an inline edit input. A sub-label explains the flag reason in Hebrew.

PRN rows render a numeric stepper input instead of a calculated quantity. The approve button remains disabled until all PRN fields have a value and all flag chips have been tapped and confirmed.

### Approve Button States

| State | Appearance |
|---|---|
| Flags unresolved | `bg-muted text-muted-foreground` + "פתור N סימונים לאישור" |
| All resolved | `bg-green-600 text-white` + "אשר ושלח להזמנה" |

---

## 7. Output

### Email Format

One animal block per patient, ordered by record number. Each block contains:

1. **Patient sticker**: name, record number, species, breed, sex, color, owner name, owner ID, phone, weight
2. **Technician name**
3. **Drug table**: drug name + badge (CRI / LD / PRN) | concentration + pack description | route of administration | **physical unit count**

Subject line format:
```
הזמנת תרופות ICU · N מטופלים · Xh (סוף שבוע / רגיל) · DD.MM.YYYY · אישר/ה: [technician name]
```

Footer: VetTrack attribution, approval timestamp, audit ID.

### Delivery

1. **Primary — Nodemailer SMTP**: sends if `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` env vars are configured. Pharmacy recipient address stored in clinic settings.
2. **Fallback — `mailto:` link**: pre-fills subject, body, and recipient. Opens device's native email app. Shown automatically if SMTP is not configured.

**Pharmacy email address** is a new field added to the clinic settings table (`vt_clinics.pharmacy_email`). A settings UI entry must be added to `/settings` to allow admins to configure this. The approve flow blocks if this field is empty and SMTP is not configured.

### Audit Log

On every approved send, a record is written to `vt_audit_log`:

```json
{
  "action": "pharmacy_order_sent",
  "actor_id": "<technician user id>",
  "metadata": {
    "order_id": "ord-YYYYMMDD-NNN",
    "patient_count": 3,
    "window_hours": 72,
    "delivery_method": "smtp" | "mailto",
    "patients": ["<record_number>", ...]
  }
}
```

A snapshot of the full approved order (all patient-drug-quantity rows) is stored in a new `vt_pharmacy_orders` table for historical reference.

---

## 8. New Database Table

```sql
CREATE TABLE vt_pharmacy_orders (
  id          TEXT PRIMARY KEY,          -- "ord-YYYYMMDD-NNN"
  clinic_id   TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  approved_by TEXT NOT NULL,             -- vt_users.id
  window_hours INTEGER NOT NULL,         -- 24 or 72
  delivery    TEXT NOT NULL,             -- 'smtp' | 'mailto'
  payload     JSONB NOT NULL             -- full order snapshot
);
```

---

## 9. New API Routes

| Method | Route | Description |
|---|---|---|
| `POST` | `/api/forecast/parse` | Accepts `multipart/form-data` (PDF) or `application/json` `{ text }` (paste). Returns parsed + forecasted order with flags. |
| `POST` | `/api/forecast/approve` | Accepts approved order payload. Sends email, writes audit log and `vt_pharmacy_orders` row. Returns delivery method used. |

Both routes require authentication. Only `technician`, `senior_technician`, `vet`, and `admin` roles may call them (same gate as `canExecuteMedicationTask`).

---

## 10. New Dependencies

| Package | Purpose |
|---|---|
| `pdf-parse` | Extract raw text from SmartFlow PDF exports |
| `fuse.js` | Fuzzy drug name matching against ICU formulary |
| `nodemailer` | SMTP email delivery |

No LLM or external API dependencies.

---

## 11. i18n

All UI strings added to `src/lib/i18n/he.json` and `en.json` under a new `pharmacyForecast` key namespace. Email body is generated in Hebrew only (pharmacy communication language). Subject line is Hebrew only.

---

## 12. Testing

| Layer | Test type | What to verify |
|---|---|---|
| Parser Layer 2 | Unit tests | Regex extracts correct fields from 5+ real SmartFlow export samples |
| Fuzzy matcher | Unit tests | Drug name corrections at threshold boundaries |
| Normalisation | Unit tests | All shorthand forms map to correct doses/day |
| Forecasting engine | Unit tests | CRI buffer, LD heuristic, PRN = 0, unit count rounding |
| `/api/forecast/parse` | Integration test | PDF upload and paste both return expected structure |
| `/api/forecast/approve` | Integration test | Audit log written, `vt_pharmacy_orders` row created |
| Validation UI | Playwright E2E | Flag resolution flow, approve button state transitions |
| RTL layout | Playwright E2E | Hebrew layout renders without text overflow |
