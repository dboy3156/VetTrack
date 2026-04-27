# Code Blue — Full Upgrade Design

**Date:** 2026-04-27  
**Branch:** feat/code-blue-redesign  
**Status:** In review — updated with 4 additional requirements

---

## Overview

The current Code Blue screen is localStorage-only: one device, one session, no collaboration. This redesign turns it into a multi-device emergency command center where every staff member has a live synchronized view, interventions are logged by name, and the full event record is preserved server-side.

The goal is to eliminate the chaos of verbal event tracking during CPR — one screen everyone can see, one source of truth, zero duplicate entries, a designated resuscitation manager who is accountable for the event, and a daily crash cart check that ensures readiness before any emergency occurs.

---

## Scope: 17 Features

### Standalone (independent of Code Blue events)
| # | Feature | Type |
|---|---------|------|
| S1 | Crash cart daily routine check | NEW |
| S2 | High-risk CPR patient flagging (auto from hospitalization status) | NEW |

### Before the Event
| # | Feature | Type |
|---|---------|------|
| B1 | Crash cart status indicator on Code Blue screen | NEW (from S1) |
| B2 | Push notification to all staff on start | Existing |

### During the Event
| # | Feature | Type |
|---|---------|------|
| D1 | Multi-device sync (server as source of truth) | NEW |
| D2 | Staff presence indicators | NEW |
| D3 | CPR cycle sound alert (2-min boundary) | Existing |
| D4 | Weight-based drug calculator | Existing |
| D5 | 15-minute CPR gate on "Stop CPR" | NEW |
| D6 | Resuscitation manager designation | NEW |
| D7 | Large equipment attachment tracking | NEW |

### Closing the Event
| # | Feature | Type |
|---|---------|------|
| C1 | Outcome selector (ROSC / Died / Transferred / Ongoing) | Existing |
| C2 | Auto-generated event summary | NEW |
| C3 | Only manager (doctor) can close with "Died" outcome | NEW |

### After the Event
| # | Feature | Type |
|---|---------|------|
| A1 | Patient chart link (hospitalization_id FK) | Existing |
| A2 | Admin history page | NEW |

### Cross-cutting
| # | Feature | Type |
|---|---------|------|
| X1 | Room display mode (`/code-blue/display`) | NEW |

---

## Architecture Decision: Polling

**Chosen: Option A — 2-second polling with idempotency keys.**

Rationale: An emergency screen must never fail due to a broken connection. Polling survives mobile network drops, background tabs, and reconnects transparently. 2-second lag is acceptable for CPR event logging. No new infrastructure (no Socket.io, no SSE).

---

## Data Model

The existing `vt_code_blue_events` table is kept as the final audit archive (written once on session close). Three new tables handle the live session, plus one new table for the standalone crash cart check.

### `vt_code_blue_sessions` — ONE active row per clinic

```sql
id                   UUID primary key
clinic_id            text UNIQUE NOT NULL → clinics.id   -- enforces one active session
started_at           timestamptz NOT NULL                -- server-set, authoritative timer source
started_by           text NOT NULL                       -- user_id of activator
started_by_name      text NOT NULL                       -- name stored at activation time
manager_user_id      text NOT NULL                       -- resuscitation manager (must be doctor)
manager_user_name    text NOT NULL                       -- stored at designation time
patient_id           text nullable → vt_animals.id
hospitalization_id   text nullable → vt_hospitalizations.id
status               text CHECK IN ('active','ended') DEFAULT 'active'
outcome              text CHECK IN ('rosc','died','transferred','ongoing') nullable
pre_check_passed     boolean nullable                    -- quick cart verification at start
ended_at             timestamptz nullable
created_at           timestamptz NOT NULL DEFAULT now()
```

**UNIQUE(clinic_id) where status = 'active'** — enforced by partial unique index, preventing two simultaneous sessions.

**Manager rule:** `manager_user_id` must reference a user with role `doctor` or `admin`. Closing with `outcome = 'died'` is only permitted when `req.authUser.id === session.managerUserId`. Server returns `403` if a non-manager attempts it.

### `vt_code_blue_log_entries` — individual timestamped events

```sql
id                UUID primary key
session_id        UUID NOT NULL → vt_code_blue_sessions.id
clinic_id         text NOT NULL
idempotency_key   UUID UNIQUE NOT NULL   -- client-generated; duplicate POST = silent 200
elapsed_ms        integer NOT NULL       -- milliseconds since session started_at
label             text NOT NULL          -- e.g. "אפינפרין 0.28 מ״ג"
category          text NOT NULL          -- 'drug' | 'shock' | 'cpr' | 'note' | 'equipment'
equipment_id      text nullable → vt_equipment.id   -- set when category='equipment'
logged_by_user_id text NOT NULL
logged_by_name    text NOT NULL          -- stored at log time, not a FK
created_at        timestamptz NOT NULL DEFAULT now()
```

### `vt_code_blue_presence` — heartbeat per user per session

```sql
session_id   UUID NOT NULL → vt_code_blue_sessions.id
user_id      text NOT NULL
user_name    text NOT NULL
last_seen_at timestamptz NOT NULL
PRIMARY KEY (session_id, user_id)
```

Stale threshold: 30 seconds. `last_seen_at` updated every 10 seconds.

### `vt_crash_cart_checks` — daily standalone check record

```sql
id                    UUID primary key
clinic_id             text NOT NULL → clinics.id
performed_by_user_id  text NOT NULL
performed_by_name     text NOT NULL
performed_at          timestamptz NOT NULL DEFAULT now()
items_checked         jsonb NOT NULL    -- [{key, label, checked: boolean}]
all_passed            boolean NOT NULL
notes                 text nullable
```

One row per check. `GET /api/crash-cart/checks/latest` returns the most recent row for the clinic. "Today" = within the last 24 hours relative to clinic time.

---

## API Endpoints

### Code Blue — 6 new endpoints

All under `/api/code-blue/`. All require `requireAuth`.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/sessions` | auth | Start session, designate manager, fire push notification |
| `GET` | `/sessions/active` | auth | Poll: session + logs + presence + cart status |
| `POST` | `/sessions/:id/logs` | auth | Add log entry with idempotency_key |
| `PATCH` | `/sessions/:id/presence` | auth | Heartbeat every 10s |
| `PATCH` | `/sessions/:id/end` | auth (manager only for died) | Close with outcome, archive |
| `GET` | `/history` | admin | Past sessions with summaries, filterable |

### Crash Cart — 2 new endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/crash-cart/checks` | auth | Submit a completed daily check |
| `GET` | `/api/crash-cart/checks/latest` | auth | Get last check for this clinic |

### `GET /sessions/active` response shape

```json
{
  "session": {
    "id": "...",
    "startedAt": "2026-04-27T10:00:00Z",
    "startedByName": "נועה",
    "managerUserId": "...",
    "managerUserName": "ד״ר כהן",
    "patientName": "מקסי",
    "patientWeight": 28,
    "preCheckPassed": true,
    "status": "active"
  },
  "logEntries": [
    { "id": "...", "elapsedMs": 490000, "label": "אפינפרין 0.28 מ״ג", "category": "drug", "loggedByName": "נועה" }
  ],
  "presence": [
    { "userId": "...", "userName": "ד״ר כהן", "lastSeenAt": "..." }
  ],
  "cartStatus": {
    "lastCheckedAt": "2026-04-27T08:00:00Z",
    "allPassed": true,
    "performedByName": "שירה"
  }
}
```

`cartStatus` is `null` if no check in the last 24 hours.

Returns `{ session: null, cartStatus: ... }` when no active session exists.

### Idempotency contract

`POST /sessions/:id/logs` inserts the entry. If `idempotency_key` already exists in the table, returns `200 { duplicate: true }` without error or second insert. Client should generate a fresh `uuid()` per tap.

When `category = 'equipment'` and `equipment_id` is provided, the server also creates a `vt_usage_sessions` row linking the equipment to the session's patient (`animalId`), with `startedAt = now()`. This marks the equipment as actively in use on that patient and persists after the Code Blue ends.

### Session close & archival

`PATCH /sessions/:id/end`:
1. Validates manager rule if `outcome === 'died'`
2. Sets `status = 'ended'`, `ended_at`, `outcome`
3. Generates auto-summary (duration, intervention counts by category, participant list)
4. Writes one row to existing `vt_code_blue_events` (backward-compatible archive)
5. Logs `code_blue_ended` audit entry

---

## Frontend Components

### Route split

| Route | Component | Mode |
|-------|-----------|------|
| `/code-blue` | `CodeBluePage` | Interactive (staff) |
| `/code-blue/display` | `CodeBlueDisplay` | Read-only (room screen) |
| `/crash-cart` | `CrashCartCheckPage` | Daily check (any staff) |

### `CodeBluePage` sections

1. **Quick cart indicator** — top of pre-session screen. Shows "✓ עגלה נבדקה לפני 3 שע׳" (green) or "⚠ עגלה לא נבדקה היום" (amber). Tapping links to `/crash-cart`. Never blocks Code Blue start.

2. **Manager designation** — when starting Code Blue, a required field: "מנהל הפצה". Dropdown filtered to doctors/admins currently online (from presence). If the activating user is a doctor, they are pre-selected. The field is locked once the session is started.

3. **Pre-check quick verification** — lightweight 6-item checklist shown at session start. Separate from (and shorter than) the full daily crash cart check. Logged as `pre_check_passed: true/false`.

4. **Header bar** — `⚠ CODE BLUE` label + elapsed timer (large, monospace) + presence pills + manager badge ("מנהל: ד״ר כהן"). Pulsing red border on the page.

5. **Patient banner** — species, name, weight. CPR-risk badge shown if `hospitalizationStatus = 'critical'`.

6. **CPR cycle tracker** — counts 2-min cycles, shows time-to-next rhythm check. Plays Web Audio API beep at each cycle boundary.

7. **Quick-log grid** — drug buttons (אפינפרין, אטרופין, וזופרסין) + shock button + equipment button. Drug buttons show computed dose from weight. Equipment button opens picker (see D7 below).

8. **Timeline** — chronological list of log entries. Shows elapsed time + label + logger's name + equipment icon for equipment entries.

9. **Stop CPR button** — locked for first 15 minutes with countdown. After 15:00, unlocks and opens outcome selector modal. "Died" option is greyed out with tooltip "זמין למנהל הפצה בלבד" for non-manager staff. Manager sees all 4 options.

### `CodeBlueDisplay` (room screen)

- Same 2-second poll, read-only rendering
- Giant timer (72px), visible from across the room
- Manager name shown in header
- Full timeline with logger names
- Presence list at bottom
- No buttons of any kind
- Standby state: "ממתין לאירוע..." when no session active — auto-activates within 2s of any Code Blue start
- Requires standard Clerk auth. The room tablet stays logged in as a clinic staff account.

### `CrashCartCheckPage` (standalone)

- Accessible from main navigation (not inside Code Blue flow)
- Shows fixed checklist of 8 items:
  ```
  □ דפיברילטור — טעון ומוכן
  □ חמצן — מחובר ופתוח
  □ עירוי IV — מוכן (קו פתוח)
  □ אפינפרין — זמין ולא פג תוקף
  □ אטרופין — זמין ולא פג תוקף
  □ וזופרסין — זמין ולא פג תוקף
  □ אמבו — מוכן ונקי
  □ ציוד שאיבה — תקין
  ```
- Shows currently high-risk patients: any hospitalized animal with `status = 'critical'`, with room/bay label. Staff know which patients need CPR readiness while doing the check.
- On submit: POSTs to `/api/crash-cart/checks`. If any item is unchecked, `all_passed = false` and a notes field is shown.
- History sidebar: last 7 checks with date + performer + pass/fail.

### State management

The polling hook (`useCodeBlueSession`) runs in both Code Blue components:
- On mount: fetch immediately, then every 2000ms
- On disconnect or error: continue from local state (localStorage cache), queue log entries for retry
- On reconnect: flush queued entries, merge with server state

---

## Resuscitation Manager (D6, C3)

A resuscitation manager is a doctor or admin who:
- Is designated at session start (required field, cannot be changed)
- Has their name displayed prominently in the header on all devices
- Is the only person who can close the session with `outcome = 'died'`
- Can close with any other outcome (ROSC, transferred, ongoing) — as can any staff member when appropriate permissions allow

Server enforcement: `PATCH /sessions/:id/end` checks `req.body.outcome === 'died'`. If true and `req.authUser.id !== session.managerUserId`, returns `403 { code: 'MANAGER_ONLY', message: 'Only the resuscitation manager can call time of death' }`.

Frontend: the "Died" outcome option is rendered as disabled for non-managers with explanatory tooltip. The manager sees it enabled.

---

## Crash Cart Daily Check (S1)

A standalone daily maintenance feature, completely independent of Code Blue events.

**Where it lives:** `/crash-cart` — accessible from main navigation for all authenticated staff.

**Cadence:** One check per 24 hours is considered current. The system tracks "last check" per clinic — not per specific cart (clinics have one crash cart).

**Integration with Code Blue:** The `GET /sessions/active` response includes `cartStatus`. The Code Blue screen shows a non-blocking status pill:
- Green: "עגלה נבדקה לפני Xשע׳" (checked within 24h)
- Amber: "⚠ עגלה לא נבדקה היום" (not checked in 24h)
- No check can ever block a Code Blue from starting.

**History:** The check page shows the last 7 days of checks. The admin history page includes cart check compliance.

---

## High-Risk CPR Patient Flagging (S2)

Derived automatically — no new DB column.

**Rule:** Any animal with an active hospitalization where `status = 'critical'` is considered high CPR risk.

**Where it appears:**
- Patient card throughout the app: red "CPR Risk" badge next to the patient name
- Crash cart check page: "מטופלים בסיכון גבוה" panel showing all current critical patients with their room/bay
- Code Blue session: patient banner shows the risk badge if the linked patient is critical
- Hospitalization detail page: prominence on the status badge

**No configuration required** — purely derived from existing `hospitalizations.status` field.

---

## Large Equipment Tracking (D7)

During CPR, staff can log that a large piece of equipment has been connected to the patient.

**Trigger:** "ציוד" button in the quick-log grid opens a bottom sheet showing the clinic's equipment that is in a ready/available state from `vt_equipment` (filtered to relevant categories or by `location`).

**On selection:**
1. A log entry is created with `category = 'equipment'`, `label = equipment.name`, `equipment_id = equipment.id`
2. A `vt_usage_sessions` row is created: `animalId = session.patientId`, `equipmentId`, `startedAt = now()`. This is the existing table that already links equipment to patients.
3. The equipment's `status` is updated and it appears as "in use" on the equipment management page.

**Persistence:** The equipment attachment stays on the patient after Code Blue ends. Staff must manually end the `vt_usage_sessions` row (via the patient record or equipment management page) when the equipment is removed. This is intentional — the patient may need the ventilator for days after CPR.

**On the patient record:** Active equipment sessions are shown in the hospitalization view as "ציוד מחובר כעת": ventilator, suction machine, etc., with the time they were attached.

---

## Push Notification (B2)

On `POST /sessions`, the server fires a BullMQ job using the existing web-push worker. Message: "⚠ Code Blue activated — go to the Code Blue screen." All staff subscribed to push notifications receive it. Uses existing infrastructure, no new dependencies.

---

## 15-Minute CPR Gate (D5)

Implemented entirely in the frontend. The "Stop CPR" button renders as locked when `elapsedMs < 15 * 60 * 1000`. The countdown uses `started_at` from the server response (not local time) to prevent clock drift issues. No server enforcement — this is a UX guardrail, not a security boundary.

---

## Room Display Mode (X1)

- Separate route `/code-blue/display`, no navigation chrome
- Intended to be opened on a wall-mounted tablet or TV
- The URL can be bookmarked — the page stays in standby mode when no session is active and auto-activates on the next poll
- Requires standard Clerk auth. The room tablet stays logged in as a clinic staff account.
- Manager name shown in header alongside the timer

---

## Patient Chart Integration (A1)

When Code Blue is launched from a hospitalization page:
- `hospitalization_id` and `patient_id` passed as query params to `/code-blue?hospitalizationId=...`
- Pre-filled in `POST /sessions` body
- Patient name and weight loaded via existing hospitalization query
- After session ends, a Code Blue badge appears on the patient's hospitalization timeline

---

## Auto-Generated Summary (C2)

Generated server-side on session close. Stored in `vt_code_blue_events.notes` (JSON string). Contents:

```json
{
  "duration_minutes": 18,
  "manager": "ד״ר כהן",
  "interventions": {
    "drug": 4,
    "shock": 2,
    "cpr": 1,
    "equipment": 2,
    "note": 3
  },
  "equipment_attached": ["מכשיר הנשמה", "שאיבה"],
  "participants": ["נועה", "ד״ר כהן", "עמית"],
  "pre_check_passed": true,
  "cart_checked_before_event": true,
  "outcome": "rosc"
}
```

No AI required — all fields derivable from log entries and session data.

---

## Admin History Page (A2)

New page at `/admin/code-blue-history` (admin only).

- Table of past sessions: date, duration, outcome, patient, manager, participants, pre-check result, cart check compliance
- Click row → full timeline drawer
- Filter by date range and outcome
- Export to PDF (uses existing print-CSS pattern)
- Data sourced from `vt_code_blue_events` (archive table)

---

## Safety: Offline / Server Unreachable

If `GET /sessions/active` fails:
1. Timer continues from local state (localStorage caches `started_at`)
2. New log entries are queued in localStorage with their `idempotency_key`
3. On next successful poll, queued entries are flushed (`POST /sessions/:id/logs` for each)
4. Idempotency keys ensure no duplicates if any entry was partially sent

The emergency workflow is never blocked by a connectivity issue. The display mode shows a connection warning indicator but keeps showing the last-known state.

---

## Migration Strategy

1. New migration adds 4 new tables alongside existing `vt_code_blue_events`
2. New API routes added to `server/routes/code-blue.ts` and new `server/routes/crash-cart.ts`
3. Frontend pages refactored to use new session architecture
4. Old `vt_code_blue_events` becomes write-once archive (only written by session close)
5. No data loss — existing events remain queryable from the history page

---

## Implementation Batches

**Batch 1 — Server foundation**
- DB migration: 4 new tables (`vt_code_blue_sessions`, `vt_code_blue_log_entries`, `vt_code_blue_presence`, `vt_crash_cart_checks`)
- Drizzle schema additions
- 6 Code Blue API routes + 2 crash cart routes
- Manager role validation + 403 on died-by-non-manager

**Batch 2 — Polling hook + shared state**
- `useCodeBlueSession` hook
- localStorage cache / offline queue
- Presence heartbeat

**Batch 3 — Crash cart check page**
- `/crash-cart` route + `CrashCartCheckPage` component
- High-risk patient panel (query critical hospitalizations)
- Check history sidebar

**Batch 4 — Handheld page refactor**
- Manager designation at start
- Cart status indicator
- Full page rewrite using new hook
- Equipment picker bottom sheet + `vt_usage_sessions` write
- CPR gate countdown
- Outcome modal with manager-only "Died" gate

**Batch 5 — Room display page**
- `/code-blue/display` route
- `CodeBlueDisplay` component
- Standby → active transition

**Batch 6 — Integration & extras**
- CPR risk badge on patient cards
- Patient chart link (launch from hospitalization)
- Push notification on session start
- Auto-summary generation on close (includes manager + equipment)
- Admin history page
