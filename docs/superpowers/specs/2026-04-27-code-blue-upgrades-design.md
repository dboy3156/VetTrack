# Code Blue — Full Upgrade Design

**Date:** 2026-04-27  
**Branch:** feat/code-blue-redesign  
**Status:** Approved for implementation

---

## Overview

The current Code Blue screen is localStorage-only: one device, one session, no collaboration. This redesign turns it into a multi-device emergency command center where every staff member has a live synchronized view, interventions are logged by name, and the full event record is preserved server-side.

The goal is to eliminate the chaos of verbal event tracking during CPR — one screen everyone can see, one source of truth, zero duplicate entries.

---

## Scope: 13 Features

### Before the Event
| # | Feature | Type |
|---|---------|------|
| B1 | Crash cart pre-check | NEW |
| B2 | Push notification to all staff on start | Existing |

### During the Event
| # | Feature | Type |
|---|---------|------|
| D1 | Multi-device sync (server as source of truth) | NEW |
| D2 | Staff presence indicators | NEW |
| D3 | CPR cycle sound alert (2-min boundary) | Existing |
| D4 | Weight-based drug calculator | Existing |
| D5 | 15-minute CPR gate on "Stop CPR" | User-added |

### Closing the Event
| # | Feature | Type |
|---|---------|------|
| C1 | Outcome selector (ROSC / Died / Transferred / Ongoing) | Existing |
| C2 | Auto-generated event summary | NEW |

### After the Event
| # | Feature | Type |
|---|---------|------|
| A1 | Patient chart link (hospitalization_id FK) | Existing |
| A2 | Admin history page | NEW |

### Cross-cutting
| # | Feature | Type |
|---|---------|------|
| X1 | Room display mode (`/code-blue/display`) | User-added |
| X2 | Multi-user event attribution (logged_by_name) | Part of D1 |

---

## Architecture Decision: Polling

**Chosen: Option A — 2-second polling with idempotency keys.**

Rationale: An emergency screen must never fail due to a broken connection. Polling survives mobile network drops, background tabs, and reconnects transparently. 2-second lag is acceptable for CPR event logging. No new infrastructure (no Socket.io, no SSE).

---

## Data Model

The existing `vt_code_blue_events` table is kept as the final audit archive (written once on session close). Three new tables handle the live session.

### `vt_code_blue_sessions` — ONE active row per clinic

```sql
id               UUID primary key
clinic_id        text UNIQUE NOT NULL → clinics.id   -- enforces one active session
started_at       timestamptz NOT NULL                -- server-set, authoritative timer source
started_by       text NOT NULL                       -- user_id of activator
started_by_name  text NOT NULL                       -- name stored at activation time
patient_id       text nullable → vt_animals.id
hospitalization_id text nullable → vt_hospitalizations.id
status           text CHECK IN ('active','ended') DEFAULT 'active'
outcome          text CHECK IN ('rosc','died','transferred','ongoing') nullable
pre_check_passed boolean nullable                    -- crash cart result
ended_at         timestamptz nullable
created_at       timestamptz NOT NULL DEFAULT now()
```

**UNIQUE(clinic_id) where status = 'active'** — enforced by partial unique index, preventing two simultaneous sessions.

### `vt_code_blue_log_entries` — individual timestamped events

```sql
id               UUID primary key
session_id       UUID NOT NULL → vt_code_blue_sessions.id
clinic_id        text NOT NULL
idempotency_key  UUID UNIQUE NOT NULL   -- client-generated; duplicate POST = silent 200
elapsed_ms       integer NOT NULL       -- milliseconds since session started_at
label            text NOT NULL          -- e.g. "אפינפרין 0.28 מ״ג"
category         text NOT NULL          -- 'drug' | 'shock' | 'cpr' | 'note' | 'check'
logged_by_user_id text NOT NULL
logged_by_name   text NOT NULL          -- stored at log time, not a FK
created_at       timestamptz NOT NULL DEFAULT now()
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

---

## API Endpoints (6 new)

All under `/api/code-blue/`. All require `requireAuth` except where noted.

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/sessions` | auth | Start session, fire push notification |
| `GET` | `/sessions/active` | auth | Poll: session + log entries + presence |
| `POST` | `/sessions/:id/logs` | auth | Add log entry with idempotency_key |
| `PATCH` | `/sessions/:id/presence` | auth | Heartbeat every 10s |
| `PATCH` | `/sessions/:id/end` | auth | Close with outcome, archive to vt_code_blue_events |
| `GET` | `/history` | admin | Past sessions with summaries, filterable |

The existing `/events` endpoints remain unchanged for backward compatibility but are no longer the primary path.

### `GET /sessions/active` response shape

```json
{
  "session": {
    "id": "...",
    "startedAt": "2026-04-27T10:00:00Z",
    "startedByName": "נועה",
    "patientName": "מקסי",
    "patientWeight": 28,
    "preCheckPassed": true,
    "status": "active"
  },
  "logEntries": [
    { "id": "...", "elapsedMs": 490000, "label": "אפינפרין 0.28 מ״ג", "loggedByName": "נועה" }
  ],
  "presence": [
    { "userId": "...", "userName": "ד״ר כהן", "lastSeenAt": "..." }
  ]
}
```

Returns `{ session: null }` when no active session exists.

### Idempotency contract

`POST /sessions/:id/logs` inserts the entry. If `idempotency_key` already exists in the table, returns `200 { duplicate: true }` without error or second insert. Client should generate a fresh `uuid()` per tap.

### Session close & archival

`PATCH /sessions/:id/end`:
1. Sets `status = 'ended'`, `ended_at`, `outcome`
2. Generates auto-summary (duration, intervention counts by category, participant list)
3. Writes one row to existing `vt_code_blue_events` (backward-compatible archive)
4. Logs `code_blue_ended` audit entry

---

## Frontend Components

### Route split

| Route | Component | Mode |
|-------|-----------|------|
| `/code-blue` | `CodeBluePage` | Interactive (staff) |
| `/code-blue/display` | `CodeBlueDisplay` | Read-only (room screen) |

### `CodeBluePage` sections

1. **Pre-check gate** — crash cart checklist shown before session starts. Required to proceed. Items: defibrillator charged, O₂ connected, IV supplies ready, drugs stocked. Logged as `pre_check_passed: true/false`.

2. **Header bar** — `⚠ CODE BLUE` label + elapsed timer (large, monospace) + presence pills showing active staff. Pulsing red border on the page.

3. **Patient banner** — species, name, weight (populated from `patient_id`/`hospitalization_id` or manual entry). Weight is the input for drug calculations.

4. **CPR cycle tracker** — counts 2-min cycles, shows time-to-next rhythm check. Plays Web Audio API beep at each cycle boundary.

5. **Quick-log grid** — drug buttons (אפינפרין, אטרופין, וזופרסין) + shock button. Tapping generates `idempotency_key`, optimistically adds to local state, POSTs to server. Drug buttons show computed dose from weight.

6. **Timeline** — chronological list of log entries. Shows elapsed time + label + logger's name. Entries arrive from poll; optimistic entries tagged locally until confirmed.

7. **Stop CPR button** — locked for first 15 minutes. Shows countdown "עצור CPR — זמין בעוד MM:SS". After 15:00, unlocks and opens outcome selector modal (ROSC / Died / Transferred / Ongoing). Confirming outcome closes the session.

### `CodeBlueDisplay` (room screen)

- Same 2-second poll, read-only rendering
- Giant timer (72px), visible from across the room
- Full timeline with logger names
- Presence list at bottom
- No buttons of any kind
- Standby state: "ממתין לאירוע..." when no session active — auto-activates within 2s of any Code Blue start
- Designed for landscape tablet/TV mounted in the room

### State management

The polling hook (`useCodeBlueSession`) runs in both components:
- On mount: fetch immediately, then every 2000ms
- On disconnect or error: continue from local state (localStorage cache), queue log entries for retry
- On reconnect: flush queued entries, merge with server state

---

## Crash Cart Pre-Check (B1)

A structured checklist shown once before starting:

```
□ דפיברילטור — טעון ומוכן
□ חמצן — מחובר ופתוח
□ עירוי IV — מוכן (קו פתוח)
□ אפינפרין — זמין
□ אטרופין — זמין
□ אמבו — מוכן
```

User can check all items (passes pre-check) or tap "המשך ללא בדיקה" (pre_check_passed = false). Both lead to the active screen. The result is stored on the session and shown in the history page.

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
- Requires standard Clerk auth (same as any other page). The room tablet stays logged in as a clinic staff account. No special read-only token needed.

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
  "interventions": {
    "drug": 4,
    "shock": 2,
    "cpr": 1,
    "note": 3
  },
  "participants": ["נועה", "ד״ר כהן", "עמית"],
  "pre_check_passed": true,
  "outcome": "rosc"
}
```

No AI required — all fields are derivable from the log entries. Shown on the history page.

---

## Admin History Page (A2)

New page at `/admin/code-blue-history` (admin only).

- Table of past sessions: date, duration, outcome, patient, participants, pre-check result
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

1. New migration adds the 3 new tables alongside existing `vt_code_blue_events`
2. New API routes added to `server/routes/code-blue.ts` (old `/events` routes stay)
3. Frontend pages refactored to use new session architecture
4. Old `vt_code_blue_events` becomes write-once archive (only written by session close)
5. No data loss — existing events remain queryable from the history page

---

## Implementation Batches

**Batch 1 — Server foundation**
- DB migration: 3 new tables
- Drizzle schema additions
- 6 new API routes

**Batch 2 — Polling hook + shared state**
- `useCodeBlueSession` hook
- localStorage cache / offline queue
- Presence heartbeat

**Batch 3 — Handheld page refactor**
- Pre-check gate
- Full page rewrite using new hook
- CPR gate countdown
- Outcome modal + session close

**Batch 4 — Room display page**
- `/code-blue/display` route
- `CodeBlueDisplay` component
- Standby → active transition

**Batch 5 — Integration & extras**
- Patient chart link (launch from hospitalization)
- Push notification on session start
- Auto-summary generation on close
- Admin history page
