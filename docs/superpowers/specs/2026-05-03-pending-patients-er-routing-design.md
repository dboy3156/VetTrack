# Pending Patients & ER Intake Routing — Design Spec

**Date:** 2026-05-03  
**Status:** Approved  
**Scope:** Pending patients flow — doctor operational shifts, Accept Patient, In Admission state machine, admission pool fan-out, handoff pending UI, ER board redesign.

---

## 1. Overview

Build a **pending patients** flow so reception and bedside staff can create visibility for animals waiting for a doctor. Notifications carry patient name, file number (from linked `vt_animals`), reason for visit, and clinical triage (severity × ambulation). The ER board is redesigned from a passive monitoring dashboard into a workflow-driven system with one primary action per card.

Two shared helpers are already implemented and tested:
- `shared/handoff-debt.ts` — `shouldWarnHandoffDebt(pendingCount, warnAt)`
- `shared/doctor-operational-shift.ts` — `detectDoctorOperationalShiftRole(shiftName)`

---

## 2. Architecture (Approach A — Service-per-concern)

New service files mirror the existing `er-intake.service.ts` / `er-board.service.ts` pattern:

| File | Responsibility |
|------|---------------|
| `server/services/er-doctor-shifts.service.ts` | Import + admission pool query for a time window |
| `server/services/er-admission-state.service.ts` | Enter/exit In Admission, resolve handoff-pending cases |
| `server/workers/admission-fanout.worker.ts` | BullMQ worker for push fan-out |
| `server/routes/er.ts` (extended) | New endpoints for accept, admission-state, admission-complete |

Fan-out: SSE fires immediately on intake creation; BullMQ job handles push asynchronously.

---

## 3. DB Schema Changes

### 3.1 `vt_er_intake_events` — two new columns

| Column | Type | Notes |
|--------|------|-------|
| `ambulation` | `varchar(20)` nullable | `"ambulatory"` \| `"non_ambulatory"`. Set at intake creation, never mutated. |
| `acceptedByUserId` | `text` nullable FK → `vt_users(id)` on delete set null | Exclusive Accept Patient claim. |

New status value added to `ErIntakeStatus` (additive): `"admission_complete"`.

### 3.2 New `vt_doctor_shifts` table

```sql
id               text PRIMARY KEY
clinic_id        text NOT NULL REFERENCES vt_clinics(id)
user_id          text NOT NULL REFERENCES vt_users(id)   -- deterministic; required
date             date NOT NULL
start_time       time NOT NULL
end_time         time NOT NULL
shift_name       text NOT NULL                             -- raw CSV label, audit trail
operational_role varchar(40) NOT NULL                     -- output of detectDoctorOperationalShiftRole
```

Index: `(clinic_id, date, operational_role)` — admission pool query pattern.

### 3.3 New `vt_doctor_admission_state` table

```sql
id               text PRIMARY KEY
clinic_id        text NOT NULL REFERENCES vt_clinics(id)
user_id          text NOT NULL REFERENCES vt_users(id)
intake_event_id  text REFERENCES vt_er_intake_events(id) ON DELETE SET NULL
entered_at       timestamp NOT NULL DEFAULT now()
UNIQUE (clinic_id, user_id)   -- one active row per doctor max
```

Clearing In Admission = deleting the row.

---

## 4. CSV Import Extension

**Detection:** The existing `POST /api/shifts/upload` branches on the presence of a `user_id` column header variant (`user_id`, `מזהה משתמש`). Match → doctor import path → writes to `vt_doctor_shifts`. No match → existing technician path unchanged.

**Doctor CSV columns:** `date`, `start_time`, `end_time`, `user_id`, `shift_name`

- `user_id` must resolve to a `vt_users.id` for the clinic; unresolved rows → `ShiftRowIssue`
- `shiftName` passed through `detectDoctorOperationalShiftRole()` → `operationalRole`
- Rows resolving to `"unknown"` are imported but flagged; they do not participate in routing

**Response shape:** reuses existing `ShiftParseResult` (`totalRows`, `validRows`, `issues`).

---

## 5. API Endpoints

All new endpoints require `requireAuth`. Role guard: `vet+` unless noted.

### 5.1 Accept Patient

**`PATCH /api/er/intake/:id/accept`**

Body: `{ userId: string | null }`

- Verify intake exists for `clinicId`, status is `waiting` or `assigned`
- Set `acceptedByUserId = userId` (null = release)
- Emit SSE `er:intake:accepted`
- `logAudit()`

### 5.2 In Admission — Enter

**`POST /api/er/admission-state`**

Body: `{ intakeEventId: string }`

- Upsert row in `vt_doctor_admission_state` for `(clinicId, userId)` — replaces existing row if present
- Emit SSE `er:admission-state:entered`
- `logAudit()`

### 5.3 In Admission — Exit (manual)

**`DELETE /api/er/admission-state`**

No body.

- Delete row for `(clinicId, userId)`
- Compute outstanding handoff debt count; include `handoffDebtWarning: boolean` and `pendingCount: number` in response using `shouldWarnHandoffDebt()`
- Emit SSE `er:admission-state:cleared`
- `logAudit()`

### 5.4 In Admission — Query

**`GET /api/er/admission-state`**

Returns current user's active row or `null`. Used by the UI strip on mount.

### 5.5 Admission Complete (event 4)

**`POST /api/er/intake/:id/admission-complete`**

- Set intake `status = "admission_complete"`
- Delete doctor's `vt_doctor_admission_state` row (OR semantics — first of (4) or (1) clears it)
- Send lightweight push + SSE to the `assignedUserId` on the intake if present (the staff member already assigned to this patient) — "admission closed, handoff coming"
- Check for outstanding handoff; return `handoffPending: true` if no handoff submitted
- `logAudit()`

**Note:** Submitting a handoff (`POST /api/er/handoffs`) also clears the `vt_doctor_admission_state` row — OR semantics, whichever fires first.

### 5.6 Intake Enrichment (two-phase)

**`PATCH /api/er/intake/:id/enrich`**

Reception calls this after a bedside intake is created without `animalId`/`ownerName`. Vet+ or reception role.

Body: `{ animalId?: string; ownerName?: string }`

- Updates the existing `vt_er_intake_events` row — no new record created (enrich/dedupe, no duplicate threads per CONTEXT.md)
- Emit SSE `er:intake:enriched` so the board updates the "file pending" label to the real file number
- Board item `patientLabel` recomputed server-side on next `GET /api/er/board`
- `logAudit()`

### 5.7 ER Allowlist

All new `/api/er/*` paths are covered by the existing `/er` prefix in `shared/er-mode-access.ts` `ER_MODE_API_PATH_PREFIX_ALLOWLIST`. No changes needed.

---

## 6. Admission Pool Fan-out

### 6.1 Pool resolution (`er-admission-pool.service.ts`)

```sql
SELECT ds.user_id
FROM vt_doctor_shifts ds
WHERE ds.clinic_id = :clinicId
  AND ds.date = CURRENT_DATE
  AND ds.operational_role = 'admission'
  AND now() BETWEEN ds.start_time AND ds.end_time
  AND ds.user_id NOT IN (
    SELECT user_id FROM vt_doctor_admission_state
    WHERE clinic_id = :clinicId
  )
```

Doctors currently In Admission are excluded. `senior_lead` and `ward` roles are **not** in this pool — escalation paths are governed separately.

**Scheduled appointment path:** when `animalId` maps to an existing appointment with an assigned attending vet, notify that vet directly instead of the pool.

**Walk-in / no appointment:** route to full admission pool.

### 6.2 Fan-out sequence (on `POST /api/er/intake` success)

1. Resolve pool → list of `userId`s
2. Emit SSE `er:intake:new` immediately (board refresh for all connected clients)
3. Enqueue BullMQ `admission-fanout` job: `{ clinicId, intakeEventId, recipientUserIds }`

### 6.3 `admission-fanout` worker

- Load push subscriptions from `vt_push_subscriptions` per recipient
- Payload: patient label, severity, ambulation, chief complaint, file number (from `vt_animals` if `animalId` present, else "file pending")
- Uses existing `sendPushToOthers` pattern from `server/lib/push.ts`
- Registered in `server/app/start-schedulers.ts`
- Redis-optional: if no Redis, logs `QUEUE_DISABLED_NO_REDIS`, SSE still fires

---

## 7. `ErBoardItem` Additions (additive — frozen contract)

```typescript
ambulation?: "ambulatory" | "non_ambulatory" | null;
acceptedByUserId?: string | null;
acceptedByUserName?: string | null;
/** Server-derived: true when intake.status = "admission_complete" AND no vt_shift_handoffs row
 *  exists for this intake's linked hospitalizationId (or intakeEventId) with status != "cancelled". */
admissionComplete?: boolean;
```

---

## 8. ER Board UI Redesign

### 8.1 Design principles (from brief)

The board is redesigned from a **passive dashboard** to a **workflow-driven** system. Each card answers: *what is happening, who owns it, what should I do next.*

### 8.2 Card anatomy (simplified)

```
[severity stripe] Patient name · Breed
                  #file-id
                  ⏱ countdown timer
                  One-line condition summary
                  [attributes — only if relevant]
                  ○ Ownership (Unassigned / You / Dr. X)
                  [ PRIMARY CTA ]
                  + View details (secondary, collapsed)
```

### 8.3 State → primary CTA mapping

| State | CTA |
|-------|-----|
| Unassigned | **Accept Patient** |
| Assigned to me (active) | **✓ Admission Complete** |
| Assigned to another | **In Treatment** (disabled, read-only) |
| Ready for handoff | **📋 Submit Handoff** |
| Completed | Status only, no CTA |
| Loading | Spinner + "Submitting…" |

### 8.4 Semantic color system (strict — one meaning per color)

| Color | Meaning |
|-------|---------|
| Red | Critical severity **only** |
| Orange | High severity **only** |
| Blue | Active / in-progress **only** (In Admission strip, "Assigned to you") |
| Amber | Warning / attention **only** (handoff pending, debt chip, non-ambulatory badge, Handoff Risk lane) |
| Green | Completed **only** |

### 8.5 Time representation

Per-card countdown timers replace vague lane headers ("Next 15 min"):
- `"⏱ 2 min ago"` — recent arrival
- `"⏱ Due in 8 min"` — escalation approaching
- `"⏱ Overdue 12 min"` — SLA breached (amber)

### 8.6 In Admission strip

Persistent top-of-board strip when the current user has an active `vt_doctor_admission_state` row:
- Blue background (active/in-progress semantic)
- Patient label + elapsed time
- Handoff debt chip (amber, shown when `shouldWarnHandoffDebt()` returns true)
- **Primary:** "✓ Admission Complete" button
- **Secondary ghost:** "Available" button

### 8.7 Handoff debt warning

`shouldWarnHandoffDebt(pendingCount, clinicWarnAt)` called:
1. On `DELETE /api/er/admission-state` response — toast with count
2. In the In Admission strip — persistent chip when threshold met
3. Clinic `warnAt` value (2 or 3) stored as a key in `vt_server_config` (e.g. `er_handoff_debt_warn_at`), defaulting to `2` when not set.

---

## 9. Invariants Preserved

1. **Tenant isolation** — all queries filter by `clinicId`
2. **RBAC source of truth** — `vt_users.role` drives permissions; `operationalRole` in `vt_doctor_shifts` drives routing only
3. **ER Allowlist parity** — all new endpoints under `/api/er/*` are covered by existing prefix
4. **Primary Lane** — board deduplication unchanged; ambulation and accept state are badges/fields, not lanes
5. **Audit** — `logAudit()` on all state-mutating endpoints (accept, admission enter/exit, admission-complete)
6. **Async push** — BullMQ fan-out is best-effort; SSE board refresh is the authoritative real-time signal

---

## 10. Tests

- Unit: `shared/handoff-debt.ts` ✓ (exists), `shared/doctor-operational-shift.ts` ✓ (exists)
- Integration (real DB): `er-doctor-shifts.service`, `er-admission-state.service`, CSV import branch
- Unit: `er-admission-pool.service` pool resolution query
- Skip live-server tests: admission-fanout worker (requires Redis + running server); document skip reason inline
