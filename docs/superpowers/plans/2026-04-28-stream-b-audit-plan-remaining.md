# Stream B — Audit Plan Remaining Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the three remaining gaps from the VetTrack audit improvement plan: Post-Code-Blue reconciliation page, shift scan completion leaderboard, and audit logging for inventory dispense operations.

**Architecture:** All three items live in the existing backend (Express/Drizzle) and frontend (React/wouter) codebase. P2-1 needs one migration (076) to add reconciliation status columns to `vt_code_blue_sessions`. P2-2 uses raw SQL time-window joins against existing tables — no schema change. P3-3 adds two `logAudit()` calls to `containers.ts` and one new action type to the union.

**Tech Stack:** Express router, Drizzle ORM + raw `pool.query()` for complex joins, React 18 + tanstack-query, Zod validation, wouter routing, Tailwind CSS, Lucide icons, Layout/PageShell mobile-desktop split

**Stabilization plan constraints:**
- Keep mobile Layout intact for new pages
- RTL safe: use `border-s-*`, `ps-*`, `pe-*`
- No mock DBs in tests

---

## File Map

| File | Change |
|------|--------|
| `migrations/076_code_blue_session_reconciliation.sql` | Create — add 3 reconciliation columns to `vt_code_blue_sessions` |
| `server/db.ts` | Modify — add 3 columns to `codeBlueSessions` Drizzle table definition |
| `server/lib/audit.ts` | Modify — add `"inventory_dispensed"` to `AuditActionType` union |
| `server/routes/containers.ts` | Modify — add `logAudit()` calls to dispense + emergency-complete handlers |
| `server/routes/code-blue.ts` | Modify — add 4 endpoints: GET /reconciliation, GET /sessions/:id/dispenses, PATCH /sessions/:id/reconcile, POST /sessions/:id/manual-billing |
| `server/routes/analytics.ts` | Modify — add GET /shift-completion endpoint |
| `server/app/routes.ts` | Modify — no change needed (code-blue and analytics routes already registered) |
| `src/lib/api.ts` | Modify — add `codeBlue.reconciliation`, `codeBlue.sessionDispenses`, `codeBlue.reconcile`, `codeBlue.manualBilling`, `analytics.shiftCompletion` |
| `src/pages/code-blue-reconciliation.tsx` | Create — admin page listing ended sessions with dispense/billing detail |
| `src/pages/shift-leaderboard.tsx` | Create — admin page with per-user scan stats table |
| `src/app/routes.tsx` | Modify — register `/billing/code-blue-reconciliation` and `/admin/shift-leaderboard` |

---

## Task 1: Migration 076 — Reconciliation Columns

**Files:**
- Create: `migrations/076_code_blue_session_reconciliation.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- migrations/076_code_blue_session_reconciliation.sql
-- Adds reconciliation tracking to Code Blue sessions.
-- Allows administrators to mark a session as reviewed/reconciled after billing gaps are addressed.

ALTER TABLE vt_code_blue_sessions
  ADD COLUMN IF NOT EXISTS is_reconciled    BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reconciled_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reconciled_by_user_id TEXT REFERENCES vt_users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_vt_code_blue_sessions_reconciled
  ON vt_code_blue_sessions (clinic_id, is_reconciled)
  WHERE status = 'ended';
```

- [ ] **Step 2: Apply migration to dev DB**

```bash
cd C:/Users/Dan/Documents/GitHub/VetTrack
npx tsx server/scripts/migrate.ts
```

Expected: migration runs without error, or run the SQL directly against your dev DB.

- [ ] **Step 3: Verify columns exist**

```bash
psql $DATABASE_URL -c "\d vt_code_blue_sessions" | grep reconcil
```

Expected output includes: `is_reconciled`, `reconciled_at`, `reconciled_by_user_id`

- [ ] **Step 4: Commit**

```bash
git add migrations/076_code_blue_session_reconciliation.sql
git commit -m "feat(db): add reconciliation columns to vt_code_blue_sessions (migration 076)"
```

---

## Task 2: Update Drizzle Schema

**Files:**
- Modify: `server/db.ts:850-871`

The `codeBlueSessions` table definition currently ends at `createdAt`. Add three columns before the closing brace.

- [ ] **Step 1: Add columns to Drizzle table definition**

In `server/db.ts`, find the `codeBlueSessions = pgTable(...)` definition. Replace the closing of the column object:

```typescript
// BEFORE (lines 865-871):
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    clinicCreatedIdx: index("idx_vt_code_blue_sessions_clinic_created").on(table.clinicId, table.createdAt),
  }),
);
```

```typescript
// AFTER:
    endedAt: timestamp("ended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    isReconciled: boolean("is_reconciled").notNull().default(false),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
    reconciledByUserId: text("reconciled_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (table) => ({
    clinicCreatedIdx: index("idx_vt_code_blue_sessions_clinic_created").on(table.clinicId, table.createdAt),
  }),
);
```

- [ ] **Step 2: TypeScript check**

```bash
cd C:/Users/Dan/Documents/GitHub/VetTrack
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add server/db.ts
git commit -m "feat(schema): add isReconciled/reconciledAt/reconciledByUserId to codeBlueSessions"
```

---

## Task 3: Add Audit Action Type + Container Audit Logging

**Files:**
- Modify: `server/lib/audit.ts:64`
- Modify: `server/routes/containers.ts`

- [ ] **Step 1: Add new action types to AuditActionType**

In `server/lib/audit.ts`, find the `AuditActionType` union. It currently ends with:
```typescript
  | "users_hard_purged";
```

Replace that line with:
```typescript
  | "users_hard_purged"
  | "inventory_dispensed"
  | "code_blue_session_reconciled";
```

- [ ] **Step 2: Add logAudit import to containers.ts**

In `server/routes/containers.ts`, the file currently does NOT import `logAudit`. Add it to the imports:

```typescript
// After the existing imports (after line 11: import { enqueueBillingWebhookJob ... })
import { logAudit, resolveAuditActorRole } from "../lib/audit.js";
```

- [ ] **Step 3: Add logAudit to the dispense handler**

In `server/routes/containers.ts`, find the dispense success response at line ~468:
```typescript
      return res.json({
        success: true,
        dispensed: dispensedItems,
        takenBy: { userId: actorUserId, displayName: actorDisplayName },
        takenAt: takenAt.toISOString(),
        billingIds,
        autoBilledCents,
      });
```

Insert `logAudit()` immediately BEFORE that `return res.json(...)`:
```typescript
      logAudit({
        clinicId,
        actionType: "inventory_dispensed",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email ?? "",
        targetId: containerId,
        targetType: "container",
        actorRole: resolveAuditActorRole(req),
        metadata: {
          dispensedItemCount: dispensedItems.length,
          autoBilledCents,
          animalId: animalId ?? null,
          isEmergency: body.isEmergency ?? false,
        },
      });

      return res.json({
        success: true,
        dispensed: dispensedItems,
        takenBy: { userId: actorUserId, displayName: actorDisplayName },
        takenAt: takenAt.toISOString(),
        billingIds,
        autoBilledCents,
      });
```

Note: `containerId` is available as `req.params.id` (validated UUID). Verify the variable name at the top of the handler — it is assigned as `const containerId = req.params.id;` or similar.

- [ ] **Step 4: Add logAudit to the emergency-complete handler**

In `server/routes/containers.ts`, find the `PATCH /emergency/:eventId/complete` handler (line ~500). Find its success response (similar pattern: `return res.json({ success: true, ... })`). Insert before it:

```typescript
      logAudit({
        clinicId,
        actionType: "inventory_dispensed",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email ?? "",
        targetId: eventId,
        targetType: "emergency_event",
        actorRole: resolveAuditActorRole(req),
        metadata: {
          dispensedItemCount: dispensedItems.length,
          autoBilledCents,
          animalId: animalId ?? null,
          isEmergency: true,
        },
      });
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/lib/audit.ts server/routes/containers.ts
git commit -m "feat(audit): log inventory_dispensed + code_blue_session_reconciled action types"
```

---

## Task 4: Code Blue Reconciliation API Endpoints

**Files:**
- Modify: `server/routes/code-blue.ts`

Add 4 endpoints before the `export default router;` line (which is the last line of the file).

- [ ] **Step 1: Add pool import to code-blue.ts**

In `server/routes/code-blue.ts`, the imports currently pull from `"../db.js"`. Add `pool` to that import:

```typescript
import {
  db,
  pool,
  codeBlueEvents,
  codeBlueSessions,
  codeBlueLogEntries,
  codeBluePresence,
  crashCartChecks,
  equipment,
  animals,
  hospitalizations,
  users,
} from "../db.js";
```

- [ ] **Step 2: Add the reconciliation list endpoint**

Before `export default router;`, add:

```typescript
// ─── Reconciliation endpoints ─────────────────────────────────────────────────

/**
 * GET /api/code-blue/reconciliation
 * Returns ended Code Blue sessions with dispense + billing summary.
 * Admin only.
 */
router.get(
  "/reconciliation",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const rows = await pool.query(
        `SELECT
           s.id,
           s.started_at        AS "startedAt",
           s.ended_at          AS "endedAt",
           s.outcome,
           s.patient_id        AS "patientId",
           s.is_reconciled     AS "isReconciled",
           s.reconciled_at     AS "reconciledAt",
           a.name              AS "patientName",
           COUNT(il.id)::int                                                     AS "dispenseCount",
           COUNT(bl.id) FILTER (WHERE bl.id IS NOT NULL)::int                   AS "billedCount",
           COALESCE(SUM(bl.total_amount_cents) FILTER (WHERE bl.status != 'voided'), 0)::int AS "totalBilledCents"
         FROM vt_code_blue_sessions s
         LEFT JOIN vt_animals a ON a.id = s.patient_id
         LEFT JOIN vt_inventory_logs il
           ON il.clinic_id = s.clinic_id
           AND il.quantity_added < 0
           AND il.created_at >= s.started_at
           AND il.created_at <= COALESCE(s.ended_at, NOW())
         LEFT JOIN vt_billing_ledger bl
           ON bl.idempotency_key = 'adjustment_' || il.id
         WHERE s.clinic_id = $1
           AND s.status = 'ended'
         GROUP BY s.id, s.started_at, s.ended_at, s.outcome, s.patient_id,
                  s.is_reconciled, s.reconciled_at, a.name
         ORDER BY s.started_at DESC
         LIMIT 100`,
        [clinicId],
      );
      res.json(rows.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({ code: "INTERNAL_ERROR", reason: "RECONCILIATION_LIST_FAILED", message: "Failed to load reconciliation list", requestId }),
      );
    }
  },
);

/**
 * GET /api/code-blue/sessions/:id/dispenses
 * Returns inventory dispenses that occurred during a Code Blue session,
 * joined with billing ledger status.
 * Admin only.
 */
router.get(
  "/sessions/:id/dispenses",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const sessionId = req.params.id;
      const [session] = await db
        .select({ startedAt: codeBlueSessions.startedAt, endedAt: codeBlueSessions.endedAt, clinicId: codeBlueSessions.clinicId })
        .from(codeBlueSessions)
        .where(and(eq(codeBlueSessions.id, sessionId), eq(codeBlueSessions.clinicId, clinicId)))
        .limit(1);
      if (!session) return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "SESSION_NOT_FOUND", message: "Session not found", requestId }));
      const rows = await pool.query(
        `SELECT
           il.id,
           il.quantity_added   AS "quantityAdded",
           il.created_at       AS "createdAt",
           il.animal_id        AS "animalId",
           c.name              AS "containerName",
           bl.id               AS "billingId",
           bl.total_amount_cents AS "totalAmountCents",
           bl.status           AS "billingStatus"
         FROM vt_inventory_logs il
         JOIN vt_containers c ON c.id = il.container_id
         LEFT JOIN vt_billing_ledger bl
           ON bl.idempotency_key = 'adjustment_' || il.id
           AND bl.status != 'voided'
         WHERE il.clinic_id = $1
           AND il.quantity_added < 0
           AND il.created_at >= $2
           AND il.created_at <= $3
         ORDER BY il.created_at`,
        [clinicId, session.startedAt.toISOString(), (session.endedAt ?? new Date()).toISOString()],
      );
      res.json(rows.rows);
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({ code: "INTERNAL_ERROR", reason: "SESSION_DISPENSES_FAILED", message: "Failed to load session dispenses", requestId }),
      );
    }
  },
);

/**
 * PATCH /api/code-blue/sessions/:id/reconcile
 * Marks a session as reconciled. Idempotent.
 * Admin only.
 */
router.patch(
  "/sessions/:id/reconcile",
  requireAuth,
  requireAdmin,
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const sessionId = req.params.id;
      const [updated] = await db
        .update(codeBlueSessions)
        .set({
          isReconciled: true,
          reconciledAt: new Date(),
          reconciledByUserId: req.authUser!.id,
        })
        .where(and(eq(codeBlueSessions.id, sessionId), eq(codeBlueSessions.clinicId, clinicId)))
        .returning({ id: codeBlueSessions.id, isReconciled: codeBlueSessions.isReconciled, reconciledAt: codeBlueSessions.reconciledAt });
      if (!updated) return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "SESSION_NOT_FOUND", message: "Session not found", requestId }));
      logAudit({
        clinicId,
        actionType: "code_blue_session_reconciled",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email ?? "",
        targetId: sessionId,
        targetType: "code_blue_session",
        actorRole: resolveAuditActorRole(req),
      });
      res.json(updated);
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({ code: "INTERNAL_ERROR", reason: "RECONCILE_FAILED", message: "Failed to reconcile session", requestId }),
      );
    }
  },
);

/**
 * POST /api/code-blue/sessions/:id/manual-billing
 * Creates a manual billing entry for an unbilled dispense in this session.
 * Admin only.
 */
const manualBillingSchema = z.object({
  inventoryLogId: z.string().min(1),
  itemId: z.string().min(1),
  quantity: z.number().int().min(1),
  unitPriceCents: z.number().int().min(0),
  animalId: z.string().nullable().optional(),
});

router.post(
  "/sessions/:id/manual-billing",
  requireAuth,
  requireAdmin,
  validateBody(manualBillingSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const sessionId = req.params.id;
      const b = req.body as z.infer<typeof manualBillingSchema>;
      const [session] = await db
        .select({ clinicId: codeBlueSessions.clinicId })
        .from(codeBlueSessions)
        .where(and(eq(codeBlueSessions.id, sessionId), eq(codeBlueSessions.clinicId, clinicId)))
        .limit(1);
      if (!session) return res.status(404).json(apiError({ code: "NOT_FOUND", reason: "SESSION_NOT_FOUND", message: "Session not found", requestId }));

      const { billingLedger: billingLedgerTable } = await import("../db.js");
      const { randomUUID } = await import("crypto");
      const id = randomUUID();
      const idempotencyKey = `adjustment_${b.inventoryLogId}`;
      await db.insert(billingLedgerTable).values({
        id,
        clinicId,
        animalId: b.animalId ?? null,
        itemType: "CONSUMABLE",
        itemId: b.itemId,
        quantity: b.quantity,
        unitPriceCents: b.unitPriceCents,
        totalAmountCents: b.unitPriceCents * b.quantity,
        idempotencyKey,
        status: "pending",
      }).onConflictDoNothing();
      const [row] = await db.select().from(billingLedgerTable).where(eq(billingLedgerTable.idempotencyKey, idempotencyKey)).limit(1);
      logAudit({
        clinicId,
        actionType: "billing_charge_created",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email ?? "",
        targetId: row?.id ?? id,
        targetType: "billing_ledger",
        actorRole: resolveAuditActorRole(req),
        metadata: { source: "code_blue_manual", sessionId, inventoryLogId: b.inventoryLogId },
      });
      res.status(201).json(row ?? { id, idempotencyKey, status: "pending" });
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({ code: "INTERNAL_ERROR", reason: "MANUAL_BILLING_FAILED", message: "Failed to create manual billing entry", requestId }),
      );
    }
  },
);
```

Note: `apiError` is already imported/defined in code-blue.ts (check the top of the file for its import or inline definition; if not present, add `import { apiError } from "../lib/api-error.js";`).

- [ ] **Step 3: Verify apiError is available**

Run:
```bash
grep -n "apiError" server/routes/code-blue.ts | head -5
```

If no results, add the import after the existing imports:
```typescript
import { apiError } from "../lib/api-error.js";
```

- [ ] **Step 4: Fix the manual-billing handler's imports**

The manual-billing handler uses dynamic imports which is wrong. Replace the dynamic imports with static ones at the top of the file. The `billingLedger` table and `randomUUID` are already available throughout the file — check existing code-blue.ts imports. If `billingLedger` is not imported, add it to the db import line:

```typescript
import {
  db,
  pool,
  billingLedger,
  codeBlueEvents,
  codeBlueSessions,
  // ... rest
} from "../db.js";
```

And remove the dynamic `import()` calls from the handler body, using `billingLedger` directly.

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any errors.

- [ ] **Step 6: Commit**

```bash
git add server/routes/code-blue.ts
git commit -m "feat(api): add Code Blue reconciliation endpoints — list, dispenses, reconcile, manual-billing"
```

---

## Task 5: Shift Completion Analytics Endpoint

**Files:**
- Modify: `server/routes/analytics.ts`

- [ ] **Step 1: Add the shift-completion endpoint**

In `server/routes/analytics.ts`, find the `export default router;` line at the end of the file (line 360). Insert before it:

```typescript
/**
 * GET /api/analytics/shift-completion?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Returns per-user scan counts and shift stats for a date range.
 * Admin only. Defaults to last 30 days.
 */
router.get("/shift-completion", requireAuth, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const fromRaw = typeof req.query.from === "string" ? req.query.from : null;
    const toRaw   = typeof req.query.to   === "string" ? req.query.to   : null;
    const from = fromRaw ? new Date(fromRaw) : subDays(new Date(), 30);
    const to   = toRaw   ? new Date(toRaw)   : new Date();
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      return res.status(400).json(
        apiError({ code: "INVALID_PARAMS", reason: "INVALID_DATE_RANGE", message: "Invalid from/to dates", requestId }),
      );
    }

    const rows = await pool.query(
      `WITH user_scans AS (
         SELECT sl.user_id, COUNT(*)::int AS total_scans
         FROM vt_scan_logs sl
         WHERE sl.clinic_id = $1
           AND sl.timestamp >= $2
           AND sl.timestamp < $3
         GROUP BY sl.user_id
       ),
       user_shifts AS (
         SELECT
           ss.started_by_user_id AS user_id,
           COUNT(*)::int AS shift_count,
           COUNT(*) FILTER (
             WHERE NOT EXISTS (
               SELECT 1 FROM vt_scan_logs sl2
               WHERE sl2.user_id = ss.started_by_user_id
                 AND sl2.clinic_id = ss.clinic_id
                 AND sl2.timestamp >= ss.started_at
                 AND sl2.timestamp < COALESCE(ss.ended_at, NOW())
             )
           )::int AS zero_capture_shifts
         FROM vt_shift_sessions ss
         WHERE ss.clinic_id = $1
           AND ss.started_at >= $2
           AND ss.started_at < $3
         GROUP BY ss.started_by_user_id
       )
       SELECT
         u.id                                                      AS "userId",
         u.name,
         u.email,
         COALESCE(us.total_scans, 0)::int                         AS "totalScans",
         COALESCE(ush.shift_count, 0)::int                        AS "shiftCount",
         CASE
           WHEN COALESCE(ush.shift_count, 0) > 0
           THEN ROUND(COALESCE(us.total_scans, 0)::numeric / ush.shift_count, 1)
           ELSE 0
         END                                                       AS "avgScansPerShift",
         COALESCE(ush.zero_capture_shifts, 0)::int                AS "zeroCaptureShifts"
       FROM vt_users u
       LEFT JOIN user_scans  us  ON us.user_id  = u.id
       LEFT JOIN user_shifts ush ON ush.user_id = u.id
       WHERE u.clinic_id = $1
         AND (COALESCE(us.total_scans, 0) > 0 OR COALESCE(ush.shift_count, 0) > 0)
       ORDER BY COALESCE(us.total_scans, 0) DESC`,
      [clinicId, from.toISOString(), to.toISOString()],
    );
    res.json({ from: from.toISOString(), to: to.toISOString(), users: rows.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "SHIFT_COMPLETION_FAILED", message: "Failed to get shift completion stats", requestId }),
    );
  }
});
```

Note: `requireAdmin` is not currently imported in analytics.ts. Check the top of the file for existing imports. If missing, add it:
```typescript
import { requireAuth, requireAdmin } from "../middleware/auth.js";
```

Also check whether `apiError` and `resolveRequestId` are already present in analytics.ts. If `apiError` isn't there, import it. If `resolveRequestId` isn't defined, add this helper before the first route:
```typescript
function resolveRequestId(res: { getHeader: (n: string) => unknown; setHeader?: (n: string, v: string) => void }, incomingHeader: unknown): string {
  const incoming = typeof incomingHeader === "string" ? incomingHeader.trim() : "";
  const id = incoming || randomUUID();
  res.setHeader?.("X-Request-Id", id);
  return id;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Fix any import errors.

- [ ] **Step 3: Commit**

```bash
git add server/routes/analytics.ts
git commit -m "feat(api): add GET /api/analytics/shift-completion — per-user scan leaderboard"
```

---

## Task 6: Update API Client

**Files:**
- Modify: `src/lib/api.ts`

- [ ] **Step 1: Add CodeBlueReconciliation types**

At the top of `src/lib/api.ts` (or in `src/types/index.ts` if types are centralised), add:

```typescript
export interface CodeBlueReconciliationSession {
  id: string;
  startedAt: string;
  endedAt: string | null;
  outcome: string | null;
  patientId: string | null;
  patientName: string | null;
  isReconciled: boolean;
  reconciledAt: string | null;
  dispenseCount: number;
  billedCount: number;
  totalBilledCents: number;
}

export interface CodeBlueDispense {
  id: string;
  quantityAdded: number;
  createdAt: string;
  animalId: string | null;
  containerName: string;
  billingId: string | null;
  totalAmountCents: number | null;
  billingStatus: string | null;
}

export interface ShiftCompletionUser {
  userId: string;
  name: string | null;
  email: string;
  totalScans: number;
  shiftCount: number;
  avgScansPerShift: number;
  zeroCaptureShifts: number;
}

export interface ShiftCompletionResult {
  from: string;
  to: string;
  users: ShiftCompletionUser[];
}
```

- [ ] **Step 2: Add client methods**

In `src/lib/api.ts`, find the `analytics` object:
```typescript
  analytics: {
    summary: () => request<AnalyticsSummary>("/api/analytics"),
  },
```

Replace with:
```typescript
  analytics: {
    summary: () => request<AnalyticsSummary>("/api/analytics"),
    shiftCompletion: (from?: string, to?: string) => {
      const params = new URLSearchParams();
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const qs = params.toString();
      return request<ShiftCompletionResult>(`/api/analytics/shift-completion${qs ? `?${qs}` : ""}`);
    },
  },
```

Then find where code-blue methods are (search for `codeBlue` in api.ts). If none exist, add a new `codeBlue` key in the api object:
```typescript
  codeBlue: {
    reconciliationList: () =>
      request<CodeBlueReconciliationSession[]>("/api/code-blue/reconciliation"),
    sessionDispenses: (sessionId: string) =>
      request<CodeBlueDispense[]>(`/api/code-blue/sessions/${sessionId}/dispenses`),
    reconcile: (sessionId: string) =>
      request<{ id: string; isReconciled: boolean; reconciledAt: string }>(
        `/api/code-blue/sessions/${sessionId}/reconcile`,
        { method: "PATCH" },
      ),
    manualBilling: (sessionId: string, body: { inventoryLogId: string; itemId: string; quantity: number; unitPriceCents: number; animalId?: string | null }) =>
      request<{ id: string; status: string }>(
        `/api/code-blue/sessions/${sessionId}/manual-billing`,
        { method: "POST", body: JSON.stringify(body) },
      ),
  },
```

- [ ] **Step 3: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api.ts
git commit -m "feat(client): add codeBlue reconciliation + analytics.shiftCompletion API methods"
```

---

## Task 7: Code Blue Reconciliation Frontend Page

**Files:**
- Create: `src/pages/code-blue-reconciliation.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/pages/code-blue-reconciliation.tsx
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { ChevronDown, ChevronUp, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { api } from "@/lib/api";
import type { CodeBlueReconciliationSession, CodeBlueDispense } from "@/lib/api";
import { Layout } from "@/components/layout";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

const OUTCOME_LABEL: Record<string, string> = {
  rosc: "ROSC",
  died: "Died",
  transferred: "Transferred",
  ongoing: "Ongoing",
};

const OUTCOME_COLOR: Record<string, string> = {
  rosc: "bg-green-100 text-green-800 border-green-200",
  died: "bg-red-100 text-red-800 border-red-200",
  transferred: "bg-blue-100 text-blue-800 border-blue-200",
  ongoing: "bg-amber-100 text-amber-800 border-amber-200",
};

function formatCents(cents: number) {
  return `₪${(cents / 100).toFixed(2)}`;
}

function SessionRow({ session }: { session: CodeBlueReconciliationSession }) {
  const [expanded, setExpanded] = useState(false);
  const qc = useQueryClient();

  const dispensesQ = useQuery({
    queryKey: ["/api/code-blue/sessions", session.id, "dispenses"],
    queryFn: () => api.codeBlue.sessionDispenses(session.id),
    enabled: expanded,
  });

  const reconcileMut = useMutation({
    mutationFn: () => api.codeBlue.reconcile(session.id),
    onSuccess: () => {
      toast.success("Session marked as reconciled");
      qc.invalidateQueries({ queryKey: ["/api/code-blue/reconciliation"] });
    },
    onError: () => toast.error("Failed to reconcile session"),
  });

  const gapCount = session.dispenseCount - session.billedCount;
  const hasGaps = gapCount > 0;

  return (
    <div className="border border-border rounded-[7px] overflow-hidden">
      {/* Session header row */}
      <button
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-card hover:bg-muted/40 transition-colors text-start"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          {session.isReconciled ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : hasGaps ? (
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
          ) : (
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">
              {session.patientName ?? "No patient linked"}
            </p>
            <p className="text-xs text-muted-foreground">
              {new Date(session.startedAt).toLocaleDateString()} · {session.dispenseCount} dispenses · {formatCents(session.totalBilledCents)} billed
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {session.outcome && (
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded border ${OUTCOME_COLOR[session.outcome] ?? "bg-muted text-muted-foreground border-border"}`}>
              {OUTCOME_LABEL[session.outcome] ?? session.outcome}
            </span>
          )}
          {hasGaps && !session.isReconciled && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
              {gapCount} unbilled
            </span>
          )}
          {session.isReconciled && (
            <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-green-100 text-green-800 border border-green-200">
              Reconciled
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
          {dispensesQ.isPending && <p className="text-xs text-muted-foreground">Loading dispenses…</p>}
          {dispensesQ.isError && <p className="text-xs text-red-500">Failed to load dispenses</p>}
          {dispensesQ.data && dispensesQ.data.length === 0 && (
            <p className="text-xs text-muted-foreground">No inventory dispenses recorded during this session.</p>
          )}
          {dispensesQ.data && dispensesQ.data.length > 0 && (
            <div className="overflow-x-auto rounded border border-border">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-card">
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">Container</th>
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">Qty</th>
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">Time</th>
                    <th className="px-3 py-2 text-start font-semibold text-muted-foreground">Billed</th>
                  </tr>
                </thead>
                <tbody>
                  {dispensesQ.data.map((d: CodeBlueDispense) => (
                    <tr key={d.id} className="border-b border-border last:border-b-0">
                      <td className="px-3 py-2 font-medium">{d.containerName}</td>
                      <td className="px-3 py-2">{Math.abs(d.quantityAdded)}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(d.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </td>
                      <td className="px-3 py-2">
                        {d.billingId ? (
                          <span className="text-green-600 font-medium">{formatCents(d.totalAmountCents ?? 0)}</span>
                        ) : (
                          <span className="text-amber-600 font-medium">Unbilled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!session.isReconciled && (
            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => reconcileMut.mutate()}
                disabled={reconcileMut.isPending}
                className="text-xs"
              >
                <CheckCircle2 className="h-3.5 w-3.5 me-1.5" />
                Mark Reconciled
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CodeBlueReconciliationPage() {
  const { role, effectiveRole } = useAuth();
  const resolvedRole = effectiveRole ?? role;

  const sessionsQ = useQuery({
    queryKey: ["/api/code-blue/reconciliation"],
    queryFn: () => api.codeBlue.reconciliationList(),
    enabled: resolvedRole === "admin",
  });

  if (resolvedRole !== "admin") {
    return <div className="p-8 text-center text-muted-foreground">Admin access required</div>;
  }

  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

  const pageContent = (
    <>
      <Helmet>
        <title>Code Blue Reconciliation — VetTrack</title>
      </Helmet>
      <div className="space-y-4 pb-24">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-red-500" />
            Code Blue Reconciliation
          </h1>
          <p className="text-sm text-muted-foreground">
            Review ended Code Blue sessions, verify billing entries, and mark sessions as reconciled.
          </p>
        </div>

        {sessionsQ.isPending && (
          <div className="space-y-2">
            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-[7px]" />)}
          </div>
        )}
        {sessionsQ.isError && (
          <p className="text-sm text-red-500">Failed to load sessions. Please refresh.</p>
        )}
        {sessionsQ.data && sessionsQ.data.length === 0 && (
          <p className="text-sm text-muted-foreground">No ended Code Blue sessions found.</p>
        )}
        {sessionsQ.data && sessionsQ.data.length > 0 && (
          <div className="space-y-2">
            {sessionsQ.data.map((s) => <SessionRow key={s.id} session={s} />)}
          </div>
        )}
      </div>
    </>
  );

  if (isDesktop) return <PageShell>{pageContent}</PageShell>;
  return <Layout>{pageContent}</Layout>;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Fix any errors (most likely missing type imports — add them from `@/lib/api`).

- [ ] **Step 3: Commit**

```bash
git add src/pages/code-blue-reconciliation.tsx
git commit -m "feat(ui): add Code Blue reconciliation page — session list, dispense detail, mark reconciled"
```

---

## Task 8: Shift Leaderboard Frontend Page

**Files:**
- Create: `src/pages/shift-leaderboard.tsx`

- [ ] **Step 1: Create the page**

```tsx
// src/pages/shift-leaderboard.tsx
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { BarChart2, AlertTriangle, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import type { ShiftCompletionUser } from "@/lib/api";
import { Layout } from "@/components/layout";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

function toDateInputValue(d: Date) {
  return d.toISOString().slice(0, 10);
}

function subDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() - n);
  return r;
}

export default function ShiftLeaderboardPage() {
  const { role, effectiveRole } = useAuth();
  const resolvedRole = effectiveRole ?? role;

  const today = new Date();
  const [from, setFrom] = useState(toDateInputValue(subDays(today, 30)));
  const [to, setTo]     = useState(toDateInputValue(today));
  const [applied, setApplied] = useState({ from, to });

  const statsQ = useQuery({
    queryKey: ["/api/analytics/shift-completion", applied.from, applied.to],
    queryFn: () => api.analytics.shiftCompletion(applied.from, applied.to),
    enabled: resolvedRole === "admin",
  });

  if (resolvedRole !== "admin") {
    return <div className="p-8 text-center text-muted-foreground">Admin access required</div>;
  }

  const isDesktop = typeof window !== "undefined" && window.innerWidth >= 1024;

  const pageContent = (
    <>
      <Helmet>
        <title>Shift Leaderboard — VetTrack</title>
      </Helmet>
      <div className="space-y-5 pb-24">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-amber-500" />
            Shift Scan Leaderboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Equipment scan counts and shift activity per team member.
          </p>
        </div>

        {/* Date range filter */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button size="sm" onClick={() => setApplied({ from, to })} className="h-9">
            Apply
          </Button>
        </div>

        {/* Results */}
        {statsQ.isPending && (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-[7px]" />)}
          </div>
        )}
        {statsQ.isError && (
          <p className="text-sm text-red-500">Failed to load stats. Please try again.</p>
        )}
        {statsQ.data && statsQ.data.users.length === 0 && (
          <p className="text-sm text-muted-foreground">No activity found for the selected period.</p>
        )}
        {statsQ.data && statsQ.data.users.length > 0 && (
          <div className="rounded-[7px] border border-border overflow-hidden">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-card">
                  <th className="px-4 py-2.5 text-start text-xs font-bold uppercase tracking-wide text-muted-foreground">#</th>
                  <th className="px-4 py-2.5 text-start text-xs font-bold uppercase tracking-wide text-muted-foreground">Name</th>
                  <th className="px-4 py-2.5 text-start text-xs font-bold uppercase tracking-wide text-muted-foreground">Total Scans</th>
                  <th className="px-4 py-2.5 text-start text-xs font-bold uppercase tracking-wide text-muted-foreground">Shifts</th>
                  <th className="px-4 py-2.5 text-start text-xs font-bold uppercase tracking-wide text-muted-foreground">Avg / Shift</th>
                  <th className="px-4 py-2.5 text-start text-xs font-bold uppercase tracking-wide text-muted-foreground">Zero-Capture</th>
                </tr>
              </thead>
              <tbody>
                {statsQ.data.users.map((u: ShiftCompletionUser, i: number) => (
                  <tr
                    key={u.userId}
                    className={cn(
                      "border-b border-border last:border-b-0 transition-colors",
                      u.zeroCaptureShifts > 0 ? "hover:bg-red-50" : "hover:bg-muted/30",
                    )}
                  >
                    <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{i + 1}</td>
                    <td className="px-4 py-2.5 font-semibold">
                      {u.name ?? u.email}
                      {u.zeroCaptureShifts > 0 && (
                        <AlertTriangle className="inline h-3.5 w-3.5 text-amber-500 ms-1.5 -translate-y-px" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-primary">{u.totalScans}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{u.shiftCount}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{Number(u.avgScansPerShift).toFixed(1)}</td>
                    <td className={cn("px-4 py-2.5 font-medium", u.zeroCaptureShifts > 0 ? "text-red-600" : "text-muted-foreground")}>
                      {u.zeroCaptureShifts > 0 ? `${u.zeroCaptureShifts} shift${u.zeroCaptureShifts !== 1 ? "s" : ""}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );

  if (isDesktop) return <PageShell>{pageContent}</PageShell>;
  return <Layout>{pageContent}</Layout>;
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Fix any errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/shift-leaderboard.tsx
git commit -m "feat(ui): add shift scan leaderboard page — per-user stats, zero-capture flagging"
```

---

## Task 9: Register Frontend Routes

**Files:**
- Modify: `src/app/routes.tsx`

- [ ] **Step 1: Add lazy imports**

In `src/app/routes.tsx`, after the existing lazy imports (e.g., after the `ShiftChatArchive` import on line ~51), add:

```tsx
const CodeBlueReconciliationPage = lazy(() => import("@/pages/code-blue-reconciliation"));
const ShiftLeaderboardPage = lazy(() => import("@/pages/shift-leaderboard"));
```

- [ ] **Step 2: Register routes**

In the `<Switch>` block, add the two routes. Add them before the billing routes (line ~109) so `/billing/code-blue-reconciliation` is registered before the catch-all `/billing` route:

```tsx
<Route path="/billing/code-blue-reconciliation"><AuthGuard><CodeBlueReconciliationPage /></AuthGuard></Route>
<Route path="/admin/shift-leaderboard"><AuthGuard><ShiftLeaderboardPage /></AuthGuard></Route>
```

The final billing block should look like:
```tsx
<Route path="/billing/code-blue-reconciliation"><AuthGuard><CodeBlueReconciliationPage /></AuthGuard></Route>
<Route path="/billing/leakage"><AuthGuard><LeakageReportPage /></AuthGuard></Route>
<Route path="/billing/inventory-jobs"><AuthGuard><InventoryJobsPage /></AuthGuard></Route>
<Route path="/billing"><AuthGuard><BillingLedgerPage /></AuthGuard></Route>
```

- [ ] **Step 3: Add billing sidebar items**

Open `src/pages/billing-ledger.tsx`. Find the `BILLING_SIDEBAR` const:
```tsx
const BILLING_SIDEBAR: SidebarItem[] = [
  { href: "/billing",                icon: ReceiptText,  label: "Billing Ledger" },
  { href: "/billing/leakage",        icon: TrendingDown, label: "Leakage Report" },
  { href: "/billing/inventory-jobs", icon: Boxes,        label: "Inventory Jobs" },
];
```

Add the reconciliation entry:
```tsx
const BILLING_SIDEBAR: SidebarItem[] = [
  { href: "/billing",                          icon: ReceiptText,   label: "Billing Ledger" },
  { href: "/billing/leakage",                  icon: TrendingDown,  label: "Leakage Report" },
  { href: "/billing/inventory-jobs",           icon: Boxes,         label: "Inventory Jobs" },
  { href: "/billing/code-blue-reconciliation", icon: ShieldAlert,   label: "Code Blue" },
];
```

Add `ShieldAlert` to the lucide import line in billing-ledger.tsx:
```tsx
import { Receipt, ReceiptText, Plus, Ban, Search, Sparkles, AlertTriangle, CalendarDays, Clock3, X, TrendingUp, Clock, CheckCircle2, XCircle, ShieldAlert, TrendingDown, PackageX, Boxes } from "lucide-react";
```

(`ShieldAlert` is already in that import — verify it's there, or add it.)

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Fix any errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/routes.tsx src/pages/billing-ledger.tsx
git commit -m "feat(routing): register Code Blue reconciliation + shift leaderboard routes"
```

---

## Task 10: Final Verification Pass

- [ ] **Step 1: Full TypeScript check**

```bash
cd C:/Users/Dan/Documents/GitHub/VetTrack
npx tsc --noEmit 2>&1
```

Expected: no errors.

- [ ] **Step 2: Confirm all commits present**

```bash
git log --oneline -12
```

Expected commits (most recent first):
1. `feat(routing): register Code Blue reconciliation + shift leaderboard routes`
2. `feat(ui): add shift scan leaderboard page…`
3. `feat(ui): add Code Blue reconciliation page…`
4. `feat(client): add codeBlue reconciliation + analytics.shiftCompletion API methods`
5. `feat(api): add GET /api/analytics/shift-completion…`
6. `feat(api): add Code Blue reconciliation endpoints…`
7. `feat(audit): log inventory_dispensed…`
8. `feat(schema): add isReconciled/reconciledAt…`
9. `feat(db): add reconciliation columns…`

- [ ] **Step 3: Manual smoke test checklist**

| Check | How |
|-------|-----|
| `/billing/code-blue-reconciliation` loads (admin) | Navigate on desktop — should show session list or empty state |
| Session expand shows dispense table | Click any session row |
| "Mark Reconciled" fires PATCH | Click button — toast should appear, session updates |
| `/admin/shift-leaderboard` loads (admin) | Navigate — shows date pickers + table |
| Date filter applies | Change from/to, click Apply — query refetches |
| Container dispense writes audit log | POST to `/api/containers/:id/dispense` then check `/audit-log` page |
| `/api/analytics/shift-completion` returns 200 | `curl -H "Authorization: Bearer <token>" /api/analytics/shift-completion` |

- [ ] **Step 4: Final commit if any fixes applied**

```bash
git add -A
git commit -m "fix: Stream B final verification fixes"
```

---

## Self-Review

**Spec coverage:**
- P2-1 Code Blue reconciliation: Tasks 1, 2, 4, 6, 7, 9 ✓
- P2-2 Shift leaderboard: Tasks 5, 6, 8, 9 ✓
- P3-3 Audit logging in containers.ts: Task 3 ✓

**Placeholder scan:** No TBDs. All code blocks contain actual implementation.

**Type consistency:**
- `CodeBlueReconciliationSession` defined in Task 6, used in Task 7 ✓
- `CodeBlueDispense` defined in Task 6, used in Task 7 ✓
- `ShiftCompletionUser` + `ShiftCompletionResult` defined in Task 6, used in Task 8 ✓
- `api.codeBlue.reconciliationList()` defined in Task 6, used in Task 7 ✓
- `api.analytics.shiftCompletion()` defined in Task 6, used in Task 8 ✓
- `"inventory_dispensed"` action type added in Task 3, used in Task 3 ✓
- `"code_blue_session_reconciled"` action type added in Task 3, used in Task 4 ✓
- `isReconciled`, `reconciledAt`, `reconciledByUserId` columns defined in Task 1+2, used in Task 4 ✓
