# Pharmacy forecast review fixes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix multipart PDF parse validation (string form fields), align client approve gating with server `validateMergedForecastForApproval` (PRN ≥ 1, patient-level flags), and dedupe gate logic via a shared module tested on both sides.

**Architecture:** Add a Zod schema that accepts JSON numbers and multipart string/boolean equivalents for `windowHours` and `weekendMode`. Move approval validation into `lib/forecast/approve-gate.ts` so `server/lib/forecast/approveGuard.ts` re-exports it and the React page gates on `applyManualQuantities(...)` + the same function. Extend `forecast-merge-approval` tests for parse-body coercion and gate cases.

**Tech Stack:** Zod, Express + multer, React, existing `pnpm test` + `npx tsc --noEmit -p tsconfig.json`.

---

## File map

| File | Responsibility |
|------|------------------|
| `server/lib/forecast/forecastZod.ts` | Add `forecastParseRequestSchema` (multipart-safe); keep existing approve schemas |
| `server/routes/forecast.ts` | Replace inline `parseBodySchema` with imported schema |
| `lib/forecast/approve-gate.ts` | **New:** `validateMergedForecastForApproval` (moved from server; pure TS) |
| `server/lib/forecast/approveGuard.ts` | Re-export from `lib/forecast/approve-gate.ts` for backward compatibility |
| `src/lib/forecastApproveGate.ts` | **New thin barrel:** re-export from `lib/forecast/approve-gate.ts` for `@/` imports (optional; or import `lib/...` directly from pages) |
| `src/pages/pharmacy-forecast.tsx` | Gate Approve on merged result + gate; simplify/remove `pendingManual` where redundant |
| `tests/forecast-merge-approval.test.ts` | Add cases: parse body strings, patient flags block, PRN 0 blocks |
| `tsconfig.server-check.json` | Include `lib/forecast/**/*.ts` so server imports typecheck |

---

### Task 1: Shared approval gate module

**Files:**
- Create: `lib/forecast/approve-gate.ts`
- Modify: `server/lib/forecast/approveGuard.ts`
- Test: `tests/forecast-merge-approval.test.ts`

- [ ] **Step 1: Write the failing test** — expect import from new path

Add to `tests/forecast-merge-approval.test.ts` (before `run()`):

```typescript
import { validateMergedForecastForApproval as validateFromLib } from "../lib/forecast/approve-gate.ts";
```

After the existing `blocked` assertion, add:

```typescript
  const patientUnknown: ForecastResult = {
    ...base,
    patients: [
      {
        ...base.patients[0]!,
        flags: ["PATIENT_UNKNOWN"],
        drugs: base.patients[0]!.drugs.map((d) => ({ ...d, flags: [] as const })),
      },
    ],
  };
  const pu = validateFromLib(patientUnknown);
  assert.equal(pu.ok, false);

  const prnZero: ForecastResult = {
    ...base,
    patients: [
      {
        ...base.patients[0]!,
        drugs: [{ ...base.patients[0]!.drugs[0]!, quantityUnits: 0, flags: [] }],
      },
    ],
  };
  const z = validateFromLib(prnZero);
  assert.equal(z.ok, false);
```

- [ ] **Step 2: Run test — verify it fails**

Run:

```bash
pnpm exec tsx tests/forecast-merge-approval.test.ts
```

Expected: **FAIL** — `Cannot find module '../lib/forecast/approve-gate.ts'` or equivalent.

- [ ] **Step 3: Create `lib/forecast/approve-gate.ts`** — move logic verbatim from current `approveGuard.ts`

```typescript
import type { ForecastResult } from "../../src/types/index.ts";

/** Server + client: gates after merge (manual quantities applied). */
export function validateMergedForecastForApproval(
  result: ForecastResult,
): { ok: true } | { ok: false; code: string; message: string } {
  for (const p of result.patients) {
    if (p.flags.length > 0) {
      return {
        ok: false,
        code: "UNRESOLVED_PATIENT_FLAGS",
        message: "Resolve all patient warnings before approving the pharmacy order",
      };
    }
    for (const d of p.drugs) {
      if (d.flags.length > 0) {
        return {
          ok: false,
          code: "UNRESOLVED_DRUG_FLAGS",
          message: "Resolve all drug warnings before approving the pharmacy order",
        };
      }
      if (d.type === "prn") {
        const q = d.quantityUnits;
        if (q == null || !Number.isFinite(q) || q < 1) {
          return {
            ok: false,
            code: "PRN_QUANTITY_REQUIRED",
            message: "Every PRN line needs a quantity of at least 1 before approval",
          };
        }
      }
    }
  }
  return { ok: true };
}
```

- [ ] **Step 4: Replace `server/lib/forecast/approveGuard.ts` body** with re-export

```typescript
export { validateMergedForecastForApproval } from "../../../lib/forecast/approve-gate.js";
```

- [ ] **Step 5: Run test**

Run:

```bash
pnpm exec tsx tests/forecast-merge-approval.test.ts
```

Expected: **PASS**.

- [ ] **Step 6: Commit**

```bash
git add lib/forecast/approve-gate.ts server/lib/forecast/approveGuard.ts tests/forecast-merge-approval.test.ts
git commit -m "refactor(forecast): share approve gate between server and tests"
```

---

### Task 2: Multipart-safe parse request schema

**Files:**
- Modify: `server/lib/forecast/forecastZod.ts`
- Modify: `server/routes/forecast.ts`
- Modify: `tests/forecast-merge-approval.test.ts` (or new `tests/forecast-parse-body.test.ts`)

- [ ] **Step 1: Write failing tests for string form fields**

Append to `tests/forecast-merge-approval.test.ts`:

```typescript
import { forecastParseRequestSchema } from "../server/lib/forecast/forecastZod.ts";

  const multipartLike = forecastParseRequestSchema.safeParse({
    windowHours: "72",
    weekendMode: "true",
  });
  assert.equal(multipartLike.success, true);
  assert.equal(multipartLike.success ? multipartLike.data.windowHours : null, 72);
  assert.equal(multipartLike.success ? multipartLike.data.weekendMode : null, true);

  const jsonLike = forecastParseRequestSchema.safeParse({
    windowHours: 24,
    weekendMode: false,
    text: "hello",
  });
  assert.equal(jsonLike.success, true);
```

Run:

```bash
pnpm exec tsx tests/forecast-merge-approval.test.ts
```

Expected: **FAIL** — `forecastParseRequestSchema` not exported or parse fails on strings.

- [ ] **Step 2: Add schema to `server/lib/forecast/forecastZod.ts`**

After the existing imports/constants, add:

```typescript
/** Accepts JSON bodies and multipart field strings from `multipart/form-data`. */
function optionalBool(): z.ZodType<boolean | undefined> {
  return z.preprocess((val) => {
    if (val === undefined || val === "") return undefined;
    if (typeof val === "boolean") return val;
    if (val === "true") return true;
    if (val === "false") return false;
    return val;
  }, z.boolean().optional()) as z.ZodType<boolean | undefined>;
}

function optionalWindowHours(): z.ZodType<24 | 72 | undefined> {
  return z.preprocess((val) => {
    if (val === undefined || val === "") return undefined;
    const n = typeof val === "string" ? Number(val) : typeof val === "number" ? val : NaN;
    if (n === 24 || n === 72) return n;
    return val;
  }, z.union([z.literal(24), z.literal(72)]).optional()) as z.ZodType<24 | 72 | undefined>;
}

export const forecastParseRequestSchema = z.object({
  text: z.string().optional(),
  windowHours: optionalWindowHours(),
  weekendMode: optionalBool(),
});
```

Remove any duplicate old `parseBodySchema` from `forecast.ts` only after Task 2 step 3.

- [ ] **Step 3: Wire `server/routes/forecast.ts`**

Delete the local `parseBodySchema` object (lines ~49–53). At top of file, extend import:

```typescript
import { approvePayloadSchema, forecastParseRequestSchema, forecastResultSchema } from "../lib/forecast/forecastZod.js";
```

Replace `parseBodySchema.safeParse` with:

```typescript
const parsed = forecastParseRequestSchema.safeParse(rawBody);
```

- [ ] **Step 4: Run tests**

```bash
pnpm exec tsx tests/forecast-merge-approval.test.ts
```

Expected: **PASS**.

- [ ] **Step 5: Commit**

```bash
git add server/lib/forecast/forecastZod.ts server/routes/forecast.ts tests/forecast-merge-approval.test.ts
git commit -m "fix(forecast): coerce multipart parse fields for PDF uploads"
```

---

### Task 3: Server-check TS includes shared `lib`

**Files:**
- Modify: `tsconfig.server-check.json`

- [ ] **Step 1: Extend include**

Change `"include"` from:

```json
"include": ["server/**/*.ts"]
```

to:

```json
"include": ["server/**/*.ts", "lib/forecast/**/*.ts", "src/types/**/*.ts"]
```

(`approve-gate.ts` imports `ForecastResult` from `src/types`.)

- [ ] **Step 2: Run**

```bash
npx tsc --noEmit -p tsconfig.server-check.json
```

Expected: **exit 0**, or fix path/import issues until clean.

- [ ] **Step 3: Commit**

```bash
git add tsconfig.server-check.json
git commit -m "chore(ts): include shared forecast gate in server-check"
```

---

### Task 4: Frontend — gate Approve on merged forecast

**Files:**
- Modify: `src/pages/pharmacy-forecast.tsx`
- Optional: `locales/he.json`, `locales/en.json`, `src/lib/i18n.ts` — only if mapping gate `code` to `t.*` strings

- [ ] **Step 1: Import shared gate**

At top of `src/pages/pharmacy-forecast.tsx`:

```typescript
import { validateMergedForecastForApproval } from "../../lib/forecast/approve-gate";
```

- [ ] **Step 2: Compute gate from merged preview**

After `mergedPreview` useMemo:

```typescript
const approvalGate = useMemo(() => {
  if (!mergedPreview) return { ok: true as const };
  return validateMergedForecastForApproval(mergedPreview);
}, [mergedPreview]);
```

- [ ] **Step 3: Replace approve disable conditions**

Locate the Approve `<Button disabled={...}>`. Replace `pendingManual > 0` with **`approvalGate.ok === false`** for the disabled prop and styling condition.

Keep **`pendingManual`** only if still used for the button label count; otherwise derive:

```typescript
const blockedCount = approvalGate.ok ? 0 : 1;
```

Prefer showing **`approvalGate.ok === false ? approvalGate.message`** as helper text under the button (English from shared module is acceptable for first iteration; optional Task 4b maps `approvalGate.code` to `t.pharmacyForecast.gate.*`).

Minimum required diff — **disabled**:

```typescript
disabled={
  approveMutation.isPending ||
  approvalGate.ok === false ||
  pharmacyMissing ||
  !forecastResult ||
  !forecastParseId
}
```

Green styling condition: `approvalGate.ok && !pharmacyMissing`.

- [ ] **Step 4: Remove redundant `pendingManual` logic** if fully superseded by gate

Delete the `pendingManual` useMemo and all `pendingManual` references **only after** confirming `validateMergedForecastForApproval` covers:

- PRN quantity ≥ 1  
- unresolved drug flags  
- unresolved patient flags  

Update button label branch: if `!approvalGate.ok`, show `approvalGate.message` or existing `approveBlocked` with count removed.

- [ ] **Step 5: Run**

```bash
pnpm test
npx tsc --noEmit -p tsconfig.json
```

Expected: **exit 0** for both.

- [ ] **Step 6: Commit**

```bash
git add src/pages/pharmacy-forecast.tsx
git commit -m "fix(forecast): align pharmacy-forecast approve gate with server"
```

---

## Self-review (plan vs spec)

| Spec / review item | Covered by task |
|--------------------|-----------------|
| Design §3 — PDF + paste same endpoint | Task 2 (multipart coercion) |
| Design §5 — PATIENT_UNKNOWN blocks until resolved | Task 1 + 4 (gate includes patient flags) |
| Design — approve disabled until flags resolved | Task 4 |
| Review — PRN qty 0 vs server | Task 1 + 4 |
| Review — transactional approve / i18n errors | **Out of scope** (optional follow-up) |

**Placeholder scan:** No TBD/TODO left for core tasks.

**Type consistency:** `ForecastResult` imported from `src/types/index.ts` in `lib/forecast/approve-gate.ts`; ensure `src/types` matches API payloads (already used by the page).

---

## Execution handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-20-pharmacy-forecast-review-fixes.md`.**

Two execution options:

**1. Subagent-driven (recommended)** — Dispatch a fresh subagent per task; review between tasks.

**2. Inline execution** — Run tasks in this session using executing-plans with checkpoints.

**Which approach?**

If subagent-driven: **REQUIRED SUB-SKILL:** `superpowers:subagent-driven-development`.

If inline: **REQUIRED SUB-SKILL:** `superpowers:executing-plans`.
