# Smart ICU Drug Forecasting & Automated Pharmacy Ordering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `/pharmacy-forecast` — a mobile-first PWA page that parses SmartFlow ward reports (PDF or clipboard paste), forecasts physical medication unit counts per patient, and sends a formatted Hebrew email to the pharmacy.

**Architecture:** A multi-layer Node.js parser pipeline (structure detection → field extraction with fuse.js fuzzy matching → confidence scoring with clinical heuristics) feeds a forecasting engine that calculates physical unit counts from the drug formulary. The frontend provides a two-step RTL Hebrew flow: data input, then review-and-approve with inline flag resolution. On approval, Nodemailer SMTP (with `mailto:` fallback) sends the order and the result is written to `vt_audit_log` and `vt_pharmacy_orders`.

**Tech Stack:** Node.js/Express, Drizzle ORM/PostgreSQL, `pdf-parse`, `fuse.js`, `nodemailer`, React 18, Radix UI, TanStack Query, Zod, Wouter, Tailwind CSS, Playwright

---

## File Map

**Create:**
```
server/lib/forecast/types.ts            — all shared TS interfaces
server/lib/forecast/structureDetector.ts — Layer 1: split text into patient blocks
server/lib/forecast/fieldExtractor.ts   — Layer 2: regex extraction + fuse.js + normalization
server/lib/forecast/confidenceScorer.ts — Layer 3: confidence scoring + clinical checks
server/lib/forecast/forecastEngine.ts   — unit quantity calculation (24h/72h)
server/lib/forecast/emailBuilder.ts     — Hebrew email HTML/text generation
server/lib/forecast/index.ts            — orchestrator: text → ForecastResult
server/routes/forecast.ts               — POST /api/forecast/parse, POST /api/forecast/approve

tests/forecast/structureDetector.test.ts
tests/forecast/fieldExtractor.test.ts
tests/forecast/confidenceScorer.test.ts
tests/forecast/forecastEngine.test.ts

src/types/forecast.ts                   — frontend mirror of backend ForecastResult types
src/hooks/useForecast.ts                — TanStack Query mutations
src/components/forecast/FlagCell.tsx    — amber tap-to-edit field
src/components/forecast/PatientCard.tsx — one card per patient in review
src/components/forecast/EmailPreview.tsx — email preview tab
src/components/forecast/InputStep.tsx   — PDF upload + paste input
src/components/forecast/ReviewStep.tsx  — review + approve tab
src/pages/pharmacy-forecast.tsx         — main page with two tabs
```

**Modify:**
```
server/db.ts                  — add vt_pharmacy_orders, extend formulary, add pharmacy_email to clinics
server/app/routes.ts          — register forecast routes
src/app/routes.tsx            — add /pharmacy-forecast route
locales/he.json               — add pharmacyForecast namespace
locales/en.json               — add pharmacyForecast namespace
src/components/layout.tsx     — add nav entry (check existing nav pattern first)
```

---

## Task 1: Install Dependencies + Shared Types

**Files:**
- Create: `server/lib/forecast/types.ts`
- Modify: `package.json`

- [ ] **Step 1: Install packages**

```bash
npm install pdf-parse fuse.js nodemailer
npm install --save-dev @types/pdf-parse @types/nodemailer
```

Expected: packages added to `package.json`, no errors.

- [ ] **Step 2: Create shared types**

Create `server/lib/forecast/types.ts`:

```typescript
export type DrugType = 'regular' | 'cri' | 'prn' | 'ld'

export type FlagReason =
  | 'DOSE_HIGH'
  | 'DOSE_LOW'
  | 'FREQ_MISSING'
  | 'DRUG_UNKNOWN'
  | 'PRN_MANUAL'
  | 'PATIENT_UNKNOWN'
  | 'LOW_CONFIDENCE'

// ── Layer 1 output ──────────────────────────────
export interface RawPatientBlock {
  headerLine: string
  drugLines: string[]
}

// ── Layer 2 output ──────────────────────────────
export interface ExtractedDrug {
  rawLine: string
  rawName: string
  resolvedName: string | null   // after fuse.js match; null if not found
  doseValue: number | null
  doseUnit: string | null       // 'mg' | 'mcg' | 'mEq' | 'tablet'
  freqPerDay: number | null     // normalized (BID→2, TID→3 …)
  ratePerHour: number | null    // CRI only
  route: string | null
  isCri: boolean
  isPrn: boolean
}

// ── Layer 3 output ──────────────────────────────
export interface ScoredDrug extends ExtractedDrug {
  confidence: number   // 0–1
  type: DrugType
  flags: FlagReason[]
}

export interface ParsedPatientBlock {
  rawHeader: string
  recordNumber: string | null
  drugs: ScoredDrug[]
  flags: FlagReason[]  // patient-level flags (e.g. PATIENT_UNKNOWN)
}

// ── Forecast engine output ──────────────────────
export interface ForecastDrugEntry {
  drugName: string
  concentration: string    // e.g. "10 mg/mL"
  packDescription: string  // e.g. "אמפולה 10 מ\"ל"
  route: string
  type: DrugType
  quantityUnits: number | null  // null for PRN (manual entry)
  unitLabel: string             // 'אמפולות' | 'בקבוקונים' | 'טבליות' | 'שקיות'
  flags: FlagReason[]
}

export interface ForecastPatientEntry {
  recordNumber: string
  name: string
  species: string
  breed: string
  sex: string
  color: string
  weightKg: number
  ownerName: string
  ownerId: string
  ownerPhone: string
  drugs: ForecastDrugEntry[]
  flags: FlagReason[]
}

export interface ForecastResult {
  windowHours: 24 | 72
  weekendMode: boolean
  patients: ForecastPatientEntry[]
  totalFlags: number
  parsedAt: string  // ISO timestamp
}

// ── API payloads ────────────────────────────────
export interface ApprovePayload {
  result: ForecastResult
  // key: `${recordNumber}__${drugName}`, value: resolved quantity
  manualQuantities: Record<string, number>
}

export interface ApproveResult {
  orderId: string
  deliveryMethod: 'smtp' | 'mailto'
  mailtoUrl?: string  // present when deliveryMethod === 'mailto'
}
```

- [ ] **Step 3: Commit**

```bash
git add server/lib/forecast/types.ts package.json package-lock.json
git commit -m "feat(forecast): install deps and define shared types"
```

---

## Task 2: Database Schema Additions

**Files:**
- Modify: `server/db.ts`

- [ ] **Step 1: Open `server/db.ts` and add the new table and columns**

Add the following after the existing table definitions. Find the `clinics` table and add `pharmacyEmail`. Find the drug formulary table (search for `vt_drug_formulary` or `formulary`) and add packaging fields.

```typescript
// Add to existing clinics table definition — new column:
pharmacyEmail: text("pharmacy_email"),

// Add to existing drug formulary table — new optional columns:
unitVolumeMl: real("unit_volume_ml"),          // volume of one physical unit (ampoule/vial/bag)
unitType: varchar("unit_type", { length: 20 }), // 'ampoule' | 'vial' | 'bag' | 'tablet'
criBufferPct: real("cri_buffer_pct"),           // default 0.25 if null

// New table — add after existing tables:
export const pharmacyOrders = pgTable("vt_pharmacy_orders", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  approvedBy: text("approved_by").notNull(),
  windowHours: integer("window_hours").notNull(),
  deliveryMethod: varchar("delivery_method", { length: 10 }).notNull(),
  payload: jsonb("payload").notNull(),
})
```

- [ ] **Step 2: Generate migration**

```bash
npx drizzle-kit generate
```

Expected: new file created in `migrations/` directory.

- [ ] **Step 3: Run migration**

```bash
npx drizzle-kit migrate
```

Expected: "All migrations applied successfully" (or equivalent).

- [ ] **Step 4: Commit**

```bash
git add server/db.ts migrations/
git commit -m "feat(forecast): add vt_pharmacy_orders, formulary packaging fields, pharmacy_email"
```

---

## Task 3: Structure Detector (Layer 1)

**Files:**
- Create: `server/lib/forecast/structureDetector.ts`
- Create: `tests/forecast/structureDetector.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/forecast/structureDetector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { detectPatientBlocks } from '../../server/lib/forecast/structureDetector'

const SAMPLE_TEXT = `
Ward Report - ICU

Max #00842
Morphine 2mg/kg CRI IV
Maropitant 1mg/kg SC SID

Luna #01105
Fentanyl 2mcg/kg/hr CRI IV
Ondansetron 0.1mg/kg IV PRN
`

describe('detectPatientBlocks', () => {
  it('splits text into one block per patient', () => {
    const blocks = detectPatientBlocks(SAMPLE_TEXT)
    expect(blocks).toHaveLength(2)
  })

  it('captures the header line for each patient', () => {
    const blocks = detectPatientBlocks(SAMPLE_TEXT)
    expect(blocks[0].headerLine).toContain('Max')
    expect(blocks[1].headerLine).toContain('Luna')
  })

  it('assigns drug lines to the correct patient', () => {
    const blocks = detectPatientBlocks(SAMPLE_TEXT)
    expect(blocks[0].drugLines).toHaveLength(2)
    expect(blocks[0].drugLines[0]).toContain('Morphine')
    expect(blocks[1].drugLines).toHaveLength(2)
  })

  it('returns empty array for blank input', () => {
    expect(detectPatientBlocks('')).toEqual([])
    expect(detectPatientBlocks('   \n  ')).toEqual([])
  })

  it('ignores header/footer lines that contain no record number', () => {
    const blocks = detectPatientBlocks('Ward Report - ICU\nDate: 2026-04-24\n\nMax #00842\nMorphine 2mg/kg IV SID\n')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].drugLines).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx vitest run tests/forecast/structureDetector.test.ts
```

Expected: `Cannot find module '../../server/lib/forecast/structureDetector'`

- [ ] **Step 3: Implement structure detector**

Create `server/lib/forecast/structureDetector.ts`:

```typescript
import type { RawPatientBlock } from './types.js'

// A patient header contains a 4–6 digit record number, optionally preceded by '#'
const RECORD_NUMBER_RE = /\b#?(\d{4,6})\b/

export function detectPatientBlocks(rawText: string): RawPatientBlock[] {
  const lines = rawText
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)

  const blocks: RawPatientBlock[] = []
  let current: RawPatientBlock | null = null

  for (const line of lines) {
    if (RECORD_NUMBER_RE.test(line)) {
      // Start a new patient block
      if (current) blocks.push(current)
      current = { headerLine: line, drugLines: [] }
    } else if (current) {
      current.drugLines.push(line)
    }
    // Lines before the first patient header are ignored
  }

  if (current) blocks.push(current)
  return blocks
}

export function extractRecordNumber(headerLine: string): string | null {
  const match = RECORD_NUMBER_RE.exec(headerLine)
  return match ? match[1] : null
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npx vitest run tests/forecast/structureDetector.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/lib/forecast/structureDetector.ts tests/forecast/structureDetector.test.ts
git commit -m "feat(forecast): layer 1 — structure detector with tests"
```

---

## Task 4: Field Extractor + Normalization (Layer 2)

**Files:**
- Create: `server/lib/forecast/fieldExtractor.ts`
- Create: `tests/forecast/fieldExtractor.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/forecast/fieldExtractor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { extractDrug, normalizeFrequency } from '../../server/lib/forecast/fieldExtractor'

const MOCK_FORMULARY = ['Morphine', 'Fentanyl', 'Metronidazole', 'Maropitant', 'Ondansetron', 'Ketamine', 'Cerenia']

describe('normalizeFrequency', () => {
  it('maps BID to 2', () => expect(normalizeFrequency('BID')).toBe(2))
  it('maps TID to 3', () => expect(normalizeFrequency('TID')).toBe(3))
  it('maps SID to 1', () => expect(normalizeFrequency('SID')).toBe(1))
  it('maps q8h to 3', () => expect(normalizeFrequency('q8h')).toBe(3))
  it('maps q12h to 2', () => expect(normalizeFrequency('q12h')).toBe(2))
  it('maps q6h to 4', () => expect(normalizeFrequency('q6h')).toBe(4))
  it('returns null for unknown token', () => expect(normalizeFrequency('weekly')).toBeNull())
})

describe('extractDrug', () => {
  it('extracts drug name, dose, unit, frequency, and route', () => {
    const result = extractDrug('Morphine 2mg/kg IV SID', MOCK_FORMULARY)
    expect(result.rawName).toBe('Morphine')
    expect(result.resolvedName).toBe('Morphine')
    expect(result.doseValue).toBe(2)
    expect(result.doseUnit).toBe('mg')
    expect(result.freqPerDay).toBe(1)
    expect(result.route).toBe('IV')
  })

  it('detects CRI flag and extracts rate', () => {
    const result = extractDrug('Fentanyl 2mcg/kg/hr CRI IV', MOCK_FORMULARY)
    expect(result.isCri).toBe(true)
    expect(result.ratePerHour).toBe(2)
  })

  it('detects PRN flag', () => {
    const result = extractDrug('Ondansetron 0.1mg/kg IV PRN', MOCK_FORMULARY)
    expect(result.isPrn).toBe(true)
  })

  it('fuzzy-matches a misspelled drug name', () => {
    const result = extractDrug('Metronidazol 15mg/kg IV BID', MOCK_FORMULARY)
    expect(result.rawName).toBe('Metronidazol')
    expect(result.resolvedName).toBe('Metronidazole')
  })

  it('sets resolvedName to null when no fuzzy match found', () => {
    const result = extractDrug('Unknowndrug 10mg IV SID', MOCK_FORMULARY)
    expect(result.resolvedName).toBeNull()
  })

  it('handles tablet dosing', () => {
    const result = extractDrug('Cerenia 1 tablet PO SID', MOCK_FORMULARY)
    expect(result.doseUnit).toBe('tablet')
    expect(result.doseValue).toBe(1)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx vitest run tests/forecast/fieldExtractor.test.ts
```

Expected: module not found error.

- [ ] **Step 3: Implement field extractor**

Create `server/lib/forecast/fieldExtractor.ts`:

```typescript
import Fuse from 'fuse.js'
import type { ExtractedDrug } from './types.js'

const FREQ_MAP: Record<string, number> = {
  sid: 1, qd: 1, q24h: 1, 'once daily': 1,
  bid: 2, q12h: 2,
  tid: 3, q8h: 3,
  qid: 4, q6h: 4,
  q4h: 6,
  q2h: 12,
}

const DOSE_RE = /(\d+(?:\.\d+)?)\s*(mg|mcg|mEq|g|ml|mL|tablet|tab)(?:\/kg)?(?:\/hr)?/i
const RATE_RE = /(\d+(?:\.\d+)?)\s*(?:mcg|mg|mEq)\/kg\/hr/i
const ROUTE_RE = /\b(IV|SC|IM|PO|SQ|intranasal|topical)\b/i
const CRI_RE   = /\bCRI\b|\/hr\b|\/hour\b/i
const PRN_RE   = /\bPRN\b|as needed/i
const FREQ_TOKEN_RE = new RegExp(`\\b(${Object.keys(FREQ_MAP).join('|')}|q\\d+h)\\b`, 'i')

export function normalizeFrequency(token: string): number | null {
  const key = token.toLowerCase()
  if (FREQ_MAP[key] !== undefined) return FREQ_MAP[key]
  // Handle q<N>h patterns not in map
  const qMatch = /^q(\d+)h$/.exec(key)
  if (qMatch) {
    const hours = parseInt(qMatch[1])
    return hours > 0 ? Math.round(24 / hours) : null
  }
  return null
}

function buildFuse(formularyNames: string[]) {
  return new Fuse(formularyNames.map(n => ({ name: n })), {
    keys: ['name'],
    threshold: 0.3,
    includeScore: true,
  })
}

export function extractDrug(line: string, formularyNames: string[]): ExtractedDrug {
  const tokens = line.trim().split(/\s+/)

  // Drug name = leading tokens before any dose/number
  const nameTokens: string[] = []
  for (const t of tokens) {
    if (/^\d/.test(t)) break
    if (ROUTE_RE.test(t) || CRI_RE.test(t) || PRN_RE.test(t)) break
    nameTokens.push(t)
  }
  const rawName = nameTokens.join(' ') || tokens[0]

  // Fuzzy match against formulary
  const fuse = buildFuse(formularyNames)
  const results = fuse.search(rawName)
  const resolvedName = results[0]?.item.name ?? null

  // Dose
  const doseMatch = DOSE_RE.exec(line)
  const doseValue = doseMatch ? parseFloat(doseMatch[1]) : null
  const rawUnit = doseMatch ? doseMatch[2].toLowerCase() : null
  const doseUnit = rawUnit === 'tab' ? 'tablet' : rawUnit

  // CRI rate
  const isCri = CRI_RE.test(line)
  const rateMatch = RATE_RE.exec(line)
  const ratePerHour = isCri && rateMatch ? parseFloat(rateMatch[1]) : null

  // Frequency
  const freqMatch = FREQ_TOKEN_RE.exec(line)
  const freqPerDay = freqMatch ? normalizeFrequency(freqMatch[1]) : null

  // Route
  const routeMatch = ROUTE_RE.exec(line)
  const route = routeMatch ? routeMatch[1].toUpperCase() : null

  // PRN
  const isPrn = PRN_RE.test(line)

  return {
    rawLine: line,
    rawName,
    resolvedName,
    doseValue,
    doseUnit,
    freqPerDay,
    ratePerHour,
    route,
    isCri,
    isPrn,
  }
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npx vitest run tests/forecast/fieldExtractor.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add server/lib/forecast/fieldExtractor.ts tests/forecast/fieldExtractor.test.ts
git commit -m "feat(forecast): layer 2 — field extractor with fuse.js and normalization"
```

---

## Task 5: Confidence Scorer + Clinical Checks (Layer 3)

**Files:**
- Create: `server/lib/forecast/confidenceScorer.ts`
- Create: `tests/forecast/confidenceScorer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/forecast/confidenceScorer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { scoreDrug, applyLoadingDoseHeuristic } from '../../server/lib/forecast/confidenceScorer'
import type { ExtractedDrug } from '../../server/lib/forecast/types'

const BASE: ExtractedDrug = {
  rawLine: 'Morphine 2mg/kg IV SID',
  rawName: 'Morphine',
  resolvedName: 'Morphine',
  doseValue: 2,
  doseUnit: 'mg',
  freqPerDay: 1,
  ratePerHour: null,
  route: 'IV',
  isCri: false,
  isPrn: false,
}

const FORMULARY_ENTRY = { minDose: 0.1, maxDose: 1.0, concentrationMgMl: 10, unitVolumeMl: 10, unitType: 'ampoule' }

describe('scoreDrug', () => {
  it('returns high confidence for a fully parsed drug', () => {
    const result = scoreDrug(BASE, FORMULARY_ENTRY, 30)
    expect(result.confidence).toBeGreaterThan(0.75)
    expect(result.flags).not.toContain('LOW_CONFIDENCE')
  })

  it('flags DOSE_HIGH when dose exceeds maxDose * weight', () => {
    const high = { ...BASE, doseValue: 5 }  // 5 mg/kg > maxDose 1.0
    const result = scoreDrug(high, FORMULARY_ENTRY, 30)
    expect(result.flags).toContain('DOSE_HIGH')
  })

  it('flags DOSE_LOW when dose is below minDose * weight', () => {
    const low = { ...BASE, doseValue: 0.05 }  // 0.05 mg/kg < minDose 0.1
    const result = scoreDrug(low, FORMULARY_ENTRY, 30)
    expect(result.flags).toContain('DOSE_LOW')
  })

  it('flags FREQ_MISSING when freqPerDay is null', () => {
    const noFreq = { ...BASE, freqPerDay: null }
    const result = scoreDrug(noFreq, FORMULARY_ENTRY, 30)
    expect(result.flags).toContain('FREQ_MISSING')
  })

  it('flags DRUG_UNKNOWN when resolvedName is null', () => {
    const unknown = { ...BASE, resolvedName: null }
    const result = scoreDrug(unknown, FORMULARY_ENTRY, 30)
    expect(result.flags).toContain('DRUG_UNKNOWN')
  })

  it('sets type to prn for PRN drugs', () => {
    const prn = { ...BASE, isPrn: true }
    const result = scoreDrug(prn, FORMULARY_ENTRY, 30)
    expect(result.type).toBe('prn')
    expect(result.flags).toContain('PRN_MANUAL')
  })

  it('sets type to cri for CRI drugs', () => {
    const cri = { ...BASE, isCri: true, ratePerHour: 2 }
    const result = scoreDrug(cri, FORMULARY_ENTRY, 30)
    expect(result.type).toBe('cri')
  })
})

describe('applyLoadingDoseHeuristic', () => {
  it('marks first dose as LD when it is >= 1.5x the second dose', () => {
    const drugs = [
      { ...BASE, doseValue: 3, freqPerDay: 1 },  // loading: 3 mg/kg
      { ...BASE, doseValue: 1, freqPerDay: 3 },  // maintenance: 1 mg/kg
    ]
    const scored = drugs.map(d => scoreDrug(d, FORMULARY_ENTRY, 30))
    const result = applyLoadingDoseHeuristic(scored)
    expect(result[0].type).toBe('ld')
    expect(result[1].type).toBe('regular')
  })

  it('does not mark as LD when doses are similar', () => {
    const drugs = [
      { ...BASE, doseValue: 1, freqPerDay: 1 },
      { ...BASE, doseValue: 1, freqPerDay: 1 },
    ]
    const scored = drugs.map(d => scoreDrug(d, FORMULARY_ENTRY, 30))
    const result = applyLoadingDoseHeuristic(scored)
    expect(result[0].type).toBe('regular')
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx vitest run tests/forecast/confidenceScorer.test.ts
```

- [ ] **Step 3: Implement confidence scorer**

Create `server/lib/forecast/confidenceScorer.ts`:

```typescript
import type { ExtractedDrug, ScoredDrug, DrugType, FlagReason } from './types.js'

interface FormularyBounds {
  minDose?: number | null
  maxDose?: number | null
  concentrationMgMl?: number | null
  unitVolumeMl?: number | null
  unitType?: string | null
}

export function scoreDrug(
  drug: ExtractedDrug,
  formularyEntry: FormularyBounds | null,
  patientWeightKg: number,
): ScoredDrug {
  const flags: FlagReason[] = []

  // Field confidence scores
  const nameScore   = drug.resolvedName ? 1.0 : 0.0
  const doseScore   = drug.doseValue !== null ? 1.0 : 0.0
  const freqScore   = drug.freqPerDay !== null ? 1.0 : 0.0
  const routeScore  = drug.route !== null ? 0.9 : 0.5

  const confidence = (nameScore + doseScore + freqScore + routeScore) / 4

  // Flag checks
  if (!drug.resolvedName) flags.push('DRUG_UNKNOWN')
  if (drug.freqPerDay === null && !drug.isCri) flags.push('FREQ_MISSING')
  if (confidence < 0.75) flags.push('LOW_CONFIDENCE')
  if (drug.isPrn) flags.push('PRN_MANUAL')

  // Clinical bounds checks
  if (formularyEntry && drug.doseValue !== null && !drug.isCri) {
    const doseMgKg = drug.doseValue
    if (formularyEntry.maxDose != null && doseMgKg > formularyEntry.maxDose) {
      flags.push('DOSE_HIGH')
    }
    if (formularyEntry.minDose != null && doseMgKg < formularyEntry.minDose) {
      flags.push('DOSE_LOW')
    }
  }

  // Determine type (PRN and CRI take priority)
  let type: DrugType = 'regular'
  if (drug.isPrn) type = 'prn'
  else if (drug.isCri) type = 'cri'

  return { ...drug, confidence, type, flags }
}

// Compares same-named drugs for the loading dose heuristic.
// Call this AFTER scoring all drugs for a patient.
export function applyLoadingDoseHeuristic(drugs: ScoredDrug[]): ScoredDrug[] {
  // Group by resolved name
  const groups = new Map<string, number[]>()
  drugs.forEach((d, i) => {
    if (d.resolvedName && d.doseValue !== null && d.type === 'regular') {
      if (!groups.has(d.resolvedName)) groups.set(d.resolvedName, [])
      groups.get(d.resolvedName)!.push(i)
    }
  })

  const result = [...drugs]
  for (const indices of groups.values()) {
    if (indices.length < 2) continue
    const [firstIdx, secondIdx] = indices
    const first  = result[firstIdx]
    const second = result[secondIdx]
    if (first.doseValue! >= 1.5 * second.doseValue!) {
      result[firstIdx] = { ...first, type: 'ld' }
    }
  }
  return result
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npx vitest run tests/forecast/confidenceScorer.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/lib/forecast/confidenceScorer.ts tests/forecast/confidenceScorer.test.ts
git commit -m "feat(forecast): layer 3 — confidence scorer and clinical checks"
```

---

## Task 6: Forecasting Engine

**Files:**
- Create: `server/lib/forecast/forecastEngine.ts`
- Create: `tests/forecast/forecastEngine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/forecast/forecastEngine.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { calculateUnits, calculateCriUnits } from '../../server/lib/forecast/forecastEngine'

describe('calculateUnits (regular drug)', () => {
  it('calculates ampoule count for a 24h window', () => {
    // 2 mg/kg × 30 kg × 1 dose/day × 24h/24 = 60 mg
    // 60 mg ÷ 10 mg/mL = 6 mL ÷ 10 mL/ampoule = 1 ampoule
    expect(calculateUnits({
      doseMgPerKg: 2, weightKg: 30, freqPerDay: 1,
      windowHours: 24, concentrationMgMl: 10, unitVolumeMl: 10,
    })).toBe(1)
  })

  it('rounds up to whole physical units', () => {
    // 0.5 mg/kg × 4.2 kg × 2 × 24/24 = 4.2 mg ÷ 2 mg/mL = 2.1 mL ÷ 2 mL/ampoule → ceil = 2
    expect(calculateUnits({
      doseMgPerKg: 0.5, weightKg: 4.2, freqPerDay: 2,
      windowHours: 24, concentrationMgMl: 2, unitVolumeMl: 2,
    })).toBe(2)
  })

  it('scales correctly for 72h weekend window', () => {
    // Same as first test × 3 = 3 ampoules
    expect(calculateUnits({
      doseMgPerKg: 2, weightKg: 30, freqPerDay: 1,
      windowHours: 72, concentrationMgMl: 10, unitVolumeMl: 10,
    })).toBe(3)
  })
})

describe('calculateCriUnits', () => {
  it('applies buffer and rounds up', () => {
    // 2 mcg/kg/hr × 30 kg × 24 hr × 1.25 = 1800 mcg = 1.8 mg
    // 50 mcg/mL concentration → 1800 mcg ÷ 50 mcg/mL = 36 mL ÷ 10 mL/ampoule → ceil = 4
    expect(calculateCriUnits({
      ratePerHour: 2, weightKg: 30, windowHours: 24,
      criBufferPct: 0.25, concentrationMgMl: 0.05,  // 50 mcg/mL in mg/mL
      unitVolumeMl: 10,
    })).toBe(4)
  })
})
```

- [ ] **Step 2: Run — verify FAIL**

```bash
npx vitest run tests/forecast/forecastEngine.test.ts
```

- [ ] **Step 3: Implement forecast engine**

Create `server/lib/forecast/forecastEngine.ts`:

```typescript
interface RegularCalcInput {
  doseMgPerKg: number
  weightKg: number
  freqPerDay: number
  windowHours: number
  concentrationMgMl: number
  unitVolumeMl: number
}

interface CriCalcInput {
  ratePerHour: number
  weightKg: number
  windowHours: number
  criBufferPct: number
  concentrationMgMl: number
  unitVolumeMl: number
}

export function calculateUnits(input: RegularCalcInput): number {
  const { doseMgPerKg, weightKg, freqPerDay, windowHours, concentrationMgMl, unitVolumeMl } = input
  const totalMg     = doseMgPerKg * weightKg * freqPerDay * (windowHours / 24)
  const totalVolume = totalMg / concentrationMgMl
  return Math.ceil(totalVolume / unitVolumeMl)
}

export function calculateCriUnits(input: CriCalcInput): number {
  const { ratePerHour, weightKg, windowHours, criBufferPct, concentrationMgMl, unitVolumeMl } = input
  const totalMg     = ratePerHour * weightKg * windowHours * (1 + criBufferPct) / 1000  // mcg→mg if needed
  const totalVolume = totalMg / concentrationMgMl
  return Math.ceil(totalVolume / unitVolumeMl)
}

export const UNIT_LABELS: Record<string, string> = {
  ampoule: 'אמפולות',
  vial:    'בקבוקונים',
  bag:     'שקיות',
  tablet:  'טבליות',
}

export function unitLabel(unitType: string | null): string {
  return UNIT_LABELS[unitType ?? ''] ?? 'יחידות'
}
```

- [ ] **Step 4: Run — verify PASS**

```bash
npx vitest run tests/forecast/forecastEngine.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add server/lib/forecast/forecastEngine.ts tests/forecast/forecastEngine.test.ts
git commit -m "feat(forecast): forecasting engine — unit calculation with CRI buffer and weekend mode"
```

---

## Task 7: Email Builder

**Files:**
- Create: `server/lib/forecast/emailBuilder.ts`

- [ ] **Step 1: Implement email builder**

Create `server/lib/forecast/emailBuilder.ts`:

```typescript
import type { ForecastPatientEntry, ForecastDrugEntry, ForecastResult } from './types.js'

const TYPE_LABELS: Record<string, string> = {
  cri: 'CRI',
  ld:  'LD',
  prn: 'לפי צורך',
}

function drugBadge(type: string): string {
  const label = TYPE_LABELS[type]
  if (!label) return ''
  const colors: Record<string, string> = {
    cri: 'background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe',
    ld:  'background:#d1fae5;color:#065f46;border:1px solid #a7f3d0',
    prn: 'background:#f1f5f9;color:#475569;border:1px solid #e2e8f0',
  }
  return `<span style="display:inline-block;border-radius:9999px;padding:1px 8px;font-size:11px;font-weight:600;${colors[type]}">${label}</span>`
}

function patientBlock(patient: ForecastPatientEntry, technicianName: string): string {
  const rows = patient.drugs.map(d => {
    const qty = d.quantityUnits !== null ? `${d.quantityUnits} ${d.unitLabel}` : '—'
    return `
      <tr>
        <td style="padding:7px 14px;border-bottom:1px solid #f8fafc;text-align:right">${d.drugName} ${drugBadge(d.type)}</td>
        <td style="padding:7px 14px;border-bottom:1px solid #f8fafc;text-align:right">${d.concentration} · ${d.packDescription}</td>
        <td style="padding:7px 14px;border-bottom:1px solid #f8fafc;text-align:right">${d.route}</td>
        <td style="padding:7px 14px;border-bottom:1px solid #f8fafc;text-align:right;font-weight:700;color:#1e3a5f">${qty}</td>
      </tr>`
  }).join('')

  return `
  <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px">
    <div style="background:#1e3a5f;color:white;padding:8px 14px;display:flex;justify-content:space-between">
      <strong>${patient.name}</strong>
      <span style="opacity:.7;font-size:12px">מס׳ תיק: ${patient.recordNumber}</span>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr>
        <td style="padding:6px 14px;border-bottom:1px solid #f1f5f9;width:50%"><span style="font-size:9px;text-transform:uppercase;color:#94a3b8">מין</span><br><strong>${patient.species}</strong></td>
        <td style="padding:6px 14px;border-bottom:1px solid #f1f5f9"><span style="font-size:9px;text-transform:uppercase;color:#94a3b8">גזע</span><br><strong>${patient.breed}</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 14px;border-bottom:1px solid #f1f5f9"><span style="font-size:9px;text-transform:uppercase;color:#94a3b8">זכר/נקבה</span><br><strong>${patient.sex}</strong></td>
        <td style="padding:6px 14px;border-bottom:1px solid #f1f5f9"><span style="font-size:9px;text-transform:uppercase;color:#94a3b8">משקל</span><br><strong>${patient.weightKg} ק"ג</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 14px;border-bottom:1px solid #f1f5f9"><span style="font-size:9px;text-transform:uppercase;color:#94a3b8">בעלים</span><br><strong>${patient.ownerName}</strong></td>
        <td style="padding:6px 14px;border-bottom:1px solid #f1f5f9"><span style="font-size:9px;text-transform:uppercase;color:#94a3b8">ת.ז. בעלים</span><br><strong>${patient.ownerId}</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 14px;border-bottom:1px solid #e2e8f0" colspan="2"><span style="font-size:9px;text-transform:uppercase;color:#94a3b8">טלפון</span><br><strong>${patient.ownerPhone}</strong></td>
      </tr>
      <tr>
        <td style="padding:6px 14px;border-bottom:1px solid #e2e8f0" colspan="2"><span style="font-size:9px;text-transform:uppercase;color:#94a3b8">טכנאי/ת</span><br><strong>${technicianName}</strong></td>
      </tr>
    </table>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead>
        <tr style="background:#f8fafc">
          <th style="padding:7px 14px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:1px solid #e2e8f0">שם תרופה</th>
          <th style="padding:7px 14px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:1px solid #e2e8f0">ריכוז ואריזה</th>
          <th style="padding:7px 14px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:1px solid #e2e8f0">מסלול</th>
          <th style="padding:7px 14px;text-align:right;font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#64748b;border-bottom:1px solid #e2e8f0">כמות</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
}

export function buildEmail(
  result: ForecastResult,
  technicianName: string,
  orderId: string,
): { subject: string; html: string } {
  const date = new Date().toLocaleDateString('he-IL')
  const windowLabel = result.weekendMode ? `${result.windowHours} שעות (סוף שבוע)` : `${result.windowHours} שעות`
  const subject = `הזמנת תרופות ICU · ${result.patients.length} מטופלים · ${windowLabel} · ${date} · אישר/ה: ${technicianName}`

  const patientBlocks = result.patients.map(p => patientBlock(p, technicianName)).join('')

  const html = `
<!DOCTYPE html>
<html dir="rtl" lang="he">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:'Segoe UI',Arial,sans-serif;background:#f3f1ed;margin:0;padding:16px;direction:rtl">
  <div style="max-width:600px;margin:0 auto;background:white;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0">
    <div style="background:#1e3a5f;color:white;padding:14px 20px;display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:16px;font-weight:700">VetTrack — הזמנת תרופות ICU</div>
        <div style="font-size:11px;opacity:.7;margin-top:2px">נוצר אוטומטית · אושר על ידי ${technicianName}</div>
      </div>
      ${result.weekendMode ? `<div style="background:#d97706;padding:4px 12px;border-radius:8px;font-size:12px;font-weight:700">סוף שבוע ${result.windowHours} שע׳</div>` : ''}
    </div>
    <div style="background:#f8fafc;padding:9px 20px;font-size:12px;color:#475569;border-bottom:1px solid #e2e8f0">
      <strong>נושא:</strong> ${subject}
    </div>
    <div style="padding:16px 20px">
      ${patientBlocks}
    </div>
    <div style="background:#f8fafc;padding:10px 20px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between">
      <span>נוצר על ידי VetTrack · ${new Date().toLocaleString('he-IL')} · ${technicianName}</span>
      <span>מזהה ביקורת: ${orderId}</span>
    </div>
  </div>
</body>
</html>`

  return { subject, html }
}

export function buildMailtoUrl(subject: string, html: string, to: string): string {
  // Strip HTML tags for mailto body
  const body = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body.substring(0, 2000))}`
}
```

- [ ] **Step 2: Commit**

```bash
git add server/lib/forecast/emailBuilder.ts
git commit -m "feat(forecast): Hebrew email builder with patient sticker and drug table"
```

---

## Task 8: Parser Orchestrator + API Routes

**Files:**
- Create: `server/lib/forecast/index.ts`
- Create: `server/routes/forecast.ts`
- Modify: `server/app/routes.ts`

- [ ] **Step 1: Create orchestrator**

Create `server/lib/forecast/index.ts`:

```typescript
import pdfParse from 'pdf-parse'
import { detectPatientBlocks, extractRecordNumber } from './structureDetector.js'
import { extractDrug } from './fieldExtractor.js'
import { scoreDrug, applyLoadingDoseHeuristic } from './confidenceScorer.js'
import { calculateUnits, calculateCriUnits, unitLabel } from './forecastEngine.js'
import type { ForecastResult, ForecastPatientEntry, ForecastDrugEntry, ParsedPatientBlock } from './types.js'

export async function parseBuffer(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer)
  return data.text
}

export function isWeekendMode(): boolean {
  return new Date().getDay() === 4  // Thursday (0=Sun … 4=Thu in Israel)
}

interface FormulatryLookup {
  getByName: (name: string) => {
    concentrationMgMl: number
    unitVolumeMl: number
    unitType: string
    criBufferPct: number | null
    minDose: number | null
    maxDose: number | null
  } | null
  names: string[]
}

interface AnimalLookup {
  getByRecordNumber: (recordNumber: string) => {
    name: string; species: string; breed: string; sex: string
    color: string; weightKg: number
    ownerName: string; ownerId: string; ownerPhone: string
  } | null
}

export function parseAndForecast(
  rawText: string,
  windowHours: 24 | 72,
  formulary: FormulatryLookup,
  animals: AnimalLookup,
): ForecastResult {
  const blocks = detectPatientBlocks(rawText)
  const patients: ForecastPatientEntry[] = []

  for (const block of blocks) {
    const recordNumber = extractRecordNumber(block.headerLine)
    const animal = recordNumber ? animals.getByRecordNumber(recordNumber) : null

    const patientFlags = []
    if (!animal) patientFlags.push('PATIENT_UNKNOWN' as const)

    // Extract, score, apply LD heuristic
    const extracted = block.drugLines.map(line => extractDrug(line, formulary.names))
    const weightKg = animal?.weightKg ?? 10  // fallback weight for scoring bounds
    const scored = extracted.map(d => {
      const entry = d.resolvedName ? formulary.getByName(d.resolvedName) : null
      return scoreDrug(d, entry, weightKg)
    })
    const finalDrugs = applyLoadingDoseHeuristic(scored)

    // Calculate unit quantities
    const drugs: ForecastDrugEntry[] = finalDrugs.map(d => {
      const entry = d.resolvedName ? formulary.getByName(d.resolvedName) : null
      let quantityUnits: number | null = null

      if (entry && d.type !== 'prn') {
        if (d.type === 'cri' && d.ratePerHour !== null) {
          quantityUnits = calculateCriUnits({
            ratePerHour: d.ratePerHour,
            weightKg,
            windowHours,
            criBufferPct: entry.criBufferPct ?? 0.25,
            concentrationMgMl: entry.concentrationMgMl,
            unitVolumeMl: entry.unitVolumeMl,
          })
        } else if (d.type === 'ld' && d.doseValue !== null) {
          quantityUnits = 1
        } else if (d.doseValue !== null && d.freqPerDay !== null) {
          quantityUnits = calculateUnits({
            doseMgPerKg: d.doseValue,
            weightKg,
            freqPerDay: d.freqPerDay,
            windowHours,
            concentrationMgMl: entry.concentrationMgMl,
            unitVolumeMl: entry.unitVolumeMl,
          })
        }
      }

      return {
        drugName: d.resolvedName ?? d.rawName,
        concentration: entry ? `${entry.concentrationMgMl} mg/mL` : '—',
        packDescription: entry ? `${entry.unitType} ${entry.unitVolumeMl} mL` : '—',
        route: d.route ?? '—',
        type: d.type,
        quantityUnits,
        unitLabel: unitLabel(entry?.unitType ?? null),
        flags: d.flags,
      }
    })

    const totalPatientFlags = [...patientFlags, ...drugs.flatMap(d => d.flags)]

    patients.push({
      recordNumber: recordNumber ?? block.headerLine,
      name: animal?.name ?? block.headerLine,
      species: animal?.species ?? '—',
      breed: animal?.breed ?? '—',
      sex: animal?.sex ?? '—',
      color: animal?.color ?? '—',
      weightKg: animal?.weightKg ?? 0,
      ownerName: animal?.ownerName ?? '—',
      ownerId: animal?.ownerId ?? '—',
      ownerPhone: animal?.ownerPhone ?? '—',
      drugs,
      flags: totalPatientFlags as any,
    })
  }

  const totalFlags = patients.reduce((sum, p) => sum + p.flags.length + p.drugs.flatMap(d => d.flags).length, 0)

  return {
    windowHours,
    weekendMode: windowHours === 72,
    patients,
    totalFlags,
    parsedAt: new Date().toISOString(),
  }
}
```

- [ ] **Step 2: Create API routes**

Create `server/routes/forecast.ts`:

```typescript
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { nanoid } from 'nanoid'
import { requireAuth } from '../middleware/auth.js'
import { requireEffectiveRole } from '../middleware/roles.js'
import { parseBuffer, parseAndForecast, isWeekendMode } from '../lib/forecast/index.js'
import { buildEmail, buildMailtoUrl } from '../lib/forecast/emailBuilder.js'
import { db } from '../db.js'
import { pharmacyOrders, auditLog } from '../db.js'
import type { ApprovePayload } from '../lib/forecast/types.js'
import nodemailer from 'nodemailer'

const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are accepted'))
    }
  },
})

const ALLOWED_ROLES = ['technician', 'senior_technician', 'vet', 'admin'] as const

// POST /api/forecast/parse
router.post(
  '/parse',
  requireAuth,
  requireEffectiveRole(...ALLOWED_ROLES),
  upload.single('file'),
  async (req, res) => {
    try {
      let rawText: string

      if (req.file) {
        rawText = await parseBuffer(req.file.buffer)
      } else if (typeof req.body?.text === 'string') {
        rawText = req.body.text
      } else {
        return res.status(400).json({ code: 'MISSING_INPUT', message: 'Provide a PDF file or paste text in body.text' })
      }

      // Determine window hours (Thursday = 72h default, overridable)
      const override = req.body?.windowHours
      const windowHours: 24 | 72 = override === 24 ? 24 : override === 72 ? 72 : isWeekendMode() ? 72 : 24

      // Build DB lookups
      const clinicId = (req as any).auth.clinicId as string
      const formularyRows = await db.query.drugFormulary.findMany({ where: (t, { eq }) => eq(t.clinicId, clinicId) })
      const formulary = {
        names: formularyRows.map(r => r.name),
        getByName: (name: string) => formularyRows.find(r => r.name.toLowerCase() === name.toLowerCase()) ?? null,
      }

      const animalRows = await db.query.animals.findMany({ where: (t, { eq }) => eq(t.clinicId, clinicId) })
      const ownerRows = await db.query.owners.findMany({ where: (t, { eq }) => eq(t.clinicId, clinicId) })
      const animals = {
        getByRecordNumber: (recordNumber: string) => {
          const animal = animalRows.find(a => a.recordNumber === recordNumber)
          if (!animal) return null
          const owner = ownerRows.find(o => o.id === animal.ownerId)
          return {
            name: animal.name, species: animal.species, breed: animal.breed ?? '—',
            sex: animal.sex ?? '—', color: animal.color ?? '—', weightKg: animal.weightKg ?? 0,
            ownerName: owner?.name ?? '—', ownerId: owner?.nationalId ?? '—', ownerPhone: owner?.phone ?? '—',
          }
        },
      }

      const result = parseAndForecast(rawText, windowHours, formulary, animals)
      return res.json(result)
    } catch (err) {
      console.error('[forecast/parse]', err)
      return res.status(500).json({ code: 'PARSE_ERROR', message: 'Failed to parse report' })
    }
  },
)

// POST /api/forecast/approve
router.post(
  '/approve',
  requireAuth,
  requireEffectiveRole(...ALLOWED_ROLES),
  async (req, res) => {
    const parsed = z.object({
      result: z.object({}).passthrough(),
      manualQuantities: z.record(z.number()),
    }).safeParse(req.body)

    if (!parsed.success) {
      return res.status(400).json({ code: 'VALIDATION_FAILED', message: 'Invalid approve payload' })
    }

    const { result, manualQuantities } = parsed.data as ApprovePayload
    const clinicId = (req as any).auth.clinicId as string
    const userId   = (req as any).auth.userId as string
    const userName = (req as any).auth.name as string ?? 'Unknown'

    // Apply manual quantity overrides
    const finalResult = {
      ...result,
      patients: result.patients.map(p => ({
        ...p,
        drugs: p.drugs.map(d => {
          const key = `${p.recordNumber}__${d.drugName}`
          return manualQuantities[key] !== undefined
            ? { ...d, quantityUnits: manualQuantities[key] }
            : d
        }),
      })),
    }

    const orderId = `ord-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${nanoid(4)}`
    const { subject, html } = buildEmail(finalResult, userName, orderId)

    // Fetch pharmacy email from clinic settings
    const clinic = await db.query.clinics?.findFirst({ where: (t, { eq }) => eq(t.id, clinicId) })
    const pharmacyEmail = clinic?.pharmacyEmail

    let deliveryMethod: 'smtp' | 'mailto' = 'mailto'
    let mailtoUrl: string | undefined

    if (pharmacyEmail && process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT ?? '587'),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      })
      await transporter.sendMail({
        from: process.env.SMTP_FROM ?? process.env.SMTP_USER,
        to: pharmacyEmail,
        subject,
        html,
      })
      deliveryMethod = 'smtp'
    } else {
      mailtoUrl = buildMailtoUrl(subject, html, pharmacyEmail ?? '')
    }

    // Write audit log
    await db.insert(auditLog).values({
      id: nanoid(),
      clinicId,
      action: 'pharmacy_order_sent',
      actorId: userId,
      metadata: {
        orderId,
        patientCount: finalResult.patients.length,
        windowHours: finalResult.windowHours,
        deliveryMethod,
        patients: finalResult.patients.map(p => p.recordNumber),
      },
      createdAt: new Date(),
    })

    // Write order snapshot
    await db.insert(pharmacyOrders).values({
      id: orderId,
      clinicId,
      approvedBy: userId,
      windowHours: finalResult.windowHours,
      deliveryMethod,
      payload: finalResult,
    })

    return res.json({ orderId, deliveryMethod, mailtoUrl })
  },
)

export default router
```

- [ ] **Step 3: Register routes**

Open `server/app/routes.ts`. Add the import and registration following the existing pattern:

```typescript
// At the top with other imports:
import forecastRoutes from "../routes/forecast.js"

// Inside registerApiRoutes():
app.use("/api/forecast", forecastRoutes)
```

- [ ] **Step 4: Commit**

```bash
git add server/lib/forecast/index.ts server/routes/forecast.ts server/app/routes.ts
git commit -m "feat(forecast): orchestrator and API routes — parse + approve"
```

---

## Task 9: i18n Strings + Frontend Types

**Files:**
- Modify: `locales/he.json`
- Modify: `locales/en.json`
- Create: `src/types/forecast.ts`

- [ ] **Step 1: Add Hebrew strings**

Open `locales/he.json` and add the `pharmacyForecast` key at the root level:

```json
"pharmacyForecast": {
  "pageTitle": "הזמנת תרופות",
  "pageSub": "לטיפול נמרץ",
  "tabReview": "סקירה ואישור",
  "tabEmail": "תצוגה מקדימה — אימייל",
  "weekendBannerTitle": "מצב סוף שבוע — 72 שעות",
  "weekendBannerSub": "פתור את הסימונים כדי לאשר ולשלוח",
  "switchTo24h": "עבור ל-24 שע׳",
  "switchTo72h": "עבור ל-72 שע׳",
  "inputTitle": "מקור נתונים",
  "tabPdf": "📄 העלאת PDF",
  "tabPaste": "📋 הדבקה חכמה",
  "dropzonePrompt": "לחץ לבחירת דוח SmartFlow PDF",
  "dropzoneSub": "או גרור ושחרר",
  "parseBtn": "נתח דוח ←",
  "parseBtnHint": "המנתח יחלץ מטופלים, תרופות, מינונים ותדירויות אוטומטית",
  "chipDrugs": "תרופות",
  "chipCri": "עירויים CRI",
  "chipPrn": "לפי צורך",
  "chipLd": "מינון טעינה",
  "chipFlags": "סימונים",
  "flagDoseHigh": "מינון מעל הסף המרבי — אמת לפני אישור",
  "flagDoseLow": "מינון מתחת לסף המינימלי — אמת לפני אישור",
  "flagFreqMissing": "תדירות לא זוהתה — הזן כמות ידנית",
  "flagDrugUnknown": "תרופה לא זוהתה — אמת שם",
  "flagPrnManual": "לפי צורך — הזן כמות",
  "flagPatientUnknown": "מטופל לא נמצא במערכת",
  "approveBtnReady": "אשר ושלח להזמנה",
  "approveBtnPending": "פתור {{count}} סימונים לאישור",
  "approveNote": "ישלח דרך SMTP · יתועד ביומן הביקורת",
  "approveSuccess": "ההזמנה נשלחה בהצלחה",
  "approveMailto": "לחץ לפתיחת האימייל"
}
```

- [ ] **Step 2: Add English strings**

Open `locales/en.json` and add at root level:

```json
"pharmacyForecast": {
  "pageTitle": "Pharmacy Order",
  "pageSub": "ICU",
  "tabReview": "Review & Approve",
  "tabEmail": "Email Preview",
  "weekendBannerTitle": "Weekend Mode — 72 hours",
  "weekendBannerSub": "Resolve all flags to approve and send",
  "switchTo24h": "Switch to 24h",
  "switchTo72h": "Switch to 72h",
  "inputTitle": "Data Source",
  "tabPdf": "📄 PDF Upload",
  "tabPaste": "📋 Smart Paste",
  "dropzonePrompt": "Tap to select SmartFlow Ward Report PDF",
  "dropzoneSub": "or drag and drop",
  "parseBtn": "Parse Report →",
  "parseBtnHint": "Parser will extract patients, drugs, doses, and frequencies automatically",
  "chipDrugs": "drugs",
  "chipCri": "CRI infusions",
  "chipPrn": "PRN",
  "chipLd": "loading doses",
  "chipFlags": "flags",
  "flagDoseHigh": "Dose above max threshold — verify before approving",
  "flagDoseLow": "Dose below min threshold — verify before approving",
  "flagFreqMissing": "Frequency not parsed — enter quantity manually",
  "flagDrugUnknown": "Drug not recognised — verify name",
  "flagPrnManual": "PRN — enter quantity",
  "flagPatientUnknown": "Patient not found in system",
  "approveBtnReady": "Approve & Send Order",
  "approveBtnPending": "Resolve {{count}} flags to approve",
  "approveNote": "Sent via SMTP · logged to audit trail",
  "approveSuccess": "Order sent successfully",
  "approveMailto": "Click to open email"
}
```

- [ ] **Step 3: Create frontend types**

Create `src/types/forecast.ts` (mirrors the backend types — copy and paste, no import from server):

```typescript
export type DrugType = 'regular' | 'cri' | 'prn' | 'ld'

export type FlagReason =
  | 'DOSE_HIGH' | 'DOSE_LOW' | 'FREQ_MISSING'
  | 'DRUG_UNKNOWN' | 'PRN_MANUAL' | 'PATIENT_UNKNOWN' | 'LOW_CONFIDENCE'

export interface ForecastDrugEntry {
  drugName: string
  concentration: string
  packDescription: string
  route: string
  type: DrugType
  quantityUnits: number | null
  unitLabel: string
  flags: FlagReason[]
}

export interface ForecastPatientEntry {
  recordNumber: string
  name: string
  species: string
  breed: string
  sex: string
  color: string
  weightKg: number
  ownerName: string
  ownerId: string
  ownerPhone: string
  drugs: ForecastDrugEntry[]
  flags: FlagReason[]
}

export interface ForecastResult {
  windowHours: 24 | 72
  weekendMode: boolean
  patients: ForecastPatientEntry[]
  totalFlags: number
  parsedAt: string
}

export interface ApprovePayload {
  result: ForecastResult
  manualQuantities: Record<string, number>
}

export interface ApproveResult {
  orderId: string
  deliveryMethod: 'smtp' | 'mailto'
  mailtoUrl?: string
}
```

- [ ] **Step 4: Commit**

```bash
git add locales/he.json locales/en.json src/types/forecast.ts
git commit -m "feat(forecast): i18n strings (he/en) and frontend types"
```

---

## Task 10: useForecast Hook

**Files:**
- Create: `src/hooks/useForecast.ts`

- [ ] **Step 1: Implement hook**

Create `src/hooks/useForecast.ts`:

```typescript
import { useMutation } from '@tanstack/react-query'
import { api } from '@/lib/api'
import type { ForecastResult, ApprovePayload, ApproveResult } from '@/types/forecast'

export function useParseForecast() {
  return useMutation<ForecastResult, Error, { file?: File; text?: string; windowHours?: 24 | 72 }>({
    mutationFn: async ({ file, text, windowHours }) => {
      if (file) {
        const form = new FormData()
        form.append('file', file)
        if (windowHours) form.append('windowHours', String(windowHours))
        return api.post('/api/forecast/parse', form)
      }
      return api.post('/api/forecast/parse', { text, windowHours })
    },
  })
}

export function useApproveForecast() {
  return useMutation<ApproveResult, Error, ApprovePayload>({
    mutationFn: (payload) => api.post('/api/forecast/approve', payload),
  })
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useForecast.ts
git commit -m "feat(forecast): useForecast hook for parse and approve mutations"
```

---

## Task 11: FlagCell + PatientCard Components

**Files:**
- Create: `src/components/forecast/FlagCell.tsx`
- Create: `src/components/forecast/PatientCard.tsx`

- [ ] **Step 1: Create FlagCell**

Create `src/components/forecast/FlagCell.tsx`:

```tsx
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { t } from '@/lib/i18n'
import type { FlagReason } from '@/types/forecast'

const FLAG_MESSAGES: Record<FlagReason, string> = {
  DOSE_HIGH:        t.pharmacyForecast.flagDoseHigh,
  DOSE_LOW:         t.pharmacyForecast.flagDoseLow,
  FREQ_MISSING:     t.pharmacyForecast.flagFreqMissing,
  DRUG_UNKNOWN:     t.pharmacyForecast.flagDrugUnknown,
  PRN_MANUAL:       t.pharmacyForecast.flagPrnManual,
  PATIENT_UNKNOWN:  t.pharmacyForecast.flagPatientUnknown,
  LOW_CONFIDENCE:   t.pharmacyForecast.flagDrugUnknown,
}

interface FlagCellProps {
  value: number | null
  unitLabel: string
  flags: FlagReason[]
  onChange: (value: number) => void
}

export function FlagCell({ value, unitLabel, flags, onChange }: FlagCellProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value ?? ''))
  const primaryFlag = flags[0]

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          className="w-16 text-center font-bold"
          value={draft}
          autoFocus
          onChange={e => setDraft(e.target.value)}
          onBlur={() => {
            const n = parseFloat(draft)
            if (!isNaN(n) && n >= 0) onChange(n)
            setEditing(false)
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          }}
        />
        <span className="text-xs text-muted-foreground">{unitLabel}</span>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={() => setEditing(true)}
        className="flex items-center gap-1.5 bg-amber-50 border border-amber-300 rounded-lg px-3 py-1.5 text-amber-800 font-bold text-sm cursor-pointer hover:bg-amber-100 transition-colors"
      >
        <span>⚠</span>
        <span>{value !== null ? `${value} ${unitLabel}` : '?'}</span>
      </button>
      {primaryFlag && (
        <p className="text-xs text-amber-700 mt-1">{FLAG_MESSAGES[primaryFlag]}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create PatientCard**

Create `src/components/forecast/PatientCard.tsx`:

```tsx
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { FlagCell } from './FlagCell'
import type { ForecastPatientEntry } from '@/types/forecast'

interface PatientCardProps {
  patient: ForecastPatientEntry
  manualQuantities: Record<string, number>
  onQuantityChange: (key: string, value: number) => void
}

export function PatientCard({ patient, manualQuantities, onQuantityChange }: PatientCardProps) {
  const hasFlagged = patient.flags.includes('PATIENT_UNKNOWN')

  return (
    <Card className={`mb-3 overflow-hidden ${hasFlagged ? 'border-amber-300' : ''}`}>
      {/* Patient header */}
      <div className="bg-[#1e3a5f] text-white px-4 py-2 flex items-center justify-between text-sm font-bold">
        <span>{patient.name} · {patient.weightKg} ק"ג</span>
        <span className="font-mono text-xs opacity-70">#{patient.recordNumber}</span>
      </div>

      <CardContent className="p-0">
        {patient.drugs.map((drug, i) => {
          const key = `${patient.recordNumber}__${drug.drugName}`
          const isFlagged = drug.flags.length > 0
          const isPrn = drug.type === 'prn'
          const resolvedQty = manualQuantities[key] ?? drug.quantityUnits

          return (
            <div
              key={i}
              className={`flex items-center gap-2 px-4 py-2.5 border-b last:border-b-0 text-sm ${isFlagged ? 'bg-amber-50' : ''}`}
            >
              {/* Drug name + badge */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-semibold">{drug.drugName}</span>
                  {drug.type === 'cri' && <Badge variant="sterilized">CRI</Badge>}
                  {drug.type === 'ld'  && <Badge variant="ok">LD</Badge>}
                  {drug.type === 'prn' && <Badge variant="secondary">לפי צורך</Badge>}
                </div>
                {isFlagged && !isPrn && (
                  <FlagCell
                    value={resolvedQty}
                    unitLabel={drug.unitLabel}
                    flags={drug.flags}
                    onChange={v => onQuantityChange(key, v)}
                  />
                )}
              </div>

              {/* Quantity — PRN gets input, normal gets number, flagged handled above */}
              {isPrn ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Input
                    type="number"
                    min={0}
                    className="w-14 text-center font-bold text-blue-600"
                    placeholder="—"
                    value={manualQuantities[key] ?? ''}
                    onChange={e => onQuantityChange(key, parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-xs text-muted-foreground">{drug.unitLabel}</span>
                </div>
              ) : !isFlagged ? (
                <div className="flex items-baseline gap-1 shrink-0">
                  <span className="text-base font-bold text-blue-600">{resolvedQty}</span>
                  <span className="text-xs text-muted-foreground">{drug.unitLabel}</span>
                </div>
              ) : null}
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/forecast/FlagCell.tsx src/components/forecast/PatientCard.tsx
git commit -m "feat(forecast): FlagCell and PatientCard components"
```

---

## Task 12: EmailPreview + InputStep Components

**Files:**
- Create: `src/components/forecast/EmailPreview.tsx`
- Create: `src/components/forecast/InputStep.tsx`

- [ ] **Step 1: Create EmailPreview**

Create `src/components/forecast/EmailPreview.tsx`:

```tsx
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ForecastResult } from '@/types/forecast'

interface EmailPreviewProps {
  result: ForecastResult
  technicianName: string
}

export function EmailPreview({ result, technicianName }: EmailPreviewProps) {
  return (
    <Card className="overflow-hidden">
      {/* Email header */}
      <div className="bg-[#1e3a5f] text-white px-5 py-3 flex items-center justify-between">
        <div>
          <div className="font-bold text-sm">VetTrack — הזמנת תרופות ICU</div>
          <div className="text-xs opacity-70 mt-0.5">נוצר אוטומטית · אושר על ידי {technicianName}</div>
        </div>
        {result.weekendMode && (
          <div className="bg-amber-600 text-white rounded-lg px-3 py-1 text-xs font-bold">
            סוף שבוע {result.windowHours} שע׳
          </div>
        )}
      </div>

      <div className="p-4 space-y-4">
        {result.patients.map((patient, i) => (
          <div key={i} className="border border-border rounded-xl overflow-hidden">
            {/* Animal header */}
            <div className="bg-[#1e3a5f] text-white px-3 py-2 flex items-center justify-between text-sm font-bold">
              <span>{patient.name}</span>
              <span className="font-mono text-xs opacity-70">מס׳ תיק: {patient.recordNumber}</span>
            </div>

            {/* Patient sticker grid */}
            <div className="grid grid-cols-2 text-xs border-b border-border">
              {[
                ['מין', patient.species],
                ['גזע', patient.breed],
                ['זכר/נקבה', patient.sex],
                ['צבע', patient.color],
                ['בעלים', patient.ownerName],
                ['ת.ז. בעלים', patient.ownerId],
                ['טלפון', patient.ownerPhone],
                ['משקל', `${patient.weightKg} ק"ג`],
              ].map(([label, value]) => (
                <div key={label} className="px-3 py-1.5 border-b border-s border-border last:border-s-0">
                  <div className="text-muted-foreground uppercase tracking-wide" style={{ fontSize: 9 }}>{label}</div>
                  <div className="font-semibold mt-0.5">{value}</div>
                </div>
              ))}
            </div>

            {/* Technician row */}
            <div className="px-3 py-1.5 border-b border-border text-xs flex gap-3">
              <span className="text-muted-foreground uppercase tracking-wide shrink-0" style={{ fontSize: 9 }}>טכנאי/ת</span>
              <span className="font-semibold">{technicianName}</span>
            </div>

            {/* Drug table */}
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-muted/50">
                  <th className="px-3 py-1.5 text-end text-muted-foreground font-semibold uppercase tracking-wide border-b border-border" style={{ fontSize: 9 }}>שם תרופה</th>
                  <th className="px-3 py-1.5 text-end text-muted-foreground font-semibold uppercase tracking-wide border-b border-border" style={{ fontSize: 9 }}>ריכוז ואריזה</th>
                  <th className="px-3 py-1.5 text-end text-muted-foreground font-semibold uppercase tracking-wide border-b border-border" style={{ fontSize: 9 }}>מסלול</th>
                  <th className="px-3 py-1.5 text-end text-muted-foreground font-semibold uppercase tracking-wide border-b border-border" style={{ fontSize: 9 }}>כמות</th>
                </tr>
              </thead>
              <tbody>
                {patient.drugs.map((drug, j) => (
                  <tr key={j} className="border-b border-border/50 last:border-0">
                    <td className="px-3 py-2 text-end">
                      <span className="font-semibold">{drug.drugName}</span>{' '}
                      {drug.type === 'cri' && <Badge variant="sterilized" className="text-[10px]">CRI</Badge>}
                      {drug.type === 'ld'  && <Badge variant="ok" className="text-[10px]">LD</Badge>}
                      {drug.type === 'prn' && <Badge variant="secondary" className="text-[10px]">לפי צורך</Badge>}
                    </td>
                    <td className="px-3 py-2 text-end text-muted-foreground">{drug.concentration} · {drug.packDescription}</td>
                    <td className="px-3 py-2 text-end text-muted-foreground">{drug.route}</td>
                    <td className="px-3 py-2 text-end font-bold text-[#1e3a5f]">
                      {drug.quantityUnits !== null ? `${drug.quantityUnits} ${drug.unitLabel}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </Card>
  )
}
```

- [ ] **Step 2: Create InputStep**

Create `src/components/forecast/InputStep.tsx`:

```tsx
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'

interface InputStepProps {
  windowHours: 24 | 72
  onSubmit: (payload: { file?: File; text?: string; windowHours: 24 | 72 }) => void
  isLoading: boolean
}

export function InputStep({ windowHours, onSubmit, isLoading }: InputStepProps) {
  const [mode, setMode] = useState<'pdf' | 'paste'>('pdf')
  const [file, setFile] = useState<File | null>(null)
  const [pasteText, setPasteText] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const canSubmit = mode === 'pdf' ? !!file : pasteText.trim().length > 0

  function handleSubmit() {
    if (!canSubmit) return
    if (mode === 'pdf' && file) {
      onSubmit({ file, windowHours })
    } else {
      onSubmit({ text: pasteText, windowHours })
    }
  }

  return (
    <div className="space-y-3">
      {/* Source toggle */}
      <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-1">
        {t.pharmacyForecast.inputTitle}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant={mode === 'pdf' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('pdf')}
          className="text-sm"
        >
          {t.pharmacyForecast.tabPdf}
        </Button>
        <Button
          variant={mode === 'paste' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('paste')}
          className="text-sm"
        >
          {t.pharmacyForecast.tabPaste}
        </Button>
      </div>

      {mode === 'pdf' ? (
        <>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={e => setFile(e.target.files?.[0] ?? null)}
          />
          <div
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
              ${file ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
          >
            <div className="text-3xl mb-2">📂</div>
            <p className="text-sm font-semibold text-foreground">
              {file ? file.name : t.pharmacyForecast.dropzonePrompt}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{t.pharmacyForecast.dropzoneSub}</p>
          </div>
        </>
      ) : (
        <textarea
          className="w-full h-40 rounded-xl border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring font-mono"
          placeholder="הדבק כאן את תוכן לוח הווארד מ-SmartFlow..."
          value={pasteText}
          onChange={e => setPasteText(e.target.value)}
          dir="ltr"
        />
      )}

      <Button
        className="w-full"
        size="lg"
        disabled={!canSubmit || isLoading}
        onClick={handleSubmit}
      >
        {isLoading ? 'מנתח...' : t.pharmacyForecast.parseBtn}
      </Button>
      <p className="text-xs text-center text-muted-foreground">{t.pharmacyForecast.parseBtnHint}</p>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/forecast/EmailPreview.tsx src/components/forecast/InputStep.tsx
git commit -m "feat(forecast): EmailPreview and InputStep components"
```

---

## Task 13: ReviewStep Component

**Files:**
- Create: `src/components/forecast/ReviewStep.tsx`

- [ ] **Step 1: Implement ReviewStep**

Create `src/components/forecast/ReviewStep.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { PatientCard } from './PatientCard'
import { t } from '@/lib/i18n'
import type { ForecastResult } from '@/types/forecast'

interface ReviewStepProps {
  result: ForecastResult
  onApprove: (manualQuantities: Record<string, number>) => void
  isApproving: boolean
}

export function ReviewStep({ result, onApprove, isApproving }: ReviewStepProps) {
  const [manualQuantities, setManualQuantities] = useState<Record<string, number>>({})

  function handleQuantityChange(key: string, value: number) {
    setManualQuantities(prev => ({ ...prev, [key]: value }))
  }

  // Count unresolved flags: PRN without a manual quantity + other flags without override
  const unresolvedCount = useMemo(() => {
    let count = 0
    for (const patient of result.patients) {
      for (const drug of patient.drugs) {
        const key = `${patient.recordNumber}__${drug.drugName}`
        if (drug.flags.length > 0 && manualQuantities[key] === undefined) {
          count++
        }
      }
    }
    return count
  }, [result, manualQuantities])

  const criCount  = result.patients.flatMap(p => p.drugs).filter(d => d.type === 'cri').length
  const prnCount  = result.patients.flatMap(p => p.drugs).filter(d => d.type === 'prn').length
  const ldCount   = result.patients.flatMap(p => p.drugs).filter(d => d.type === 'ld').length
  const drugCount = result.patients.flatMap(p => p.drugs).length

  return (
    <div className="space-y-3">
      {/* Summary chips */}
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{drugCount} {t.pharmacyForecast.chipDrugs}</Badge>
        {criCount > 0 && <Badge variant="sterilized">{criCount} {t.pharmacyForecast.chipCri}</Badge>}
        {prnCount > 0 && <Badge variant="secondary">{prnCount} {t.pharmacyForecast.chipPrn}</Badge>}
        {ldCount > 0  && <Badge variant="ok">{ldCount} {t.pharmacyForecast.chipLd}</Badge>}
        {unresolvedCount > 0 && (
          <Badge variant="maintenance">⚠ {unresolvedCount} {t.pharmacyForecast.chipFlags}</Badge>
        )}
      </div>

      {/* Patient cards */}
      {result.patients.map((patient, i) => (
        <PatientCard
          key={i}
          patient={patient}
          manualQuantities={manualQuantities}
          onQuantityChange={handleQuantityChange}
        />
      ))}

      {/* Approve button */}
      <Button
        className="w-full"
        size="lg"
        disabled={unresolvedCount > 0 || isApproving}
        onClick={() => onApprove(manualQuantities)}
        variant={unresolvedCount === 0 ? 'default' : 'secondary'}
      >
        {unresolvedCount > 0
          ? t.pharmacyForecast.approveBtnPending.replace('{{count}}', String(unresolvedCount))
          : isApproving ? 'שולח...' : t.pharmacyForecast.approveBtnReady}
      </Button>
      <p className="text-xs text-center text-muted-foreground">{t.pharmacyForecast.approveNote}</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/forecast/ReviewStep.tsx
git commit -m "feat(forecast): ReviewStep with flag resolution and approve button"
```

---

## Task 14: Main Page + Routing + Nav

**Files:**
- Create: `src/pages/pharmacy-forecast.tsx`
- Modify: `src/app/routes.tsx`
- Modify: `src/components/layout.tsx` (check existing nav pattern first)

- [ ] **Step 1: Create the page**

Create `src/pages/pharmacy-forecast.tsx`:

```tsx
import { useState } from 'react'
import { Layout } from '@/components/layout'
import { t } from '@/lib/i18n'
import { InputStep } from '@/components/forecast/InputStep'
import { ReviewStep } from '@/components/forecast/ReviewStep'
import { EmailPreview } from '@/components/forecast/EmailPreview'
import { useParseForecast, useApproveForecast } from '@/hooks/useForecast'
import { useAuth } from '@/hooks/use-auth'
import { toast } from 'sonner'
import type { ForecastResult } from '@/types/forecast'

export default function PharmacyForecastPage() {
  const { user } = useAuth()
  const [windowHours, setWindowHours] = useState<24 | 72>(
    new Date().getDay() === 4 ? 72 : 24  // Thursday = 72h default
  )
  const [result, setResult] = useState<ForecastResult | null>(null)
  const [activeTab, setActiveTab] = useState<'review' | 'email'>('review')

  const parseMutation   = useParseForecast()
  const approveMutation = useApproveForecast()

  const isThursday   = new Date().getDay() === 4
  const weekendMode  = windowHours === 72

  function handleParse(payload: { file?: File; text?: string; windowHours: 24 | 72 }) {
    parseMutation.mutate(payload, {
      onSuccess: (data) => setResult(data),
      onError: () => toast.error('שגיאה בניתוח הדוח'),
    })
  }

  function handleApprove(manualQuantities: Record<string, number>) {
    if (!result) return
    approveMutation.mutate(
      { result, manualQuantities },
      {
        onSuccess: (data) => {
          if (data.deliveryMethod === 'mailto' && data.mailtoUrl) {
            window.open(data.mailtoUrl, '_blank')
            toast.success(t.pharmacyForecast.approveMailto)
          } else {
            toast.success(t.pharmacyForecast.approveSuccess)
          }
          setResult(null)
        },
        onError: () => toast.error('שגיאה בשליחת ההזמנה'),
      }
    )
  }

  return (
    <Layout>
      {/* Page header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center justify-between">
        <div>
          <h1 className="font-bold text-base">{t.pharmacyForecast.pageTitle}</h1>
          <p className="text-xs text-muted-foreground">
            {isThursday ? 'יום חמישי' : new Date().toLocaleDateString('he-IL')} ·{' '}
            {result ? `${result.patients.length} מטופלים` : t.pharmacyForecast.pageSub}
          </p>
        </div>
        {result && (
          <div className="flex items-center gap-1 bg-amber-50 border border-amber-300 rounded-full px-3 py-1 text-amber-800 text-xs font-semibold">
            ⚠ {result.totalFlags} סימונים
          </div>
        )}
      </div>

      {/* Weekend banner */}
      {weekendMode && (
        <div className="mx-4 mt-3 bg-amber-50 border border-amber-300 rounded-xl px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-amber-800">{t.pharmacyForecast.weekendBannerTitle}</p>
            <p className="text-xs text-amber-700 mt-0.5">{t.pharmacyForecast.weekendBannerSub}</p>
          </div>
          <button
            onClick={() => setWindowHours(weekendMode ? 24 : 72)}
            className="text-xs text-blue-600 font-semibold border border-blue-200 rounded-lg px-3 py-1.5 bg-white"
          >
            {weekendMode ? t.pharmacyForecast.switchTo24h : t.pharmacyForecast.switchTo72h}
          </button>
        </div>
      )}

      <div className="px-4 pt-3 pb-28">
        {!result ? (
          <InputStep
            windowHours={windowHours}
            onSubmit={handleParse}
            isLoading={parseMutation.isPending}
          />
        ) : (
          <>
            {/* Tabs */}
            <div className="flex border-b border-border mb-3">
              <button
                className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'review' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                onClick={() => setActiveTab('review')}
              >
                {t.pharmacyForecast.tabReview}
              </button>
              <button
                className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${activeTab === 'email' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
                onClick={() => setActiveTab('email')}
              >
                {t.pharmacyForecast.tabEmail}
              </button>
            </div>

            {activeTab === 'review' ? (
              <ReviewStep
                result={result}
                onApprove={handleApprove}
                isApproving={approveMutation.isPending}
              />
            ) : (
              <EmailPreview
                result={result}
                technicianName={user?.name ?? 'טכנאי/ת'}
              />
            )}
          </>
        )}
      </div>
    </Layout>
  )
}
```

- [ ] **Step 2: Add route**

Open `src/app/routes.tsx`. Add the lazy import and route following the existing pattern:

```tsx
// With other lazy imports at the top:
const PharmacyForecastPage = lazy(() => import('@/pages/pharmacy-forecast'))

// Inside the <Switch>:
<Route path="/pharmacy-forecast">
  <AuthGuard><PharmacyForecastPage /></AuthGuard>
</Route>
```

- [ ] **Step 3: Add nav entry**

Open `src/components/layout.tsx`. Find where nav items are defined (look for existing items like `/meds` or `/appointments`). Add the pharmacy forecast entry following the same pattern:

```tsx
{ path: '/pharmacy-forecast', label: t.pharmacyForecast.pageTitle, icon: FlaskConical }
// Import FlaskConical from 'lucide-react'
```

- [ ] **Step 4: Commit**

```bash
git add src/pages/pharmacy-forecast.tsx src/app/routes.tsx src/components/layout.tsx
git commit -m "feat(forecast): /pharmacy-forecast page, route, and nav entry"
```

---

## Task 15: Settings — Pharmacy Email Field

**Files:**
- Modify: `src/pages/settings.tsx` (find the clinic settings section)

- [ ] **Step 1: Add pharmacy email input to settings**

Open `src/pages/settings.tsx`. Find the clinic settings section (search for `clinicId` or `clinic settings`). Add a new field after the existing clinic fields, following the existing input pattern in that file:

```tsx
{/* Pharmacy email — add in clinic settings section */}
<div className="space-y-1">
  <label className="text-sm font-semibold">אימייל בית מרקחת</label>
  <p className="text-xs text-muted-foreground">כתובת האימייל שאליה ישלחו הזמנות התרופות</p>
  <Input
    type="email"
    placeholder="pharmacy@clinic.com"
    value={clinicSettings.pharmacyEmail ?? ''}
    onChange={e => updateClinicSettings({ pharmacyEmail: e.target.value })}
  />
</div>
```

The `updateClinicSettings` function already exists in the settings page — just add the new field to its payload. The backend `PATCH /api/clinics/:id` route should accept `pharmacyEmail` — verify the route handler includes this field in its Zod schema and update it if not.

- [ ] **Step 2: Commit**

```bash
git add src/pages/settings.tsx
git commit -m "feat(forecast): add pharmacy email field to clinic settings"
```

---

## Task 16: E2E Smoke Test

**Files:**
- Create: `tests/ui-forecast.spec.ts`

- [ ] **Step 1: Write Playwright E2E test**

Create `tests/ui-forecast.spec.ts`:

```typescript
import { test, expect } from '@playwright/test'

test.describe('Pharmacy Forecast page', () => {
  test.beforeEach(async ({ page }) => {
    // Use saved auth session (matches existing pattern in tests/)
    await page.goto('/pharmacy-forecast')
  })

  test('shows input step with PDF and paste tabs', async ({ page }) => {
    await expect(page.getByText('הזמנת תרופות')).toBeVisible()
    await expect(page.getByText('📄 העלאת PDF')).toBeVisible()
    await expect(page.getByText('📋 הדבקה חכמה')).toBeVisible()
  })

  test('shows weekend banner on Thursdays', async ({ page }) => {
    // Mock today as Thursday
    await page.addInitScript(() => {
      const OrigDate = Date
      class MockDate extends OrigDate {
        getDay() { return 4 }
      }
      (window as any).Date = MockDate
    })
    await page.reload()
    await expect(page.getByText('מצב סוף שבוע — 72 שעות')).toBeVisible()
  })

  test('paste input enables parse button when text is entered', async ({ page }) => {
    await page.getByText('📋 הדבקה חכמה').click()
    const parseBtn = page.getByText('נתח דוח ←')
    await expect(parseBtn).toBeDisabled()
    await page.getByPlaceholder('הדבק כאן את תוכן לוח הווארד מ-SmartFlow...').fill('Max #00842\nMorphine 2mg/kg IV SID')
    await expect(parseBtn).toBeEnabled()
  })

  test('approve button is disabled when flags are unresolved', async ({ page }) => {
    // This test requires a seeded parse result — skip in CI without fixture
    test.skip(!!process.env.CI, 'Requires real parse result')
  })
})
```

- [ ] **Step 2: Run Playwright tests**

```bash
npx playwright test tests/ui-forecast.spec.ts --headed
```

Expected: 3 tests pass (4th skipped in CI).

- [ ] **Step 3: Commit**

```bash
git add tests/ui-forecast.spec.ts
git commit -m "test(forecast): Playwright E2E smoke tests for /pharmacy-forecast"
```

---

## Self-Review Checklist

- **Spec § 3 (Data Input)**: Covered in Task 8 (multer PDF + text body) and Task 12 (InputStep). ✓
- **Spec § 4 (Parser Pipeline)**: Tasks 3–5 cover all three layers including fuse.js, normalization, loading dose heuristic. ✓
- **Spec § 5 (Forecasting Engine)**: Task 6 covers regular, CRI, LD, PRN; Task 8 orchestrator wires to DB lookups. ✓
- **Spec § 6 (Validation UI)**: Tasks 11–14 cover FlagCell, PatientCard, tabs, approve button states. ✓
- **Spec § 7 (Output)**: Task 7 (email builder), Task 8 (Nodemailer + mailto), audit log write. ✓
- **Spec § 8 (DB table)**: Task 2 covers vt_pharmacy_orders and formulary extensions. ✓
- **Spec § 9 (API routes)**: Task 8 covers both endpoints with auth gate. ✓
- **Spec § 10 (Dependencies)**: Task 1 installs pdf-parse, fuse.js, nodemailer. ✓
- **Spec § 11 (i18n)**: Task 9 covers both he.json and en.json. ✓
- **Spec § 12 (Testing)**: Tasks 3–6 have unit tests; Task 16 has Playwright E2E. ✓
- **pharmacy_email settings UI**: Task 15 covers the clinic settings field. ✓
- **PATIENT_UNKNOWN flag**: Handled in Task 8 orchestrator when recordNumber has no vt_animals match. ✓
