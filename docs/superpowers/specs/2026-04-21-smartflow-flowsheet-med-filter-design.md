# SmartFlow Flowsheet — Meds-Only Line Filter (Design Spec)

**Date:** 2026-04-21  
**Status:** Draft — pending product review  
**Parent:** [2026-04-20-icu-drug-forecast-design.md](./2026-04-20-icu-drug-forecast-design.md) (`/pharmacy-forecast`)  
**Inputs:** SmartFlow browser paste and/or **Flowsheet PDF** (plain text via `pdf-parse`, same as today).

---

## 1. Problem

Raw text from a SmartFlow **Flowsheet** PDF (and noisy paste) interleaves:

- **Pharmaceutical rows** (mg/kg, mg IV/PO/SC, SSIV/SIV, tablets, named drugs).
- **Maintenance fluids and rates** (`LRS … ml/hr`, `Plasma …`, `FFP …`, boluses, NGT/hourly nutrition) that share **`ml/hr`** with true drug CRIs.
- **Monitoring / grid** rows (`Resp. rate`, `Heart rate`, `Temperature`, `BP`, `glu`, `PCV`, `Attitude`, `MM`, …) with many numbers but typically **no** pharmaceutical dose pattern.

The current pipeline (`structureDetector` → `parsePatientBlocks` → `extractDrugLine`) treats post-header lines as drug candidates and does **not** scope to SmartFlow sections, so monitoring and fluids pollute the forecast unless the technician trims the paste manually.

**Product decision (confirmed):** Pharmacy output must be **meds only** — maintenance fluid / nutrition rate lines are **out of scope** for the ordered medication list (and should not appear as forecast line items when classified with high confidence).

**Safety bias (confirmed):** Prefer **false positives in review** (keep + flag) over **false negatives** (silently dropping a real med). Silent removal applies only to **high-confidence non-medication** lines.

---

## 2. Goals

1. **Reduce noise** from Flowsheet-like text: monitoring grids and obvious non-med rows should not create `ForecastDrugEntry` rows when confidence in “non-med” is high.
2. **Meds only:** Exclude **maintenance fluid / fluid protocol** lines from the medication forecast and from the pharmacy email line items, per explicit rules in §4.2.
3. **Do not break** existing paste flows that already match the “header + drug lines” paragraph model.
4. **Observable uncertainty:** Borderline lines become scored drugs with flags (e.g. `LINE_AMBIGUOUS`, `FLUID_VS_DRUG_UNCLEAR`) rather than being dropped.

---

## 3. Non-goals (v1)

- Perfect reconstruction of the PDF **2D time grid** (column alignment). We only see **linear text** from `pdf-parse`.
- OCR for scanned bitmap-only PDFs (out of scope unless text layer exists).
- Automatic **multi-day** pharmacy orders across all `Day N of M` sections in one click (optional later: user selects day or window; v1 may continue “single parse blob” behaviour unless product extends).

---

## 4. Behaviour

### 4.1 Section-aware preprocessing (Flowsheet)

After PDF→string (or paste), optionally run a **lightweight line classifier** that uses **anchors** observed in real Flowsheet text:

- **Strong anchors (case-insensitive, whole-line or line-start):** `MEDICATIONS`, `PROCEDURES`, `MONITORINGS`, `FLUIDS`, `ACTIVITIES`, `TREATMENT PROTOCOL CREATED USING SMART FLOW`, `Time` followed by hour tokens, `-- N of M --` page markers, `Day N of`, `File Number:`.
- **Preferred med region:** From a `MEDICATIONS` header through the **earlier of** (a) next `PROCEDURES` section start, (b) next repeating **patient/day header** block that matches the template (e.g. `File Number:` + `Day`), if detectable. If `MEDICATIONS` cannot be found, fall back to today’s behaviour (whole text) so we do not empty-parse legitimate pastes.

**Bias (a):** If section boundaries are **ambiguous**, parse the **union** of candidate regions or full text, and rely on per-line classification + flags — never drop the whole input.

### 4.2 Meds-only exclusion rules (high confidence)

A line is **excluded** (no `ScoredDrug` / no `ForecastDrugEntry`) **only if** all are true:

1. It is classified as **maintenance fluid / nutrition rate** (not an injectable drug order), using patterns such as:
   - Line starts with or prominently contains **fluid family tokens**: `LRS`, `Plasma`, `FFP`, `PCV` (when used as fluid context — see conflict note), `DW`, `NS`, `0.9%`, `NaCl`, `dextrose`, `D5W`, `5DW`, `Sterofundin`, `Normosol`, `bolus` (case variants), `NGT` **when** the line is dominated by **ml/hr** volume rate without a **mg/mcg/mEq/tablet** drug dose on the same line.
   - **Pure rate lines:** e.g. matches `^\s*\d+\s*ml/hr` (and similar Hebrew `מל/ש`) **without** a pharmaceutical dose token (`mg`, `mcg`, `mEq`, `tab`, `tablet`) on that line.
2. It does **not** contain a **pharmaceutical dose** pattern on the same line (`\d+(\.\d+)?\s*(mg/kg|mcg/kg|mg|mcg|mEq|%|tab|tabs|tablet)` with typical routes `IV|IM|SC|PO|SSIV|SIV`).
3. It is **not** a known **false negative risk** pattern (denylist for exclusion): lines containing `famotidine`, `metoclopramide`, `ondansetron`, `maropitant`, `pramin`, `metoclopramide` (examples — final list from hospital formulary + SmartFlow synonyms) **with mg/mcg** remain **meds** even if `ml/hr` appears (compound fluid + additive lines).

**Conflict handling:** `PCV` appears both as monitoring and as hematology context; **do not** exclude solely on `PCV` token. Require fluid-like structure (`ml/hr` dominance + fluid whitelist) for exclusion.

### 4.3 Monitoring / grid rows (high confidence)

Exclude (no forecast row) when **all** hold:

1. Line starts with a **monitoring label** from an allowlist (examples from sample export): `Resp. rate`, `Heart rate`, `Temperature`, `BP`, `Attitude`, `MM`, `Blood Glucose`, `glu`, `Weight`, `Diet - Food`, `Water`, `Walk`, `Urination`, `Defaecation`, `Heart rate` (Hebrew/English mix as extracted).
2. No pharmaceutical dose pattern (same regex family as §4.2(2)).
3. Line is not a known medication name-only row (rare).

Again: if any check is uncertain → **do not exclude**; pass through existing `extractDrugLine` and flag `LINE_AMBIGUOUS`.

### 4.4 Continuation lines

Flowsheet PDF text splits some orders across lines (e.g. drug name on line *n*, `X mg PO` on line *n+1*). v1 should **merge** continuation when:

- Previous line has drug-like tokens but **missing dose**, and next line is **only** a dose/route fragment; then concatenate before `extractDrugLine`.

If merge confidence is low → keep lines separate + flag.

### 4.5 New flags (TypeScript / API contract)

Extend `FlagReason` (see `server/lib/forecast/types.ts` and frontend mirror) with:

| Flag | Meaning |
|------|--------|
| `LINE_AMBIGUOUS` | Line kept for review; could not confidently classify as med vs non-med. |
| `FLUID_VS_DRUG_UNCLEAR` | `ml/hr` present with both fluid-like and drug-like cues; not excluded per bias (a). |

(Zod / API schema updates must accept new enum values where flags are validated.)

---

## 5. Pipeline integration

**Placement:** New module, e.g. `server/lib/forecast/flowsheetPreprocess.ts`, invoked from `runForecastPipeline` **after** `rawText` is available and **before** `detectStructure`, **or** immediately after `detectStructure` on flattened lines — choose one during implementation; preference is **line-level filter before block split** so paragraph heuristics see cleaner text.

**Order of operations (recommended):**

1. Normalize newlines / strip `<br>` to space for regex stability.
2. Optional: split into **day chunks** using `Day N of` + `File Number:` if multi-day behaviour is implemented later.
3. Apply **section window** (meds region) when detectable.
4. **Filter lines** per §4.2–4.3 (high confidence only).
5. **Merge continuation** fragments (§4.4).
6. Existing: `detectStructure` → `parsePatientBlocks` → `enrichAndForecast`.

---

## 6. Testing strategy

1. **Unit fixtures** (redacted): store **minimal** substrings in `tests/fixtures/flowsheet/` — no real patient names, file numbers, or staff names. Include:
   - Med block only (Augmentin, Cerenia, etc.).
   - Monitoring rows adjacent to meds.
   - `LRS 6 ml/hr` + `Pramin` compound line (ensure Pramin not lost if policy says extract additive; else flag).
2. **Regression:** Existing parser tests must keep passing; add tests that assert **excluded** lines do not produce entries and **borderline** lines produce flags.

---

## 7. Spec coverage checklist

| Requirement | Task home |
|-------------|-----------|
| Meds-only excludes maintenance fluids | §4.2 + `flowsheetPreprocess` |
| Monitoring/grid noise reduced | §4.3 |
| Rare false negatives | §1 bias + §4.1 fallback |
| Flowsheet PDF reality (linear text) | §3 + §6 fixtures |
| Continuation merge | §4.4 |
| Flags + Zod | §4.5 + forecast Zod |

---

## 8. Open items (resolve during implementation)

- Exact **fluid whitelist** and **monitoring label** list (English + Hebrew tokens from Korzet/SmartFlow templates).
- Whether **compound fluid+additive** lines should **extract additive only** vs **exclude entire line** when mg is present only in HTML-adjacent text — default recommendation: **extract additive** when mg token exists after merge.

---

## 9. Review request

Please confirm:

1. **Meds only** = §4.2 exclusions are correct for your pharmacy (any fluid you **do** want on the order email?).
2. **Bias (a)** + flags in §4.5 are acceptable UX.

After approval, create the implementation plan via **writing-plans** (`docs/superpowers/plans/2026-04-21-smartflow-flowsheet-med-filter.md`).
