# SmartFlow Flowsheet — Meds-only preprocess Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce monitoring and maintenance-fluid noise from SmartFlow Flowsheet PDF / paste text before the ICU pharmacy forecast parser runs, without silently dropping real medication lines; align types and Zod with two new review flags per [docs/superpowers/specs/2026-04-21-smartflow-flowsheet-med-filter-design.md](../specs/2026-04-21-smartflow-flowsheet-med-filter-design.md).

**Architecture:** Add a pure `preprocessFlowsheetText(raw: string): string` in `server/lib/forecast/flowsheetPreprocess.ts` (normalize `<br>`, optional `MEDICATIONS`…`PROCEDURES` window, high-confidence line drops, continuation merges). Call it from `runForecastPipeline` immediately before `detectStructure`. Extend `FlagReason` / Zod / client types and set `FLUID_VS_DRUG_UNCLEAR` in `scoreExtractedDrug` when a line mixes fluid-family tokens with a pharmaceutical dose.

**Tech stack:** TypeScript (Node 22), existing `pnpm test` harness (`tsx` + `node:assert/strict`), no new npm dependencies.

---

## File map (create / modify)

| Path | Role |
|------|------|
| `server/lib/forecast/flowsheetPreprocess.ts` | **Create** — `preprocessFlowsheetText`, helpers (normalize, region slice, drop lines, merge continuations). |
| `server/lib/forecast/pipeline.ts` | **Modify** — call preprocess on `params.rawText` before `detectStructure`. |
| `server/lib/forecast/types.ts` | **Modify** — extend `FlagReason` union. |
| `server/lib/forecast/forecastZod.ts` | **Modify** — extend `flagReasonSchema` enum (parse/approve validation). |
| `server/lib/forecast/confidenceScorer.ts` | **Modify** — append `FLUID_VS_DRUG_UNCLEAR` when rules fire. |
| `src/types/index.ts` | **Modify** — extend `ForecastFlagReason` to mirror server. |
| `locales/en.json`, `locales/he.json` | **Modify** — optional human labels for new flags if you surface flag codes in UI copy (minimal: add under `pharmacyForecast.flagLabels` if referenced). |
| `tests/flowsheet-preprocess.test.ts` | **Create** — unit tests for preprocess + one scorer flag test. |
| `package.json` | **Modify** — append `tsx tests/flowsheet-preprocess.test.ts` to the `test` script (same pattern as `forecast-merge-approval.test.ts`). |

---

### Task 1: `preprocessFlowsheetText` — tests first

**Files:**

- Create: `tests/flowsheet-preprocess.test.ts`
- Create: `server/lib/forecast/flowsheetPreprocess.ts` (stub only until Step 3)

- [ ] **Step 1: Write failing test file**

Create `tests/flowsheet-preprocess.test.ts`:

```typescript
import assert from "node:assert/strict";
import { preprocessFlowsheetText } from "../server/lib/forecast/flowsheetPreprocess.ts";

async function run(): Promise<void> {
  console.log("\n-- flowsheet preprocess");

  const monitoring = "Resp. rate\t28\t32\n10 Cerenia inj\t4 mg IV\n";
  const out1 = preprocessFlowsheetText(monitoring);
  assert.ok(!out1.includes("Resp. rate"), "drops high-confidence monitoring line");
  assert.ok(out1.includes("Cerenia"), "keeps med line");

  const fluidOnly = "LRS 6 ml/hr\nPlasma 5 ml/hr -\n";
  const out2 = preprocessFlowsheetText(fluidOnly);
  assert.equal(out2.includes("LRS"), false, "drops LRS rate-only line");
  assert.equal(out2.includes("Plasma"), false, "drops Plasma rate-only line");

  const fluidWithDrugMg =
    "LRS 6 ml/hr\n/ 100ml<br>Pramin 1 mg / 100ml 6\t6\n10 Famotidine\t4 mg SSIV\n";
  const out3 = preprocessFlowsheetText(fluidWithDrugMg);
  assert.ok(out3.includes("Famotidine"), "keeps true drug line");
  assert.ok(
    out3.includes("Pramin") || out3.includes("mg"),
    "keeps line with mg (additive or drug) — do not drop whole compound line",
  );

  const medsRegion = `NOISE LINE\nMEDICATIONS\n10 Cerenia\nPROCEDURES\nXRAY\n`;
  const out4 = preprocessFlowsheetText(medsRegion);
  assert.ok(!out4.includes("XRAY"), "region slice excludes after PROCEDURES when both anchors exist");
  assert.ok(out4.includes("Cerenia"), "region keeps med inside window");

  const continuation = "3.75 Remeron (Mirtazipine)\n3.75 mg PO אופיר\n";
  const out5 = preprocessFlowsheetText(continuation);
  assert.ok(
    /Remeron.*3\.75\s*mg\s*PO|3\.75\s*mg\s*PO.*Remeron/s.test(out5.replace(/\n/g, " ")),
    "merges name-only line with following dose-only line",
  );

  console.log("flowsheet preprocess: OK");
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

Create `server/lib/forecast/flowsheetPreprocess.ts` **minimal stub** so imports resolve:

```typescript
/** SmartFlow Flowsheet paste/PDF text — normalize, optional meds region, drop obvious non-med lines. */
export function preprocessFlowsheetText(raw: string): string {
  return String(raw ?? "");
}
```

- [ ] **Step 2: Run test — expect FAIL**

Run:

```bash
cd c:\Users\Dan\Documents\GitHub\VetTrack
pnpm exec tsx tests/flowsheet-preprocess.test.ts
```

Expected: assertions fail (preprocess is pass-through).

- [ ] **Step 3: Implement `preprocessFlowsheetText`**

Replace `server/lib/forecast/flowsheetPreprocess.ts` with full implementation (copy as single module):

```typescript
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

/** Merge "DrugName…" then next line "12.3 mg PO …" into one line. */
function mergeContinuations(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const cur = lines[i]!.trim();
    const next = lines[i + 1]?.trim() ?? "";
    if (next && PHARM_DOSE_RE.test(next) && !PHARM_DOSE_RE.test(cur) && cur.length >= 3) {
      out.push(`${cur} ${next}`);
      i += 1;
      continue;
    }
    out.push(cur);
  }
  return out;
}

export function preprocessFlowsheetText(raw: string): string {
  const normalized = normalizeRaw(String(raw ?? ""));
  const region = sliceMedicationsRegion(normalized);
  const rawLines = region.split("\n");
  const merged = mergeContinuations(rawLines.map((l) => l.trim()).filter(Boolean));
  const kept = merged.filter((l) => !shouldDropLine(l));
  return kept.join("\n\n");
}
```

- [ ] **Step 4: Run test — expect PASS**

Run:

```bash
pnpm exec tsx tests/flowsheet-preprocess.test.ts
```

Expected: prints `flowsheet preprocess: OK` and exit code `0`.

- [ ] **Step 5: Commit**

```bash
git add server/lib/forecast/flowsheetPreprocess.ts tests/flowsheet-preprocess.test.ts
git commit -m "feat(forecast): add Flowsheet preprocess for meds-only text cleanup"
```

---

### Task 2: Wire preprocess into pipeline

**Files:**

- Modify: `server/lib/forecast/pipeline.ts` (imports + one line before `detectStructure`)

- [ ] **Step 1: Import and call preprocess**

In `server/lib/forecast/pipeline.ts`, add:

```typescript
import { preprocessFlowsheetText } from "./flowsheetPreprocess.js";
```

Replace:

```typescript
const blocks = detectStructure(params.rawText);
```

with:

```typescript
const cleaned = preprocessFlowsheetText(params.rawText);
const blocks = detectStructure(cleaned);
```

- [ ] **Step 2: Run full test suite (or at least forecast tests)**

Run:

```bash
cd c:\Users\Dan\Documents\GitHub\VetTrack
pnpm exec tsx tests/flowsheet-preprocess.test.ts
pnpm exec tsx tests/forecast-merge-approval.test.ts
```

Expected: both exit `0`.

- [ ] **Step 3: Commit**

```bash
git add server/lib/forecast/pipeline.ts
git commit -m "feat(forecast): run Flowsheet preprocess before structure detection"
```

---

### Task 3: New flags — types, Zod, client mirror, scorer

**Files:**

- Modify: `server/lib/forecast/types.ts`
- Modify: `server/lib/forecast/forecastZod.ts`
- Modify: `src/types/index.ts`
- Modify: `server/lib/forecast/confidenceScorer.ts`

- [ ] **Step 1: Extend unions and Zod**

In `server/lib/forecast/types.ts`, extend `FlagReason`:

```typescript
export type FlagReason =
  | "DOSE_HIGH"
  | "DOSE_LOW"
  | "FREQ_MISSING"
  | "DRUG_UNKNOWN"
  | "PRN_MANUAL"
  | "PATIENT_UNKNOWN"
  | "LOW_CONFIDENCE"
  | "LINE_AMBIGUOUS"
  | "FLUID_VS_DRUG_UNCLEAR";
```

In `server/lib/forecast/forecastZod.ts`, extend `flagReasonSchema`:

```typescript
export const flagReasonSchema = z.enum([
  "DOSE_HIGH",
  "DOSE_LOW",
  "FREQ_MISSING",
  "DRUG_UNKNOWN",
  "PRN_MANUAL",
  "PATIENT_UNKNOWN",
  "LOW_CONFIDENCE",
  "LINE_AMBIGUOUS",
  "FLUID_VS_DRUG_UNCLEAR",
]);
```

In `src/types/index.ts`, extend `ForecastFlagReason` with the same two string literals.

- [ ] **Step 2: Add scorer logic**

At top of `server/lib/forecast/confidenceScorer.ts` (after imports), add:

```typescript
const FLUID_FAMILY_IN_LINE = /\b(?:LRS|Plasma|FFP|DW|5DW|NGT)\b/i;
const PHARM_DOSE_RE =
  /\d+(?:\.\d+)?\s*(?:mg\/kg|mcg\/kg|mg\s*\/\s*kg|mcg\s*\/\s*kg|mg|mcg|mEq|%|tab|tabs|tablet)\b/i;
```

Inside `scoreExtractedDrug`, after the existing flag mutations and **before** the `return { ...extracted, confidence, type, flags };`, add:

```typescript
  const line = extracted.rawLine;
  if (FLUID_FAMILY_IN_LINE.test(line) && PHARM_DOSE_RE.test(line)) {
    flags.push("FLUID_VS_DRUG_UNCLEAR");
  }
  if (
    flags.includes("DRUG_UNKNOWN") &&
    PHARM_DOSE_RE.test(line) &&
    !flags.includes("LINE_AMBIGUOUS")
  ) {
    flags.push("LINE_AMBIGUOUS");
  }
```

So: **`FLUID_VS_DRUG_UNCLEAR`** = fluid token and pharmaceutical dose on same line; **`LINE_AMBIGUOUS`** = formulary miss but line still looks like a med dose (technician must confirm quantity before approve, same as other drug flags).

- [ ] **Step 3: Run tests**

```bash
pnpm exec tsx tests/forecast-merge-approval.test.ts
pnpm exec tsx tests/flowsheet-preprocess.test.ts
```

Expected: `0` exit. If Zod parse tests in merge file construct flags arrays, update any fixture that must stay valid.

- [ ] **Step 4: Commit**

```bash
git add server/lib/forecast/types.ts server/lib/forecast/forecastZod.ts server/lib/forecast/confidenceScorer.ts src/types/index.ts
git commit -m "feat(forecast): add LINE_AMBIGUOUS and FLUID_VS_DRUG_UNCLEAR flags"
```

---

### Task 4: Register test in `package.json`

**Files:**

- Modify: `package.json` (`scripts.test` string)

- [ ] **Step 1: Append test command**

In `package.json`, inside `"test": "..."`, append **before the final quote**:

` && tsx tests/flowsheet-preprocess.test.ts`

so it runs after `forecast-pdf-module-smoke.test.ts` (or after `forecast-merge-approval.test.ts` — any position in the chain is fine).

- [ ] **Step 2: Run**

```bash
pnpm test
```

Expected: full chain passes including new file.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore(test): include flowsheet preprocess in pnpm test"
```

---

## Spec coverage self-review

| Spec § | Plan coverage |
|--------|----------------|
| §4.1 Section-aware | `sliceMedicationsRegion` in preprocess |
| §4.2 Meds-only drops | `shouldDropLine` + fluid/monitoring regexes |
| §4.3 Monitoring | `MONITORING_START_RE` |
| §4.4 Continuation | `mergeContinuations` |
| §4.5 New flags | Task 3 |
| §5 Pipeline order | Task 2 |

**Gap (acceptable v1 follow-up):** Hebrew monitoring labels beyond those in `MONITORING_START_RE` — extend list when you capture more fixtures in `tests/fixtures/flowsheet/` (redacted).

**Placeholder scan:** None intentional; regex lists are explicit starter sets from the sample export.

**Type consistency:** `FlagReason` (server) = `ForecastFlagReason` (client) string literals; `flagReasonSchema` must match exactly.

---

Plan complete and saved to `docs/superpowers/plans/2026-04-21-smartflow-flowsheet-med-filter.md`. Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration. **REQUIRED SUB-SKILL:** superpowers:subagent-driven-development.

**2. Inline Execution** — Run tasks in this session with checkpoints. **REQUIRED SUB-SKILL:** superpowers:executing-plans.

Which approach?
