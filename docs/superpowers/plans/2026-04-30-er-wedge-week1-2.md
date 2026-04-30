# ER Wedge Week 1-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Gate A of the ER wedge — clinic-scoped ER mode config, allowlist enforcement (backend + frontend), four new DB schemas, and frozen API contracts as stubs.

**Architecture:** A new `er_mode_state` column on `vt_clinics` drives per-clinic mode (`disabled | preview | enforced`). An Express middleware wired after `tenantContext` uses `req.clinicId` to check mode from a short-lived in-memory cache. Enforced mode returns concealment 404 for non-allowlisted `/api/*` paths. A frontend `ErModeGuard` component reads mode via `GET /api/er/mode` and renders `NotFoundPage` for non-allowlisted UI paths.

**Tech Stack:** Drizzle ORM · Express middleware · vitest (unit tests, no DB) · React + wouter · zod

**Decision refs:** Decision ledger decisions 1, 2, 16, 22 | Tasks 0.2, 1.1, 1.2, 1.3, 2.1

---

## File Map

### New files
| File | Responsibility |
|------|---------------|
| `server/lib/er-mode.ts` | ER mode resolver: reads DB, caches 30 s, respects `ER_MODE_DEFAULT` env |
| `server/middleware/er-allowlist.ts` | Express middleware: concealment 404 for blocked paths in enforced mode |
| `server/routes/er.ts` | All ER API endpoints — real for `/mode`, stubs (501) for the rest |
| `shared/er-types.ts` | Frozen request/response types shared by frontend and backend |
| `src/hooks/use-er-mode.ts` | React hook: fetches clinic ER mode, caches in component state |
| `src/features/er/components/ErModeGuard.tsx` | HOC: renders NotFoundPage for non-allowlisted paths in enforced mode |
| `src/pages/er-command-center.tsx` | Placeholder page for `/er` route |
| `src/pages/er-impact.tsx` | Placeholder page for `/er/impact` route |
| `migrations/082_er_mode_config.sql` | Add `er_mode_state` to `vt_clinics` |
| `migrations/083_er_intake_events.sql` | Create `vt_er_intake_events` |
| `migrations/084_er_handoffs.sql` | Create `vt_shift_handoffs` + `vt_shift_handoff_items` |
| `migrations/085_er_kpi.sql` | Create `vt_er_kpi_daily` + `vt_er_baseline_snapshots` |
| `tests/er-mode.test.ts` | Unit tests for `server/lib/er-mode.ts` |
| `tests/er-allowlist.test.ts` | Unit tests for `server/middleware/er-allowlist.ts` |

### Modified files
| File | Change |
|------|--------|
| `server/db.ts` | Add `erModeState` to `clinics` table + 4 new tables |
| `server/index.ts` | Mount `erAllowlistMiddleware` after `tenantContext` |
| `server/app/routes.ts` | Import + register `erRoutes` |
| `src/app/routes.tsx` | Add `/er` + `/er/impact` routes, wrap Switch with `ErModeGuard` |
| `src/lib/api.ts` | Add typed functions for all ER endpoints |

---

## Task 1: Add `er_mode_state` to `vt_clinics` and write migration 082

**Files:**
- Modify: `server/db.ts` (clinics table definition, around line 69)
- Create: `migrations/082_er_mode_config.sql`

- [ ] **Step 1: Update clinics table in db.ts**

Replace:
```ts
export const clinics = pgTable("vt_clinics", {
  id: text("id").primaryKey(),
  pharmacyEmail: text("pharmacy_email"),
  forecastPdfSourceFormat: varchar("forecast_pdf_source_format", { length: 20 }).notNull().default("smartflow"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```
With:
```ts
export const clinics = pgTable("vt_clinics", {
  id: text("id").primaryKey(),
  pharmacyEmail: text("pharmacy_email"),
  forecastPdfSourceFormat: varchar("forecast_pdf_source_format", { length: 20 }).notNull().default("smartflow"),
  erModeState: varchar("er_mode_state", { length: 20 }).notNull().default("disabled"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 2: Write migration SQL**

Create `migrations/082_er_mode_config.sql`:
```sql
-- Add ER mode state to clinics. States: disabled (default), preview, enforced.
ALTER TABLE vt_clinics
  ADD COLUMN IF NOT EXISTS er_mode_state VARCHAR(20) NOT NULL DEFAULT 'disabled';

ALTER TABLE vt_clinics
  ADD CONSTRAINT vt_clinics_er_mode_state_check
  CHECK (er_mode_state IN ('disabled', 'preview', 'enforced'));
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add server/db.ts migrations/082_er_mode_config.sql
git commit -m "feat(db): add er_mode_state to vt_clinics"
```

---

## Task 2: ER mode resolver — `server/lib/er-mode.ts`

**Files:**
- Create: `server/lib/er-mode.ts`

This module resolves the effective ER mode for a clinic. It uses a simple in-memory cache with a 30-second TTL so it doesn't hit the DB on every request. It respects an `ER_MODE_DEFAULT` environment variable as the fallback for all clinics.

- [ ] **Step 1: Create the resolver**

Create `server/lib/er-mode.ts`:
```ts
import { db, clinics } from "../db.js";
import { eq } from "drizzle-orm";

export type ErModeState = "disabled" | "preview" | "enforced";

// DbFetcher is separated for testability.
export type ErModeDbFetcher = (clinicId: string) => Promise<ErModeState | null>;

interface CacheEntry {
  state: ErModeState;
  expiresAt: number;
}

const CACHE_TTL_MS = 30_000;

function parseErModeState(value: string | null | undefined): ErModeState {
  if (value === "preview" || value === "enforced") return value;
  return "disabled";
}

export function createErModeResolver(dbFetcher?: ErModeDbFetcher) {
  const cache = new Map<string, CacheEntry>();

  const defaultFetcher: ErModeDbFetcher = async (clinicId) => {
    const [row] = await db
      .select({ erModeState: clinics.erModeState })
      .from(clinics)
      .where(eq(clinics.id, clinicId))
      .limit(1);
    if (!row) return null;
    return parseErModeState(row.erModeState);
  };

  const fetch = dbFetcher ?? defaultFetcher;

  async function getClinicErModeState(clinicId: string): Promise<ErModeState> {
    const now = Date.now();
    const cached = cache.get(clinicId);
    if (cached && cached.expiresAt > now) return cached.state;

    const envDefault = parseErModeState(process.env.ER_MODE_DEFAULT);
    const dbState = await fetch(clinicId);
    const resolved = dbState ?? envDefault;

    cache.set(clinicId, { state: resolved, expiresAt: now + CACHE_TTL_MS });
    return resolved;
  }

  function invalidateErModeCache(clinicId?: string): void {
    if (clinicId) {
      cache.delete(clinicId);
    } else {
      cache.clear();
    }
  }

  return { getClinicErModeState, invalidateErModeCache };
}

// Production singleton
const { getClinicErModeState, invalidateErModeCache } = createErModeResolver();
export { getClinicErModeState, invalidateErModeCache };
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

---

## Task 3: Tests for `server/lib/er-mode.ts`

**Files:**
- Create: `tests/er-mode.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/er-mode.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createErModeResolver } from "../server/lib/er-mode.js";
import type { ErModeState, ErModeDbFetcher } from "../server/lib/er-mode.js";

function makeFetcher(stateMap: Record<string, ErModeState | null>): ErModeDbFetcher {
  return async (clinicId) => stateMap[clinicId] ?? null;
}

beforeEach(() => {
  delete process.env.ER_MODE_DEFAULT;
});

describe("getClinicErModeState", () => {
  it("returns disabled by default when DB returns null and no env set", async () => {
    const { getClinicErModeState } = createErModeResolver(makeFetcher({}));
    const state = await getClinicErModeState("clinic-1");
    expect(state).toBe("disabled");
  });

  it("returns DB value when present", async () => {
    const { getClinicErModeState } = createErModeResolver(makeFetcher({ "clinic-1": "enforced" }));
    const state = await getClinicErModeState("clinic-1");
    expect(state).toBe("enforced");
  });

  it("returns ER_MODE_DEFAULT env when DB returns null", async () => {
    process.env.ER_MODE_DEFAULT = "preview";
    const { getClinicErModeState } = createErModeResolver(makeFetcher({}));
    const state = await getClinicErModeState("clinic-1");
    expect(state).toBe("preview");
  });

  it("DB value overrides ER_MODE_DEFAULT env", async () => {
    process.env.ER_MODE_DEFAULT = "preview";
    const { getClinicErModeState } = createErModeResolver(makeFetcher({ "clinic-1": "enforced" }));
    const state = await getClinicErModeState("clinic-1");
    expect(state).toBe("enforced");
  });

  it("caches result: second call does not invoke fetcher again", async () => {
    const fetcher = vi.fn(makeFetcher({ "clinic-1": "preview" }));
    const { getClinicErModeState } = createErModeResolver(fetcher);
    await getClinicErModeState("clinic-1");
    await getClinicErModeState("clinic-1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("invalidateErModeCache forces fresh fetch on next call", async () => {
    const fetcher = vi.fn(makeFetcher({ "clinic-1": "preview" }));
    const { getClinicErModeState, invalidateErModeCache } = createErModeResolver(fetcher);
    await getClinicErModeState("clinic-1");
    invalidateErModeCache("clinic-1");
    await getClinicErModeState("clinic-1");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("different clinics have separate cache entries", async () => {
    const fetcher = vi.fn(makeFetcher({ "clinic-a": "preview", "clinic-b": "enforced" }));
    const { getClinicErModeState } = createErModeResolver(fetcher);
    const a = await getClinicErModeState("clinic-a");
    const b = await getClinicErModeState("clinic-b");
    expect(a).toBe("preview");
    expect(b).toBe("enforced");
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- tests/er-mode.test.ts`
Expected: all 6 tests pass

- [ ] **Step 3: Commit**

```bash
git add server/lib/er-mode.ts tests/er-mode.test.ts
git commit -m "feat(server): ER mode resolver with per-clinic cache"
```

---

## Task 4: ER allowlist middleware — `server/middleware/er-allowlist.ts`

**Files:**
- Create: `server/middleware/er-allowlist.ts`

The allowlisted API prefixes (decision 2): `/api/patients`, `/api/appointments`, `/api/shift-handover`, `/api/code-blue`, `/api/realtime`, `/api/er`, `/api/health`, `/api/healthz`, `/api/version`. `/api/users` is NOT in the list.

The middleware runs after `tenantContext` (which sets `req.clinicId`). If `req.clinicId` is not set, it skips — auth middleware will reject the request anyway.

- [ ] **Step 1: Create the middleware**

Create `server/middleware/er-allowlist.ts`:
```ts
import type { Request, Response, NextFunction } from "express";
import type { ErModeState } from "../lib/er-mode.js";
import { getClinicErModeState as defaultResolver } from "../lib/er-mode.js";

// Paths that remain accessible in ER mode (decision 2).
// Match as prefix so /api/patients/:id is covered by /api/patients.
const ER_ALLOWED_API_PREFIXES = [
  "/api/patients",
  "/api/appointments",
  "/api/shift-handover",
  "/api/code-blue",
  "/api/realtime",
  "/api/er",
  "/api/health",
  "/api/healthz",
  "/api/version",
  "/api/webhooks",
  "/api/integration-webhooks",
];

export function isErAllowedPath(path: string): boolean {
  return ER_ALLOWED_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix + "/") || path.startsWith(prefix + "?"));
}

export function createErAllowlistMiddleware(
  resolveMode: (clinicId: string) => Promise<ErModeState> = defaultResolver,
) {
  return async function erAllowlistMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const clinicId = req.clinicId?.trim();
    if (!clinicId) {
      next();
      return;
    }

    let mode: ErModeState;
    try {
      mode = await resolveMode(clinicId);
    } catch (err) {
      // ER mode resolution failure must not break auth — log and pass through.
      console.error("[er-allowlist] Failed to resolve ER mode, passing through", { clinicId, err });
      next();
      return;
    }

    if (mode === "disabled") {
      next();
      return;
    }

    const allowed = isErAllowedPath(req.path);

    if (mode === "preview") {
      if (!allowed) {
        console.info(
          JSON.stringify({
            event: "ER_MODE_PREVIEW_BLOCKED",
            clinicId,
            path: req.path,
            method: req.method,
            ts: new Date().toISOString(),
          }),
        );
      }
      next();
      return;
    }

    // enforced: concealment 404 for non-allowlisted paths
    if (!allowed) {
      res.status(404).json({ error: "NOT_FOUND", message: "Not found" });
      return;
    }

    next();
  };
}

export const erAllowlistMiddleware = createErAllowlistMiddleware();
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

---

## Task 5: Tests for `server/middleware/er-allowlist.ts`

**Files:**
- Create: `tests/er-allowlist.test.ts`

- [ ] **Step 1: Write the tests**

Create `tests/er-allowlist.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import type { Request, Response, NextFunction } from "express";
import { createErAllowlistMiddleware, isErAllowedPath } from "../server/middleware/er-allowlist.js";
import type { ErModeState } from "../server/lib/er-mode.js";

function makeReq(path: string, clinicId?: string): Request {
  return { path, clinicId } as unknown as Request;
}

function makeRes() {
  const state = { statusCode: 200, body: null as unknown };
  const res = {
    status(code: number) { state.statusCode = code; return this; },
    json(body: unknown) { state.body = body; return this; },
  } as unknown as Response;
  return { res, state };
}

function makeNext(): { next: NextFunction; called: () => boolean } {
  let called = false;
  return { next: () => { called = true; }, called: () => called };
}

function makeResolver(state: ErModeState) {
  return async (_clinicId: string) => state;
}

describe("isErAllowedPath", () => {
  it("allows /api/patients", () => expect(isErAllowedPath("/api/patients")).toBe(true));
  it("allows /api/patients/123", () => expect(isErAllowedPath("/api/patients/123")).toBe(true));
  it("allows /api/er/board", () => expect(isErAllowedPath("/api/er/board")).toBe(true));
  it("allows /api/health", () => expect(isErAllowedPath("/api/health")).toBe(true));
  it("blocks /api/users", () => expect(isErAllowedPath("/api/users")).toBe(false));
  it("blocks /api/equipment", () => expect(isErAllowedPath("/api/equipment")).toBe(false));
  it("blocks /api/procurement", () => expect(isErAllowedPath("/api/procurement")).toBe(false));
  it("blocks /api/forecast", () => expect(isErAllowedPath("/api/forecast")).toBe(false));
});

describe("erAllowlistMiddleware", () => {
  it("passes through when clinicId is absent", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("enforced"));
    const req = makeReq("/api/equipment");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("passes through in disabled mode for any path", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("disabled"));
    const req = makeReq("/api/equipment", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("passes through in preview mode for blocked path (logs only)", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("preview"));
    const req = makeReq("/api/equipment", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("passes through in enforced mode for allowlisted path", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("enforced"));
    const req = makeReq("/api/patients/abc", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });

  it("returns 404 in enforced mode for non-allowlisted path", async () => {
    const mw = createErAllowlistMiddleware(makeResolver("enforced"));
    const req = makeReq("/api/equipment", "clinic-1");
    const { res, state } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(false);
    expect(state.statusCode).toBe(404);
  });

  it("passes through when resolver throws (fail-open)", async () => {
    const mw = createErAllowlistMiddleware(async () => { throw new Error("DB down"); });
    const req = makeReq("/api/equipment", "clinic-1");
    const { res } = makeRes();
    const { next, called } = makeNext();
    await mw(req, res, next);
    expect(called()).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm test -- tests/er-allowlist.test.ts`
Expected: all 13 tests pass

- [ ] **Step 3: Commit**

```bash
git add server/middleware/er-allowlist.ts tests/er-allowlist.test.ts
git commit -m "feat(server): ER allowlist middleware with concealment 404"
```

---

## Task 6: Wire allowlist middleware into Express app

**Files:**
- Modify: `server/index.ts` (around line 229)

- [ ] **Step 1: Add import and mount the middleware**

Add the import near the top of `server/index.ts` with the other middleware imports:
```ts
import { erAllowlistMiddleware } from "./middleware/er-allowlist.js";
```

Then after `app.use("/api", tenantContext);` add:
```ts
app.use("/api", erAllowlistMiddleware);
```

The block should read:
```ts
// Global API limiter runs before route-specific limiters.
app.use("/api", globalApiLimiter);
app.use("/api", i18nMiddleware);
app.use("/api", tenantContext);
app.use("/api", erAllowlistMiddleware);

registerApiRoutes(app);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add server/index.ts
git commit -m "feat(server): mount ER allowlist middleware globally"
```

---

## Task 7: Schema — `vt_er_intake_events` (decision 4, 5)

**Files:**
- Modify: `server/db.ts` (append before the last export)
- Create: `migrations/083_er_intake_events.sql`

**Fields:** clinicId, animalId (optional), ownerName (optional), species, severity (low/medium/high/critical), chiefComplaint, waitingSince, assignedUserId (optional), status (waiting/assigned/in_progress/discharged/cancelled), timestamps.

- [ ] **Step 1: Add table to db.ts**

Append to `server/db.ts` (before the closing of the file, after the last existing table):
```ts
export const erIntakeEvents = pgTable(
  "vt_er_intake_events",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "restrict" }),
    animalId: text("animal_id").references(() => animals.id, { onDelete: "set null" }),
    ownerName: text("owner_name"),
    species: text("species").notNull(),
    severity: varchar("severity", { length: 20 }).notNull(),
    chiefComplaint: text("chief_complaint").notNull(),
    waitingSince: timestamp("waiting_since", { withTimezone: true }).defaultNow().notNull(),
    assignedUserId: text("assigned_user_id").references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("waiting"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clinicStatusIdx: index("idx_er_intake_clinic_status").on(table.clinicId, table.status),
    clinicWaitingIdx: index("idx_er_intake_clinic_waiting").on(table.clinicId, table.waitingSince),
  }),
);
```

- [ ] **Step 2: Write migration SQL**

Create `migrations/083_er_intake_events.sql`:
```sql
-- ER intake triage queue (decision 4, 5 from decision-ledger-execution-order.md).
CREATE TABLE IF NOT EXISTS vt_er_intake_events (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  animal_id TEXT REFERENCES vt_animals(id) ON DELETE SET NULL,
  owner_name TEXT,
  species TEXT NOT NULL,
  severity VARCHAR(20) NOT NULL,
  chief_complaint TEXT NOT NULL,
  waiting_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_user_id TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT vt_er_intake_severity_check CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT vt_er_intake_status_check CHECK (status IN ('waiting', 'assigned', 'in_progress', 'discharged', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_er_intake_clinic_status
  ON vt_er_intake_events (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_er_intake_clinic_waiting
  ON vt_er_intake_events (clinic_id, waiting_since);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add server/db.ts migrations/083_er_intake_events.sql
git commit -m "feat(db): add vt_er_intake_events schema"
```

---

## Task 8: Schema — `vt_shift_handoffs` + `vt_shift_handoff_items` (decision 7, 8)

**Files:**
- Modify: `server/db.ts`
- Create: `migrations/084_er_handoffs.sql`

**`vt_shift_handoffs`:** parent record per patient handoff — clinicId, hospitalizationId (optional), ownerUserId (the outgoing owner), status (open/acknowledged/overdue), createdAt.

**`vt_shift_handoff_items`:** one row per item in a handoff — activeIssue, nextAction, etaMinutes, ownerUserId (incoming), riskFlags (jsonb), pendingMedicationTaskId (optional), note (optional), ackBy (optional), ackAt (optional), overriddenBy, overrideReason.

- [ ] **Step 1: Add tables to db.ts**

Append to `server/db.ts` after `erIntakeEvents`:
```ts
export const shiftHandoffs = pgTable(
  "vt_shift_handoffs",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "restrict" }),
    hospitalizationId: text("hospitalization_id").references(() => hospitalizations.id, { onDelete: "set null" }),
    outgoingUserId: text("outgoing_user_id").references(() => users.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("open"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    clinicStatusIdx: index("idx_shift_handoffs_clinic_status").on(table.clinicId, table.status),
    clinicCreatedIdx: index("idx_shift_handoffs_clinic_created").on(table.clinicId, table.createdAt),
  }),
);

export const shiftHandoffItems = pgTable(
  "vt_shift_handoff_items",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "restrict" }),
    handoffId: text("handoff_id").notNull().references(() => shiftHandoffs.id, { onDelete: "cascade" }),
    activeIssue: text("active_issue").notNull(),
    nextAction: text("next_action").notNull(),
    etaMinutes: integer("eta_minutes").notNull(),
    ownerUserId: text("owner_user_id").references(() => users.id, { onDelete: "set null" }),
    riskFlags: jsonb("risk_flags").notNull().default(sql`'[]'::jsonb`),
    pendingMedicationTaskId: text("pending_medication_task_id"),
    note: text("note"),
    ackBy: text("ack_by").references(() => users.id, { onDelete: "set null" }),
    ackAt: timestamp("ack_at"),
    overriddenBy: text("overridden_by").references(() => users.id, { onDelete: "set null" }),
    overrideReason: text("override_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    handoffIdx: index("idx_shift_handoff_items_handoff").on(table.handoffId),
    clinicOwnerIdx: index("idx_shift_handoff_items_clinic_owner").on(table.clinicId, table.ownerUserId),
  }),
);
```

- [ ] **Step 2: Check `hospitalizations` import in db.ts**

Run: `grep -n "hospitalizations" server/db.ts | head -5`

If the `hospitalizations` table is defined in `db.ts` (it should be — from migration 068), the reference is valid. If it uses a different variable name, adjust the `.references(() => hospitalizations.id, ...)` call accordingly.

- [ ] **Step 3: Write migration SQL**

Create `migrations/084_er_handoffs.sql`:
```sql
-- Structured clinical handoff schema (decision 7, 8 from decision-ledger-execution-order.md).
CREATE TABLE IF NOT EXISTS vt_shift_handoffs (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  hospitalization_id TEXT REFERENCES vt_hospitalizations(id) ON DELETE SET NULL,
  outgoing_user_id TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT vt_shift_handoffs_status_check CHECK (status IN ('open', 'acknowledged', 'overdue'))
);

CREATE INDEX IF NOT EXISTS idx_shift_handoffs_clinic_status
  ON vt_shift_handoffs (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_shift_handoffs_clinic_created
  ON vt_shift_handoffs (clinic_id, created_at);

CREATE TABLE IF NOT EXISTS vt_shift_handoff_items (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  handoff_id TEXT NOT NULL REFERENCES vt_shift_handoffs(id) ON DELETE CASCADE,
  active_issue TEXT NOT NULL,
  next_action TEXT NOT NULL,
  eta_minutes INTEGER NOT NULL,
  owner_user_id TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  risk_flags JSONB NOT NULL DEFAULT '[]',
  pending_medication_task_id TEXT,
  note TEXT,
  ack_by TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  ack_at TIMESTAMP,
  overridden_by TEXT REFERENCES vt_users(id) ON DELETE SET NULL,
  override_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shift_handoff_items_handoff
  ON vt_shift_handoff_items (handoff_id);

CREATE INDEX IF NOT EXISTS idx_shift_handoff_items_clinic_owner
  ON vt_shift_handoff_items (clinic_id, owner_user_id);
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 5: Commit**

```bash
git add server/db.ts migrations/084_er_handoffs.sql
git commit -m "feat(db): add vt_shift_handoffs and vt_shift_handoff_items schemas"
```

---

## Task 9: Schema — `vt_er_kpi_daily` + `vt_er_baseline_snapshots` (decision 11, 12)

**Files:**
- Modify: `server/db.ts`
- Create: `migrations/085_er_kpi.sql`

**KPIs (decision 11):** `doorToTriageMinutesP50` (numeric), `missedHandoffRate` (numeric 0–100), `medDelayRate` (numeric 0–100).

**Baseline policy (decision 12):** Per-clinic fixed 14-day pre-go-live window. If insufficient data, `confidenceLevel = "low"`.

- [ ] **Step 1: Add tables to db.ts**

Append to `server/db.ts` after `shiftHandoffItems`:
```ts
export const erKpiDaily = pgTable(
  "vt_er_kpi_daily",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "restrict" }),
    date: date("date", { mode: "string" }).notNull(),
    doorToTriageMinutesP50: doublePrecision("door_to_triage_minutes_p50"),
    missedHandoffRate: doublePrecision("missed_handoff_rate"),
    medDelayRate: doublePrecision("med_delay_rate"),
    sampleSizeIntakes: integer("sample_size_intakes").notNull().default(0),
    sampleSizeHandoffs: integer("sample_size_handoffs").notNull().default(0),
    sampleSizeMedTasks: integer("sample_size_med_tasks").notNull().default(0),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (table) => ({
    clinicDateUnique: uniqueIndex("vt_er_kpi_daily_clinic_date_unique").on(table.clinicId, table.date),
    clinicDateIdx: index("idx_er_kpi_daily_clinic_date").on(table.clinicId, table.date),
  }),
);

export const erBaselineSnapshots = pgTable(
  "vt_er_baseline_snapshots",
  {
    id: text("id").primaryKey(),
    clinicId: text("clinic_id").notNull().references(() => clinics.id, { onDelete: "restrict" }),
    baselineStartDate: date("baseline_start_date", { mode: "string" }).notNull(),
    baselineEndDate: date("baseline_end_date", { mode: "string" }).notNull(),
    doorToTriageMinutesP50: doublePrecision("door_to_triage_minutes_p50"),
    missedHandoffRate: doublePrecision("missed_handoff_rate"),
    medDelayRate: doublePrecision("med_delay_rate"),
    confidenceLevel: varchar("confidence_level", { length: 10 }).notNull().default("low"),
    capturedAt: timestamp("captured_at").defaultNow().notNull(),
  },
  (table) => ({
    clinicCapturedIdx: index("idx_er_baseline_clinic_captured").on(table.clinicId, table.capturedAt),
  }),
);
```

- [ ] **Step 2: Write migration SQL**

Create `migrations/085_er_kpi.sql`:
```sql
-- ER KPI and baseline schema (decisions 11, 12 from decision-ledger-execution-order.md).
CREATE TABLE IF NOT EXISTS vt_er_kpi_daily (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  date DATE NOT NULL,
  door_to_triage_minutes_p50 DOUBLE PRECISION,
  missed_handoff_rate DOUBLE PRECISION,
  med_delay_rate DOUBLE PRECISION,
  sample_size_intakes INTEGER NOT NULL DEFAULT 0,
  sample_size_handoffs INTEGER NOT NULL DEFAULT 0,
  sample_size_med_tasks INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT vt_er_kpi_daily_clinic_date_unique UNIQUE (clinic_id, date)
);

CREATE INDEX IF NOT EXISTS idx_er_kpi_daily_clinic_date
  ON vt_er_kpi_daily (clinic_id, date);

CREATE TABLE IF NOT EXISTS vt_er_baseline_snapshots (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL REFERENCES vt_clinics(id) ON DELETE RESTRICT,
  baseline_start_date DATE NOT NULL,
  baseline_end_date DATE NOT NULL,
  door_to_triage_minutes_p50 DOUBLE PRECISION,
  missed_handoff_rate DOUBLE PRECISION,
  med_delay_rate DOUBLE PRECISION,
  confidence_level VARCHAR(10) NOT NULL DEFAULT 'low',
  captured_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT vt_er_baseline_confidence_check CHECK (confidence_level IN ('low', 'medium', 'high'))
);

CREATE INDEX IF NOT EXISTS idx_er_baseline_clinic_captured
  ON vt_er_baseline_snapshots (clinic_id, captured_at);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add server/db.ts migrations/085_er_kpi.sql
git commit -m "feat(db): add vt_er_kpi_daily and vt_er_baseline_snapshots schemas"
```

---

## Task 10: Frozen API contracts — `shared/er-types.ts`

**Files:**
- Create: `shared/er-types.ts`

These types lock the contract for all 6 ER endpoints. Backend stubs and frontend API client both import from here.

- [ ] **Step 1: Create the types file**

Create `shared/er-types.ts`:
```ts
// ER Wedge v1 API contracts — frozen per decision ledger Task 2.1.
// Do not change field names or remove fields; add optional fields only.

export type ErModeState = "disabled" | "preview" | "enforced";
export type ErSeverity = "low" | "medium" | "high" | "critical";
export type ErIntakeStatus = "waiting" | "assigned" | "in_progress" | "discharged" | "cancelled";
export type ErHandoffStatus = "open" | "acknowledged" | "overdue";
export type ErLane = "criticalNow" | "next15m" | "handoffRisk";
export type ErNextActionCode =
  | "assign_vet"
  | "start_treatment"
  | "medication_due"
  | "await_results"
  | "prepare_handoff"
  | "acknowledge_handoff"
  | "monitor";

// ── GET /api/er/mode ──────────────────────────────────────────────────────────

export interface ErModeResponse {
  clinicId: string;
  state: ErModeState;
}

// ── GET /api/er/board ─────────────────────────────────────────────────────────

export interface ErBoardItem {
  id: string;
  type: "intake" | "hospitalization";
  lane: ErLane;
  severity: ErSeverity;
  patientLabel: string;       // species + name/id for display
  waitingSince: string;       // ISO 8601
  assignedUserId: string | null;
  assignedUserName: string | null;
  nextActionCode: ErNextActionCode;
  nextActionLabel: string;
  badges: Array<"handoffRisk" | "overdue" | "unassigned">;
  overdueAt: string | null;   // ISO 8601, null if not overdue
}

export interface ErBoardResponse {
  clinicId: string;
  generatedAt: string;        // ISO 8601
  lanes: {
    criticalNow: ErBoardItem[];
    next15m: ErBoardItem[];
    handoffRisk: ErBoardItem[];
  };
}

// ── POST /api/er/intake ───────────────────────────────────────────────────────

export interface CreateErIntakeRequest {
  species: string;
  severity: ErSeverity;
  chiefComplaint: string;
  animalId?: string;
  ownerName?: string;
}

export interface ErIntakeResponse {
  id: string;
  clinicId: string;
  species: string;
  severity: ErSeverity;
  chiefComplaint: string;
  status: ErIntakeStatus;
  waitingSince: string;
  assignedUserId: string | null;
  animalId: string | null;
  ownerName: string | null;
  createdAt: string;
}

// ── PATCH /api/er/intake/:id/assign ──────────────────────────────────────────

export interface AssignErIntakeRequest {
  assignedUserId: string;
}

export interface AssignErIntakeResponse {
  id: string;
  assignedUserId: string;
  status: ErIntakeStatus;
  updatedAt: string;
}

// ── GET /api/er/assignees ─────────────────────────────────────────────────────

export interface ErAssignee {
  id: string;
  name: string;
  role: string;
}

export interface ErAssigneesResponse {
  assignees: ErAssignee[];
}

// ── POST /api/er/handoffs/:id/ack ─────────────────────────────────────────────

export interface AckErHandoffRequest {
  /** Required only when the acker is not the designated incoming owner (forced override). */
  overrideReason?: string;
}

export interface AckErHandoffResponse {
  id: string;
  status: ErHandoffStatus;
  ackBy: string;
  ackAt: string;
}

// ── GET /api/er/impact ────────────────────────────────────────────────────────

export type ErKpiWindowDays = 7 | 14 | 30;
export type ErConfidenceLevel = "low" | "medium" | "high";

export interface ErKpiComparison {
  kpi: "doorToTriageMinutesP50" | "missedHandoffRate" | "medDelayRate";
  baselineValue: number | null;
  currentValue: number | null;
  absoluteDelta: number | null;
  percentDelta: number | null;
  confidence: ErConfidenceLevel;
}

export interface ErImpactResponse {
  clinicId: string;
  windowDays: ErKpiWindowDays;
  baselineStartDate: string;
  baselineEndDate: string;
  comparisons: ErKpiComparison[];
  generatedAt: string;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add shared/er-types.ts
git commit -m "feat(shared): freeze ER API contracts in shared/er-types.ts"
```

---

## Task 11: ER route file — `server/routes/er.ts`

**Files:**
- Create: `server/routes/er.ts`

`GET /api/er/mode` is fully implemented — reads from the DB via `getClinicErModeState`.
All other endpoints return `501 Not Implemented` with the correct response shape (contract tests pass).

- [ ] **Step 1: Create the route file**

Create `server/routes/er.ts`:
```ts
import { Router } from "express";
import { randomUUID } from "crypto";
import type { Request, Response } from "express";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { getClinicErModeState, invalidateErModeCache } from "../lib/er-mode.js";
import { logAudit } from "../lib/audit.js";
import type {
  ErModeResponse,
  ErBoardResponse,
  ErIntakeResponse,
  AssignErIntakeResponse,
  ErAssigneesResponse,
  AckErHandoffResponse,
  ErImpactResponse,
  CreateErIntakeRequest,
  AssignErIntakeRequest,
  AckErHandoffRequest,
} from "../../shared/er-types.js";

const router = Router();
router.use(requireAuth);

function resolveRequestId(res: Response, incoming: unknown): string {
  const incomingStr = typeof incoming === "string" ? incoming.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incomingStr || fromRes || randomUUID();
  res.setHeader("x-request-id", requestId);
  return requestId;
}

function notImplemented(res: Response, requestId: string) {
  return res.status(501).json({
    error: "NOT_IMPLEMENTED",
    reason: "COMING_SOON",
    message: "This endpoint is not yet implemented",
    requestId,
  });
}

// GET /api/er/mode — returns the clinic's current ER mode state.
// Used by the frontend ErModeGuard and the admin kill switch.
router.get("/mode", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.authUser!.clinicId;
    const state = await getClinicErModeState(clinicId);
    const body: ErModeResponse = { clinicId, state };
    res.status(200).json(body);
  } catch (err) {
    console.error("[er] GET /mode failed", err);
    res.status(500).json({ error: "INTERNAL_ERROR", requestId });
  }
});

// PATCH /api/er/mode — admin-only kill switch (enforced <-> preview transition).
router.patch("/mode", requireRole("admin"), async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  // TODO (Task 0.2): implement mode transition + audit log + cache invalidation
  return notImplemented(res, requestId);
});

// GET /api/er/board — unified ER board (Week 3-6)
router.get("/board", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

// GET /api/er/assignees — role-filtered assignee list (Week 3-6)
router.get("/assignees", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

// POST /api/er/intake — create intake event (Week 3-6)
router.post("/intake", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

// PATCH /api/er/intake/:id/assign — assign intake to user (Week 3-6)
router.patch("/intake/:id/assign", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

// GET /api/er/queue — triage queue (Week 3-6)
router.get("/queue", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

// POST /api/er/handoffs/:id/ack — acknowledge handoff item (Week 3-6)
router.post("/handoffs/:id/ack", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

// GET /api/er/impact — KPI impact comparison (Week 6-10)
router.get("/impact", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});

export default router;
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

---

## Task 12: Register ER routes in `server/app/routes.ts`

**Files:**
- Modify: `server/app/routes.ts`

- [ ] **Step 1: Add import**

Add at the top of `server/app/routes.ts` with the other imports:
```ts
import erRoutes from "../routes/er.js";
```

- [ ] **Step 2: Register the route**

Add inside `registerApiRoutes`, before the `app.use("/api/test", testRoutes)` line:
```ts
app.use("/api/er", erRoutes);
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add server/routes/er.ts server/app/routes.ts
git commit -m "feat(server): add ER routes stub with GET /api/er/mode"
```

---

## Task 13: Add ER API functions to `src/lib/api.ts`

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Find the end of the existing API functions and add ER functions**

Add to the imports section at the top of `src/lib/api.ts`:
```ts
import type {
  ErModeResponse,
  ErBoardResponse,
  ErIntakeResponse,
  AssignErIntakeResponse,
  ErAssigneesResponse,
  AckErHandoffResponse,
  ErImpactResponse,
  CreateErIntakeRequest,
  AssignErIntakeRequest,
  AckErHandoffRequest,
  ErKpiWindowDays,
} from "../../shared/er-types.js";
```

Then append these functions to `src/lib/api.ts` (at the end of the file, before any closing):
```ts
// ── ER Wedge API ──────────────────────────────────────────────────────────────

export async function getErMode(): Promise<ErModeResponse> {
  const res = await fetch("/api/er/mode", { credentials: "include" });
  if (!res.ok) throw new Error(`GET /api/er/mode failed: ${res.status}`);
  return res.json() as Promise<ErModeResponse>;
}

export async function getErBoard(): Promise<ErBoardResponse> {
  const res = await fetch("/api/er/board", { credentials: "include" });
  if (!res.ok) throw new Error(`GET /api/er/board failed: ${res.status}`);
  return res.json() as Promise<ErBoardResponse>;
}

export async function createErIntake(body: CreateErIntakeRequest): Promise<ErIntakeResponse> {
  const res = await fetch("/api/er/intake", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /api/er/intake failed: ${res.status}`);
  return res.json() as Promise<ErIntakeResponse>;
}

export async function assignErIntake(id: string, body: AssignErIntakeRequest): Promise<AssignErIntakeResponse> {
  const res = await fetch(`/api/er/intake/${id}/assign`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PATCH /api/er/intake/${id}/assign failed: ${res.status}`);
  return res.json() as Promise<AssignErIntakeResponse>;
}

export async function getErAssignees(): Promise<ErAssigneesResponse> {
  const res = await fetch("/api/er/assignees", { credentials: "include" });
  if (!res.ok) throw new Error(`GET /api/er/assignees failed: ${res.status}`);
  return res.json() as Promise<ErAssigneesResponse>;
}

export async function ackErHandoff(id: string, body: AckErHandoffRequest): Promise<AckErHandoffResponse> {
  const res = await fetch(`/api/er/handoffs/${id}/ack`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /api/er/handoffs/${id}/ack failed: ${res.status}`);
  return res.json() as Promise<AckErHandoffResponse>;
}

export async function getErImpact(windowDays: ErKpiWindowDays = 14): Promise<ErImpactResponse> {
  const res = await fetch(`/api/er/impact?window=${windowDays}`, { credentials: "include" });
  if (!res.ok) throw new Error(`GET /api/er/impact failed: ${res.status}`);
  return res.json() as Promise<ErImpactResponse>;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(api): add typed ER API client functions"
```

---

## Task 14: Frontend ER mode hook + guard

**Files:**
- Create: `src/hooks/use-er-mode.ts`
- Create: `src/features/er/components/ErModeGuard.tsx`

- [ ] **Step 1: Create the hook**

Create `src/hooks/use-er-mode.ts`:
```ts
import { useState, useEffect } from "react";
import { getErMode } from "@/lib/api";
import type { ErModeState } from "../../../shared/er-types";

export interface ErModeResult {
  state: ErModeState;
  isLoaded: boolean;
}

// ER mode is fetched once per session mount and cached in module scope
// (avoids re-fetching on every route change).
let cached: ErModeState | null = null;

export function useErMode(): ErModeResult {
  const [state, setState] = useState<ErModeState>(cached ?? "disabled");
  const [isLoaded, setIsLoaded] = useState(cached !== null);

  useEffect(() => {
    if (cached !== null) return;
    let cancelled = false;
    getErMode()
      .then((res) => {
        if (cancelled) return;
        cached = res.state;
        setState(res.state);
        setIsLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        // Fail open: treat as disabled if we can't fetch mode.
        cached = "disabled";
        setState("disabled");
        setIsLoaded(true);
      });
    return () => { cancelled = true; };
  }, []);

  return { state, isLoaded };
}
```

- [ ] **Step 2: Create the guard component**

Create `src/features/er/components/ErModeGuard.tsx`:
```tsx
import { type ReactNode } from "react";
import { useLocation } from "wouter";
import { useErMode } from "@/hooks/use-er-mode";
import NotFoundPage from "@/pages/not-found";

// Pages accessible when ER mode is enforced (decision 2).
const ER_ALLOWED_UI_PATHS = new Set([
  "/patients",
  "/appointments",
  "/shift-handover",
  "/code-blue",
  "/er",
  "/er/impact",
]);

function isErAllowedPath(pathname: string): boolean {
  // Exact match
  if (ER_ALLOWED_UI_PATHS.has(pathname)) return true;
  // Prefix match for parameterised paths (/patients/:id)
  if (pathname.startsWith("/patients/")) return true;
  return false;
}

// Always-public paths (auth pages, landing) — never blocked.
function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/landing" ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/signup") ||
    pathname === "/home"
  );
}

export function ErModeGuard({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();
  const { state, isLoaded } = useErMode();

  // While loading, render children (avoid flash of 404 before mode is known).
  if (!isLoaded) return <>{children}</>;

  // Only enforce in enforced mode.
  if (state !== "enforced") return <>{children}</>;

  if (isPublicPath(pathname) || isErAllowedPath(pathname)) {
    return <>{children}</>;
  }

  return <NotFoundPage />;
}
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 4: Commit**

```bash
git add src/hooks/use-er-mode.ts src/features/er/components/ErModeGuard.tsx
git commit -m "feat(frontend): ER mode hook and concealment guard"
```

---

## Task 15: Page stubs + wire frontend routes

**Files:**
- Create: `src/pages/er-command-center.tsx`
- Create: `src/pages/er-impact.tsx`
- Modify: `src/app/routes.tsx`

- [ ] **Step 1: Create ER command center stub page**

Create `src/pages/er-command-center.tsx`:
```tsx
export default function ErCommandCenterPage() {
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">ER Command Center — coming in Week 3–6</p>
    </div>
  );
}
```

- [ ] **Step 2: Create ER impact stub page**

Create `src/pages/er-impact.tsx`:
```tsx
export default function ErImpactPage() {
  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-muted-foreground">ER Impact — coming in Week 6–10</p>
    </div>
  );
}
```

- [ ] **Step 3: Add lazy imports to routes.tsx**

Add to the lazy imports block at the top of `src/app/routes.tsx`:
```ts
const ErCommandCenterPage = lazy(() => import("@/pages/er-command-center"));
const ErImpactPage = lazy(() => import("@/pages/er-impact"));
```

- [ ] **Step 4: Add ER routes to the Switch**

In `src/app/routes.tsx`, wrap the entire `<Switch>` with `ErModeGuard` and add the two new routes inside.

Add to imports at the top:
```ts
import { ErModeGuard } from "@/features/er/components/ErModeGuard";
```

Change `AppRoutes()` to wrap the Switch:
```tsx
export function AppRoutes() {
  return (
    <PageErrorBoundary fallbackLabel="Page rendering failed">
      <ErModeGuard>
        <Switch>
          {/* ... existing routes unchanged ... */}
          <Route path="/er"><AuthGuard><ErCommandCenterPage /></AuthGuard></Route>
          <Route path="/er/impact"><AuthGuard><ErImpactPage /></AuthGuard></Route>
          <Route component={NotFoundPage} />
        </Switch>
      </ErModeGuard>
    </PageErrorBoundary>
  );
}
```

The two new `<Route>` lines go **before** `<Route component={NotFoundPage} />`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit`
Expected: zero errors

- [ ] **Step 6: Run unit tests to confirm nothing broke**

Run: `pnpm test`
Expected: all tests pass (ER mode + allowlist tests included)

- [ ] **Step 7: Commit**

```bash
git add src/pages/er-command-center.tsx src/pages/er-impact.tsx src/app/routes.tsx src/features/er/components/ErModeGuard.tsx
git commit -m "feat(frontend): add /er and /er/impact routes with ErModeGuard"
```

---

## Gate A verification checklist

Run these after all tasks are complete:

- [ ] `npx tsc --noEmit` — zero errors
- [ ] `pnpm test` — all tests pass
- [ ] `pnpm test -- tests/er-mode.test.ts tests/er-allowlist.test.ts` — 19 tests pass
- [ ] Start dev server: `pnpm dev`
- [ ] Confirm `GET /api/er/mode` returns `{ clinicId: "dev-clinic-default", state: "disabled" }`
- [ ] In dev, set `er_mode_state = 'enforced'` in DB for `dev-clinic-default`, then confirm `GET /api/equipment` returns 404 and `GET /api/patients` returns 200
- [ ] Set `ER_MODE_DEFAULT=enforced` in `.env`, restart, confirm same enforcement without DB change
- [ ] Navigate to `/er` in browser — command center stub page loads
- [ ] Navigate to `/equipment` in browser with enforced mode — `NotFoundPage` renders

---

## What's next (Week 3–6)

After Gate A is confirmed, the next plan covers:
- `server/services/er-board.service.ts` — aggregated board with deterministic `nextAction`
- Full intake + assign APIs with RBAC and audit logs
- Handoff ack state machine + overdue job
- ER Command Center UI with lane/badge model
- Quick intake form (< 20 sec target)
- Unified realtime event contract
