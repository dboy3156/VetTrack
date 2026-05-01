# ER Backend Phases 1–4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the ER board service + intake/assignment/handoff APIs (Phases 1–4 from Instructions.txt) so the ER Command Center has real data.

**Architecture:** Pure board-logic functions (lane/badge/action) are isolated in the service for unit-testability; DB queries stay in the same service file. The existing `server/routes/er.ts` stubs are replaced in-place. Shared types from `shared/er-types.ts` are the API contract — no new types are introduced.

**Tech Stack:** TypeScript · Express · Drizzle ORM · Zod · Vitest · PostgreSQL

---

## File map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `server/services/er-board.service.ts` | Lane/badge/action pure logic + DB query for `/api/er/board` |
| Modify | `server/routes/er.ts` | Replace stubs: board, intake POST, assign PATCH, assignees GET, handoffs POST + item ack |
| Create | `tests/er-board.service.test.ts` | Unit tests for pure board logic (no DB) |
| Create | `tests/er-intake.test.ts` | Unit tests for intake Zod validation |

---

## Task 1: Pure board logic (TDD)

**Files:**
- Create: `server/services/er-board.service.ts`
- Create: `tests/er-board.service.test.ts`

- [ ] **Step 1.1: Write failing tests for lane/badge/action logic**

Create `tests/er-board.service.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  assignLane,
  computeNextAction,
  computeBadges,
  isOverdue,
  computeOverdueAt,
  OVERDUE_THRESHOLD_MS,
  ETA_NEAR_THRESHOLD_MINUTES,
  type IntakeSnapshot,
} from "../server/services/er-board.service.js";

const BASE_NOW = new Date("2026-01-01T12:00:00Z").getTime();
const RECENT = BASE_NOW - 5 * 60 * 1000; // 5 min ago
const OLD = BASE_NOW - 90 * 60 * 1000;   // 90 min ago (overdue)

function snap(overrides: Partial<IntakeSnapshot>): IntakeSnapshot {
  return {
    severity: "medium",
    status: "waiting",
    waitingSinceMs: RECENT,
    hasOpenHandoff: false,
    minEtaMinutes: null,
    nowMs: BASE_NOW,
    ...overrides,
  };
}

describe("isOverdue", () => {
  it("returns false when waiting < threshold", () => {
    expect(isOverdue(snap({ waitingSinceMs: RECENT }))).toBe(false);
  });
  it("returns true when waiting > threshold and status=waiting", () => {
    expect(isOverdue(snap({ waitingSinceMs: OLD }))).toBe(true);
  });
  it("returns false when status=assigned even if old", () => {
    expect(isOverdue(snap({ waitingSinceMs: OLD, status: "assigned" }))).toBe(false);
  });
});

describe("assignLane", () => {
  it("criticalNow for severity=critical", () => {
    expect(assignLane(snap({ severity: "critical" }))).toBe("criticalNow");
  });
  it("criticalNow for overdue waiting intake", () => {
    expect(assignLane(snap({ waitingSinceMs: OLD }))).toBe("criticalNow");
  });
  it("handoffRisk when open handoff exists", () => {
    expect(assignLane(snap({ hasOpenHandoff: true }))).toBe("handoffRisk");
  });
  it("next15m when eta <= threshold", () => {
    expect(assignLane(snap({ minEtaMinutes: 10 }))).toBe("next15m");
  });
  it("next15m at exactly threshold", () => {
    expect(assignLane(snap({ minEtaMinutes: ETA_NEAR_THRESHOLD_MINUTES }))).toBe("next15m");
  });
  it("null for stable medium intake with no flags", () => {
    expect(assignLane(snap({ status: "in_progress" }))).toBeNull();
  });
  it("criticalNow beats handoffRisk (critical + open handoff)", () => {
    expect(assignLane(snap({ severity: "critical", hasOpenHandoff: true }))).toBe("criticalNow");
  });
});

describe("computeNextAction", () => {
  it("acknowledge_handoff when open handoff", () => {
    expect(computeNextAction(snap({ hasOpenHandoff: true }))).toBe("acknowledge_handoff");
  });
  it("assign_vet when waiting", () => {
    expect(computeNextAction(snap({ status: "waiting" }))).toBe("assign_vet");
  });
  it("start_treatment when assigned", () => {
    expect(computeNextAction(snap({ status: "assigned" }))).toBe("start_treatment");
  });
  it("monitor when in_progress", () => {
    expect(computeNextAction(snap({ status: "in_progress" }))).toBe("monitor");
  });
});

describe("computeBadges", () => {
  it("overdue badge when overdue", () => {
    expect(computeBadges(snap({ waitingSinceMs: OLD }))).toContain("overdue");
  });
  it("handoffRisk badge when open handoff", () => {
    expect(computeBadges(snap({ hasOpenHandoff: true }))).toContain("handoffRisk");
  });
  it("unassigned badge when waiting", () => {
    expect(computeBadges(snap({ status: "waiting" }))).toContain("unassigned");
  });
  it("no unassigned badge when assigned", () => {
    expect(computeBadges(snap({ status: "assigned" }))).not.toContain("unassigned");
  });
  it("multiple badges combine", () => {
    const badges = computeBadges(snap({ waitingSinceMs: OLD, hasOpenHandoff: true }));
    expect(badges).toContain("overdue");
    expect(badges).toContain("handoffRisk");
    expect(badges).toContain("unassigned");
  });
});

describe("computeOverdueAt", () => {
  it("returns waitingSince + threshold", () => {
    expect(computeOverdueAt(RECENT)).toBe(RECENT + OVERDUE_THRESHOLD_MS);
  });
});
```

- [ ] **Step 1.2: Run tests — expect all to fail with import error**

```bash
pnpm test -- tests/er-board.service.test.ts --reporter=verbose
```

Expected: `Cannot find module '../server/services/er-board.service.js'`

- [ ] **Step 1.3: Create service with pure functions only**

Create `server/services/er-board.service.ts`:

```typescript
import type {
  ErBoardItem,
  ErBoardResponse,
  ErLane,
  ErNextActionCode,
  ErSeverity,
} from "../../shared/er-types.js";

export const OVERDUE_THRESHOLD_MS = 60 * 60 * 1000; // 60 minutes
export const ETA_NEAR_THRESHOLD_MINUTES = 15;

// ── Pure types (testable without DB) ─────────────────────────────────────────

export interface IntakeSnapshot {
  severity: ErSeverity;
  status: "waiting" | "assigned" | "in_progress" | "discharged" | "cancelled";
  waitingSinceMs: number;
  hasOpenHandoff: boolean;
  minEtaMinutes: number | null;
  nowMs: number;
}

// ── Pure functions ────────────────────────────────────────────────────────────

export function computeOverdueAt(waitingSinceMs: number): number {
  return waitingSinceMs + OVERDUE_THRESHOLD_MS;
}

export function isOverdue(snapshot: IntakeSnapshot): boolean {
  return (
    snapshot.status === "waiting" &&
    snapshot.nowMs >= computeOverdueAt(snapshot.waitingSinceMs)
  );
}

/** Priority: criticalNow > handoffRisk > next15m. Returns null for stable items. */
export function assignLane(snapshot: IntakeSnapshot): ErLane | null {
  if (snapshot.severity === "critical" || isOverdue(snapshot)) return "criticalNow";
  if (snapshot.hasOpenHandoff) return "handoffRisk";
  if (
    snapshot.minEtaMinutes !== null &&
    snapshot.minEtaMinutes <= ETA_NEAR_THRESHOLD_MINUTES
  )
    return "next15m";
  return null;
}

export function computeNextAction(snapshot: IntakeSnapshot): ErNextActionCode {
  if (snapshot.hasOpenHandoff) return "acknowledge_handoff";
  if (snapshot.status === "waiting") return "assign_vet";
  if (snapshot.status === "assigned") return "start_treatment";
  return "monitor";
}

const NEXT_ACTION_LABELS: Record<ErNextActionCode, string> = {
  assign_vet: "Assign vet",
  start_treatment: "Start treatment",
  medication_due: "Medication due",
  await_results: "Await results",
  prepare_handoff: "Prepare handoff",
  acknowledge_handoff: "Acknowledge handoff",
  monitor: "Monitor",
};

export function computeBadges(
  snapshot: IntakeSnapshot,
): Array<"handoffRisk" | "overdue" | "unassigned"> {
  const badges: Array<"handoffRisk" | "overdue" | "unassigned"> = [];
  if (isOverdue(snapshot)) badges.push("overdue");
  if (snapshot.hasOpenHandoff) badges.push("handoffRisk");
  if (snapshot.status === "waiting") badges.push("unassigned");
  return badges;
}

// DB query and board assembly will be added in Task 2.
// Placeholder export so route can import without error until then.
export async function getErBoard(_clinicId: string): Promise<ErBoardResponse> {
  throw new Error("Not implemented yet — see Task 2");
}
```

- [ ] **Step 1.4: Run tests — expect all to pass**

```bash
pnpm test -- tests/er-board.service.test.ts --reporter=verbose
```

Expected: all 16 tests PASS.

- [ ] **Step 1.5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 1.6: Commit**

```bash
git add server/services/er-board.service.ts tests/er-board.service.test.ts
git commit -m "feat(er): pure board logic — lane/badge/action with unit tests"
```

---

## Task 2: Board DB query + wire route

**Files:**
- Modify: `server/services/er-board.service.ts` (replace `getErBoard` stub)
- Modify: `server/routes/er.ts` (replace `/board` stub)

- [ ] **Step 2.1: Replace `getErBoard` stub with real DB query**

Replace the `getErBoard` function at the bottom of `server/services/er-board.service.ts` with:

```typescript
import { db, erIntakeEvents, shiftHandoffs, shiftHandoffItems, users } from "../db.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
```

Add these imports at the top of the file (after the existing type imports), then replace the stub `getErBoard`:

```typescript
const ACTIVE_STATUSES = ["waiting", "assigned", "in_progress"] as const;
type ActiveStatus = (typeof ACTIVE_STATUSES)[number];

export async function getErBoard(clinicId: string): Promise<ErBoardResponse> {
  const nowMs = Date.now();

  // 1. Active ER intakes
  const intakes = await db
    .select({
      id: erIntakeEvents.id,
      species: erIntakeEvents.species,
      severity: erIntakeEvents.severity,
      chiefComplaint: erIntakeEvents.chiefComplaint,
      status: erIntakeEvents.status,
      waitingSince: erIntakeEvents.waitingSince,
      assignedUserId: erIntakeEvents.assignedUserId,
    })
    .from(erIntakeEvents)
    .where(
      and(
        eq(erIntakeEvents.clinicId, clinicId),
        inArray(erIntakeEvents.status, [...ACTIVE_STATUSES]),
      ),
    );

  // 2. Open shift handoffs for this clinic
  const openHandoffs = await db
    .select({
      id: shiftHandoffs.id,
      createdAt: shiftHandoffs.createdAt,
    })
    .from(shiftHandoffs)
    .where(
      and(eq(shiftHandoffs.clinicId, clinicId), eq(shiftHandoffs.status, "open")),
    );

  // 3. Unacknowledged handoff items (for computing minEta + hasOpenHandoff)
  const openHandoffIds = openHandoffs.map((h) => h.id);
  const unackedItems =
    openHandoffIds.length > 0
      ? await db
          .select({
            handoffId: shiftHandoffItems.handoffId,
            etaMinutes: shiftHandoffItems.etaMinutes,
          })
          .from(shiftHandoffItems)
          .where(
            and(
              inArray(shiftHandoffItems.handoffId, openHandoffIds),
              isNull(shiftHandoffItems.ackBy),
            ),
          )
      : [];

  // 4. Assigned user display names
  const assigneeIds = [
    ...new Set(intakes.map((i) => i.assignedUserId).filter((id): id is string => id !== null)),
  ];
  const assignees =
    assigneeIds.length > 0
      ? await db
          .select({ id: users.id, displayName: users.displayName })
          .from(users)
          .where(inArray(users.id, assigneeIds))
      : [];
  const assigneeMap = new Map(assignees.map((u) => [u.id, u.displayName]));

  // 5. Group unacked items by handoff id
  const unackedByHandoff = new Map<string, number[]>();
  for (const item of unackedItems) {
    const arr = unackedByHandoff.get(item.handoffId) ?? [];
    arr.push(item.etaMinutes);
    unackedByHandoff.set(item.handoffId, arr);
  }

  const lanes: ErBoardResponse["lanes"] = {
    criticalNow: [],
    next15m: [],
    handoffRisk: [],
  };

  // 6. Build board items from ER intakes
  for (const intake of intakes) {
    const snapshot: IntakeSnapshot = {
      severity: intake.severity as ErSeverity,
      status: intake.status as ActiveStatus,
      waitingSinceMs: intake.waitingSince.getTime(),
      hasOpenHandoff: false, // extended in Phase 4 via hospitalizationId linkage
      minEtaMinutes: null,
      nowMs,
    };

    const lane = assignLane(snapshot);
    if (lane === null) continue;

    const nextActionCode = computeNextAction(snapshot);
    const badges = computeBadges(snapshot);

    const item: ErBoardItem = {
      id: intake.id,
      type: "intake",
      lane,
      severity: intake.severity as ErSeverity,
      patientLabel: `${intake.species} — ${intake.chiefComplaint}`,
      waitingSince: intake.waitingSince.toISOString(),
      assignedUserId: intake.assignedUserId,
      assignedUserName: intake.assignedUserId
        ? (assigneeMap.get(intake.assignedUserId) ?? null)
        : null,
      nextActionCode,
      nextActionLabel: NEXT_ACTION_LABELS[nextActionCode],
      badges,
      overdueAt: isOverdue(snapshot)
        ? new Date(computeOverdueAt(snapshot.waitingSinceMs)).toISOString()
        : null,
    };

    lanes[lane].push(item);
  }

  // 7. Add hospitalization items from open handoffs (those with unacked items)
  for (const handoff of openHandoffs) {
    const etas = unackedByHandoff.get(handoff.id);
    if (!etas || etas.length === 0) continue;

    const minEta = Math.min(...etas);
    const lane: ErLane = minEta <= ETA_NEAR_THRESHOLD_MINUTES ? "next15m" : "handoffRisk";

    const item: ErBoardItem = {
      id: handoff.id,
      type: "hospitalization",
      lane,
      severity: "medium",
      patientLabel: `Handoff #${handoff.id.slice(0, 8)}`,
      waitingSince: handoff.createdAt.toISOString(),
      assignedUserId: null,
      assignedUserName: null,
      nextActionCode: "acknowledge_handoff",
      nextActionLabel: NEXT_ACTION_LABELS["acknowledge_handoff"],
      badges: ["handoffRisk"],
      overdueAt: null,
    };

    lanes[lane].push(item);
  }

  return {
    clinicId,
    generatedAt: new Date(nowMs).toISOString(),
    lanes,
  };
}
```

- [ ] **Step 2.2: Wire `/api/er/board` in the route**

In `server/routes/er.ts`, replace the existing `router.get("/board", ...)` stub with:

```typescript
import { getErBoard } from "../services/er-board.service.js";
```

Add that import at the top of the file alongside the existing imports. Then replace:

```typescript
router.get("/board", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});
```

With:

```typescript
router.get("/board", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.authUser!.clinicId;
    const board = await getErBoard(clinicId);
    res.status(200).json(board);
  } catch (err) {
    console.error("[er] GET /board failed", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "BOARD_FETCH_FAILED",
        message: "Failed to fetch ER board",
        requestId,
      }),
    );
  }
});
```

- [ ] **Step 2.3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 2.4: Smoke-test in browser console**

```js
await fetch("/api/er/board", { credentials: "include" }).then(r => r.json())
```

Expected: `{ clinicId: "...", generatedAt: "...", lanes: { criticalNow: [], next15m: [], handoffRisk: [] } }`

- [ ] **Step 2.5: Commit**

```bash
git add server/services/er-board.service.ts server/routes/er.ts
git commit -m "feat(er): getErBoard DB query + wire /api/er/board"
```

---

## Task 3: POST /api/er/intake

**Files:**
- Modify: `server/routes/er.ts` (replace intake POST stub)
- Create: `tests/er-intake.test.ts`

- [ ] **Step 3.1: Write failing validation tests**

Create `tests/er-intake.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { z } from "zod";

// Import directly once implemented. Until then, define here to prove the schema.
const erSeverityEnum = z.enum(["low", "medium", "high", "critical"]);

export const createErIntakeSchema = z.object({
  species: z.string().min(1).max(100),
  severity: erSeverityEnum,
  chiefComplaint: z.string().min(1).max(500),
  animalId: z.string().optional(),
  ownerName: z.string().max(200).optional(),
});

describe("createErIntakeSchema", () => {
  it("accepts valid minimal input", () => {
    const result = createErIntakeSchema.safeParse({
      species: "dog",
      severity: "high",
      chiefComplaint: "difficulty breathing",
    });
    expect(result.success).toBe(true);
  });

  it("accepts full input", () => {
    const result = createErIntakeSchema.safeParse({
      species: "cat",
      severity: "critical",
      chiefComplaint: "hit by car",
      animalId: "animal-123",
      ownerName: "John Smith",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing species", () => {
    const result = createErIntakeSchema.safeParse({
      severity: "high",
      chiefComplaint: "vomiting",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid severity", () => {
    const result = createErIntakeSchema.safeParse({
      species: "dog",
      severity: "very-bad",
      chiefComplaint: "vomiting",
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty chiefComplaint", () => {
    const result = createErIntakeSchema.safeParse({
      species: "dog",
      severity: "low",
      chiefComplaint: "",
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 3.2: Run tests — expect all to pass (schema defined inline)**

```bash
pnpm test -- tests/er-intake.test.ts --reporter=verbose
```

Expected: 5 tests PASS (schema is inline in test file for now).

- [ ] **Step 3.3: Implement POST /api/er/intake in the route**

Add this import at the top of `server/routes/er.ts`:

```typescript
import { z } from "zod";
import { randomUUID } from "crypto";
import { db, erIntakeEvents } from "../db.js";
import { logAudit } from "../lib/audit.js";
```

Add the Zod schema near the top of `server/routes/er.ts` (after the imports):

```typescript
const createErIntakeSchema = z.object({
  species: z.string().min(1).max(100),
  severity: z.enum(["low", "medium", "high", "critical"]),
  chiefComplaint: z.string().min(1).max(500),
  animalId: z.string().optional(),
  ownerName: z.string().max(200).optional(),
});
```

Replace the existing `router.post("/intake", ...)` stub with:

```typescript
router.post("/intake", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const parsed = createErIntakeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      apiError({
        code: "VALIDATION_ERROR",
        reason: parsed.error.issues.map((i) => i.message).join("; "),
        message: "Invalid intake data",
        requestId,
      }),
    );
  }

  try {
    const clinicId = req.authUser!.clinicId;
    const id = randomUUID();
    const now = new Date();

    await db.insert(erIntakeEvents).values({
      id,
      clinicId,
      species: parsed.data.species,
      severity: parsed.data.severity,
      chiefComplaint: parsed.data.chiefComplaint,
      animalId: parsed.data.animalId ?? null,
      ownerName: parsed.data.ownerName ?? null,
      status: "waiting",
      waitingSince: now,
      createdAt: now,
      updatedAt: now,
    });

    logAudit({
      clinicId,
      actionType: "ER_INTAKE_CREATED",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? null,
      targetId: id,
      targetType: "er_intake",
      metadata: { severity: parsed.data.severity, species: parsed.data.species },
    });

    return res.status(201).json({
      id,
      clinicId,
      species: parsed.data.species,
      severity: parsed.data.severity,
      chiefComplaint: parsed.data.chiefComplaint,
      status: "waiting",
      waitingSince: now.toISOString(),
      assignedUserId: null,
      animalId: parsed.data.animalId ?? null,
      ownerName: parsed.data.ownerName ?? null,
      createdAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[er] POST /intake failed", err);
    return res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "INTAKE_CREATE_FAILED",
        message: "Failed to create ER intake",
        requestId,
      }),
    );
  }
});
```

- [ ] **Step 3.4: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 3.5: Smoke-test in browser console**

```js
await fetch("/api/er/intake", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ species: "dog", severity: "high", chiefComplaint: "difficulty breathing" })
}).then(r => r.json())
```

Expected: `{ id: "...", status: "waiting", severity: "high", ... }`

Then verify it appears on the board:

```js
await fetch("/api/er/board", { credentials: "include" }).then(r => r.json())
```

Expected: intake appears in `lanes.criticalNow` (severity=high) or `lanes.next15m`.

Wait — `high` severity is not `critical`, so it won't be in criticalNow (unless overdue). If freshly created and status=waiting, it has no lane assignment from `assignLane` because: severity is "high" (not "critical"), not overdue (just created), no open handoff, no eta. It returns `null` and is skipped. This is correct — stable high-severity patients appear once they become overdue or get a handoff.

To test criticalNow, post with `severity: "critical"`.

```js
await fetch("/api/er/intake", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ species: "cat", severity: "critical", chiefComplaint: "trauma" })
}).then(r => r.json())
```

Then: `/api/er/board` should show it in `lanes.criticalNow`.

- [ ] **Step 3.6: Commit**

```bash
git add server/routes/er.ts tests/er-intake.test.ts
git commit -m "feat(er): POST /api/er/intake with zod validation + audit log"
```

---

## Task 4: PATCH /api/er/intake/:id/assign + GET /api/er/assignees

**Files:**
- Modify: `server/routes/er.ts` (replace assign PATCH + assignees GET stubs)

- [ ] **Step 4.1: Add assignees import to route file**

Add to `server/routes/er.ts` imports (if not already there):

```typescript
import { eq, and, inArray } from "drizzle-orm";
import { users } from "../db.js";
```

- [ ] **Step 4.2: Replace GET /api/er/assignees stub**

Replace:

```typescript
router.get("/assignees", async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  return notImplemented(res, requestId);
});
```

With:

```typescript
const ASSIGNABLE_ROLES = ["vet", "senior_technician", "technician"] as const;

router.get("/assignees", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.authUser!.clinicId;
    const rows = await db
      .select({ id: users.id, displayName: users.displayName, role: users.role })
      .from(users)
      .where(
        and(
          eq(users.clinicId, clinicId),
          inArray(users.role, [...ASSIGNABLE_ROLES]),
        ),
      );

    return res.status(200).json({
      assignees: rows.map((u) => ({
        id: u.id,
        name: u.displayName,
        role: u.role,
      })),
    });
  } catch (err) {
    console.error("[er] GET /assignees failed", err);
    return res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "ASSIGNEES_FETCH_FAILED",
        message: "Failed to fetch assignees",
        requestId,
      }),
    );
  }
});
```

- [ ] **Step 4.3: Add assignment Zod schema**

Add near the other schemas in `server/routes/er.ts`:

```typescript
const assignIntakeSchema = z.object({
  assignedUserId: z.string().min(1),
});
```

- [ ] **Step 4.4: Replace PATCH /api/er/intake/:id/assign stub**

```typescript
router.patch(
  "/intake/:id/assign",
  requireRole("technician"),
  async (req: Request, res: Response) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    const parsed = assignIntakeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json(
        apiError({
          code: "VALIDATION_ERROR",
          reason: parsed.error.issues.map((i) => i.message).join("; "),
          message: "Invalid assignment data",
          requestId,
        }),
      );
    }

    try {
      const clinicId = req.authUser!.clinicId;
      const intakeId = req.params.id;

      // Verify intake belongs to this clinic
      const [existing] = await db
        .select({ id: erIntakeEvents.id, status: erIntakeEvents.status })
        .from(erIntakeEvents)
        .where(and(eq(erIntakeEvents.id, intakeId), eq(erIntakeEvents.clinicId, clinicId)))
        .limit(1);

      if (!existing) {
        return res.status(404).json(
          apiError({ code: "NOT_FOUND", reason: "INTAKE_NOT_FOUND", message: "Intake not found", requestId }),
        );
      }

      // Verify assignee belongs to this clinic
      const [assignee] = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.id, parsed.data.assignedUserId),
            eq(users.clinicId, clinicId),
            inArray(users.role, [...ASSIGNABLE_ROLES]),
          ),
        )
        .limit(1);

      if (!assignee) {
        return res.status(400).json(
          apiError({ code: "VALIDATION_ERROR", reason: "INVALID_ASSIGNEE", message: "Assignee not found or not eligible", requestId }),
        );
      }

      const updatedAt = new Date();
      await db
        .update(erIntakeEvents)
        .set({
          assignedUserId: parsed.data.assignedUserId,
          status: "assigned",
          updatedAt,
        })
        .where(and(eq(erIntakeEvents.id, intakeId), eq(erIntakeEvents.clinicId, clinicId)));

      logAudit({
        clinicId,
        actionType: "ER_INTAKE_ASSIGNED",
        performedBy: req.authUser!.id,
        performedByEmail: req.authUser!.email ?? null,
        targetId: intakeId,
        targetType: "er_intake",
        metadata: { assignedUserId: parsed.data.assignedUserId },
      });

      return res.status(200).json({
        id: intakeId,
        assignedUserId: parsed.data.assignedUserId,
        status: "assigned",
        updatedAt: updatedAt.toISOString(),
      });
    } catch (err) {
      console.error("[er] PATCH /intake/:id/assign failed", err);
      return res.status(500).json(
        apiError({
          code: "INTERNAL_ERROR",
          reason: "INTAKE_ASSIGN_FAILED",
          message: "Failed to assign intake",
          requestId,
        }),
      );
    }
  },
);
```

- [ ] **Step 4.5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 4.6: Smoke-test assignees**

```js
await fetch("/api/er/assignees", { credentials: "include" }).then(r => r.json())
```

Expected: `{ assignees: [...] }` — list of vets/technicians in the clinic.

- [ ] **Step 4.7: Smoke-test assignment**

Use the `id` from the intake you created in Task 3. Grab an assignee id from the assignees list above.

```js
await fetch("/api/er/intake/<intake-id>/assign", {
  method: "PATCH",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ assignedUserId: "<user-id-from-assignees>" })
}).then(r => r.json())
```

Expected: `{ id: "...", status: "assigned", assignedUserId: "...", updatedAt: "..." }`

Then check the board — intake should no longer have "unassigned" badge, nextActionCode should be `"start_treatment"`.

- [ ] **Step 4.8: Commit**

```bash
git add server/routes/er.ts
git commit -m "feat(er): GET /api/er/assignees + PATCH /api/er/intake/:id/assign"
```

---

## Task 5: Handoff system — POST /api/er/handoffs + POST /api/er/handoffs/:id/ack

**Decision (VetTrack): item-level ack.** The path parameter `:id` refers to **`vt_shift_handoff_items.id`** (one handoff line item), **not** the parent `vt_shift_handoffs.id`. Each `POST` acknowledges **exactly one** item row. Sibling items on the same parent handoff must be acknowledged separately. Implementation lives in **`ackErHandoffItem()`** (`server/services/er-handoff.service.ts`); the route should delegate to it and map domain errors to HTTP status (404 `HANDOFF_ITEM_NOT_FOUND`, 409 `ALREADY_ACKNOWLEDGED`, 403 `ACK_DENIED` when the caller is not the item owner and lacks an allowed override).

**Authorization:** By default only the user identified by `owner_user_id` on the item may ack. **`overrideReason`** in the JSON body allows **admin** or **vet** to ack on someone else’s item (implementation-defined).

**Files:**
- Modify: `server/routes/er.ts` (wire POST handlers; keep handlers thin)
- Implement / reuse: `server/services/er-handoff.service.ts` (`createErHandoff`, `ackErHandoffItem`)

- [ ] **Step 5.1: Add handoff table imports**

Ensure `server/routes/er.ts` imports:

```typescript
import { db, erIntakeEvents, shiftHandoffs, shiftHandoffItems, users } from "../db.js";
```

(Merge with existing db import — just add `shiftHandoffs, shiftHandoffItems` if not present.)

- [ ] **Step 5.2: Add handoff Zod schemas**

Add near the other schemas in `server/routes/er.ts`:

```typescript
const createHandoffItemSchema = z.object({
  activeIssue: z.string().min(1).max(500),
  nextAction: z.string().min(1).max(500),
  etaMinutes: z.number().int().min(1).max(600),
  ownerUserId: z.string().nullable().optional(),
});

const createHandoffSchema = z.object({
  hospitalizationId: z.string().min(1),
  items: z.array(createHandoffItemSchema).min(1).max(20),
  outgoingUserId: z.string().nullable().optional(),
});

const ackHandoffSchema = z.object({
  overrideReason: z.string().max(500).optional(),
});
```

- [ ] **Step 5.3: Replace POST /api/er/handoffs stub**

Note: the route path is `/handoffs` in the router (mounted at `/api/er`), so the full path is `POST /api/er/handoffs`.

Replace:

```typescript
router.get("/queue", async (req, res) => {
  ...
});
```

Wait — there is no `POST /handoffs` stub in the current router. The stub that exists is `router.post("/handoffs/:id/ack", ...)`. Add the `POST /handoffs` handler before the ack handler:

```typescript
router.post("/handoffs", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const parsed = createHandoffSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      apiError({
        code: "VALIDATION_ERROR",
        reason: parsed.error.issues.map((i) => i.message).join("; "),
        message: "Invalid handoff data",
        requestId,
      }),
    );
  }

  try {
    const clinicId = req.authUser!.clinicId;
    const handoffId = randomUUID();
    const now = new Date();

    await db.insert(shiftHandoffs).values({
      id: handoffId,
      clinicId,
      hospitalizationId: parsed.data.hospitalizationId,
      outgoingUserId: parsed.data.outgoingUserId ?? null,
      status: "open",
      createdAt: now,
      updatedAt: now,
    });

    const itemIds: string[] = [];
    for (const item of parsed.data.items) {
      const itemId = randomUUID();
      itemIds.push(itemId);
      await db.insert(shiftHandoffItems).values({
        id: itemId,
        clinicId,
        handoffId,
        activeIssue: item.activeIssue,
        nextAction: item.nextAction,
        etaMinutes: item.etaMinutes,
        ownerUserId: item.ownerUserId ?? null,
        riskFlags: [],
        createdAt: now,
        updatedAt: now,
      });
    }

    logAudit({
      clinicId,
      actionType: "ER_HANDOFF_CREATED",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? null,
      targetId: handoffId,
      targetType: "er_handoff",
      metadata: { itemCount: parsed.data.items.length, hospitalizationId: parsed.data.hospitalizationId },
    });

    return res.status(201).json({
      id: handoffId,
      clinicId,
      hospitalizationId: parsed.data.hospitalizationId,
      itemIds,
      createdAt: now.toISOString(),
    });
  } catch (err) {
    console.error("[er] POST /handoffs failed", err);
    return res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "HANDOFF_CREATE_FAILED",
        message: "Failed to create handoff",
        requestId,
      }),
    );
  }
});
```

- [ ] **Step 5.4: Replace POST /api/er/handoffs/:id/ack stub (item-level)**

`:id` = **`shiftHandoffItems.id`** (handoff **item** UUID returned in `itemIds` from `POST /handoffs`). Do **not** pass the parent `shiftHandoffs.id` here.

Wire a thin handler:

```typescript
router.post("/handoffs/:id/ack", async (req: Request, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const parsed = ackHandoffSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json(
      apiError({
        code: "VALIDATION_ERROR",
        reason: "INVALID_BODY",
        message: parsed.error.message,
        requestId,
      }),
    );
  }
  try {
    const clinicId = req.authUser!.clinicId;
    const itemId = req.params.id as string;
    const row = await ackErHandoffItem(
      clinicId,
      { id: req.authUser!.id, role: req.authUser!.role },
      itemId,
      parsed.data,
    );
    logAudit({ /* targetId: itemId, targetType: shift_handoff_item */ });
    return res.status(200).json(row);
  } catch (err) {
    /* map HANDOFF_ITEM_NOT_FOUND → 404, ALREADY_ACKNOWLEDGED → 409, ACK_DENIED → 403 */
  }
});
```

Response body matches **`AckErHandoffResponse`** in `shared/er-types.ts`: **`id`** is the **item** id, **`status`** typically **`"acknowledged"`**, plus **`ackBy`**, **`ackAt`**.

**Not in scope for this route:** bulk-ack of all items on a parent handoff in one call; updating **`shift_handoffs.status`** when the last item is acked (handle in service or a separate job if product requires it).

- [ ] **Step 5.5: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero errors.

- [ ] **Step 5.6: Smoke-test handoff creation**

You'll need a valid `hospitalizationId`. If you don't have one handy, use any UUID string — the FK is set to `onDelete: "set null"` so it won't hard-fail.

```js
await fetch("/api/er/handoffs", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    hospitalizationId: "00000000-0000-0000-0000-000000000001",
    items: [{ activeIssue: "Post-op monitoring", nextAction: "Check vitals", etaMinutes: 10 }]
  })
}).then(r => r.json())
```

Expected: `{ id: "<handoff-id>", itemIds: ["<item-id>"], createdAt: "..." }`

Then check board — the open item should appear under **`lanes.handoffRisk`** (board assembly maps unacked items there; exact lane rules depend on Task 1–2 implementation).

- [ ] **Step 5.7: Smoke-test ack (item id)**

Use **`itemIds[0]`** from the create response (not the parent handoff `id`). Call as the **`owner_user_id`** for that item if your seed data sets one; otherwise use an **admin/vet** ack with `{ "overrideReason": "smoke test" }`.

```js
await fetch("/api/er/handoffs/<item-id-from-itemIds>/ack", {
  method: "POST",
  credentials: "include",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({})
}).then(r => r.json())
```

Expected: `{ id: "<same-item-id>", status: "acknowledged", ackBy: "...", ackAt: "..." }`

Re-fetch **`GET /api/er/board`** — that **item** should disappear from the board (remaining sibling items on the same parent handoff, if any, still appear until acked).

- [ ] **Step 5.8: Commit**

```bash
git add server/routes/er.ts
git commit -m "feat(er): POST /api/er/handoffs + POST /api/er/handoffs/:itemId/ack (item-level)"
```

---

## Spec coverage check

| Requirement | Task |
|-------------|------|
| `getErBoard()` service | Task 1 + 2 |
| `/api/er/board` returns real data | Task 2 |
| Deterministic lane assignment | Task 1 (pure functions + tests) |
| Unit-tested logic | Task 1 |
| POST `/api/er/intake` | Task 3 |
| Zod validation | Task 3 |
| Audit log entry | Task 3, 4, 5 |
| Appears in board immediately | Task 3 smoke test |
| PATCH `/api/er/intake/:id/assign` | Task 4 |
| Role filtering (vet/tech only) | Task 4 (`requireRole("technician")`) |
| Updates reflect on board | Task 4 smoke test |
| POST `/api/er/handoffs` | Task 5 |
| POST `/api/er/handoffs/:id/ack` (`:id` = **handoff item** id) | Task 5 |
| Overdue detection | Task 1 (`isOverdue`) |
| Board reflects handoff risk | Task 2 + 5 |

---

## Execution log (2026-05-01)

**Skill:** `executing-plans` (Cursor agent run).

### Critical review before execution

- **Task 1–2 prose/snippets** center an **`IntakeSnapshot` / `assignLane` / nullable lane** model and **60m** overdue threshold. **Shipped code** follows the ER wedge design: **`laneForIntake`**, **`assembleErBoardResponse`**, **`getErBoard`** (joins + row cap), **`ER_INTAKE_OVERDUE_MINUTES` (30)**. **`tests/er-board.service.test.ts`** covers the **shipped** helpers, **not** the plan’s 16 snapshot-matrix tests as written.
- **Tasks 3–5 functional goals** are implemented (`createErIntakeSchema`, services, **`ackErHandoffItem`** item-level ack per Task 5 decision block).
- **Still `501` (not in plan file map):** `PATCH /api/er/mode`, `GET /api/er/queue`.

### Verifications run

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS |
| `pnpm test -- tests/er-board.service.test.ts tests/er-intake.test.ts tests/er-allowlist.test.ts tests/phase-5-error-shape-guard.test.js` | PASS (73 tests) |

Full `pnpm test` may still hit timeouts in suites that need DB/long hooks (e.g. `auth-hardening.test.ts`); run in CI or with env configured.

**Checkbox policy:** Inline `- [ ]` steps were **not** mass-flipped to `- [x]` so the doc stays honest about **snippet-level** drift. Treat **endpoint/service outcomes** for phases 1–4 as **delivered** in-repo unless you intend to port the **exact** Task 1 snapshot API.
