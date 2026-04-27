# Ward Display — Design Spec

**Date:** 2026-04-27
**Branch:** feat/code-blue-redesign
**Route:** `/display`
**Status:** Draft

---

## Overview

A read-only, large-screen projection dashboard for room tablets and wall-mounted TVs. It shows the real-time state of the entire ward — patients, equipment, staff, upcoming procedures — in a single glanceable view. When a Code Blue session is active, the entire screen is replaced instantly with the emergency command view.

This page replaces the `/code-blue/display` route that was planned in the Code Blue redesign spec (Batch 5 of `2026-04-27-code-blue-redesign.md`). The `/display` route covers both the standby ward view and the Code Blue active view in one component.

**Design principles:**
- Read-only — no buttons, no tap targets, no navigation chrome
- One URL — the room tablet bookmarks `/display` and never navigates away
- Two render modes — `normal` and `code-blue` — with an instant swap (no CSS transition) when a Code Blue session opens or closes
- Overdue medications are a loud visual alarm (pulsing red on the patient card + flashing chip in the awareness bar)
- Code Blue overrides everything — the ward view is completely replaced

---

## Route

| Route | Component | Auth |
|-------|-----------|------|
| `/display` | `WardDisplayPage` | Standard Clerk auth — same `<AuthGuard>` wrapper as all other authenticated routes; room tablet stays signed in as a clinic staff account |

The `/code-blue/display` route planned in the Code Blue spec is **removed**. `/display` replaces it.

---

## Two Render Modes

### Normal mode

Shown when `snapshot.codeBlueSession === null`. Polls every **5 seconds**.

Layout (16:9 landscape):
1. **Awareness bar** — full-width strip across the top
2. **Main area** — two-column grid: patients left (fills remaining width), right rail (420px fixed)

### Code Blue mode

Shown when `snapshot.codeBlueSession !== null`. Switches to polling every **2 seconds**.

The awareness bar and main layout are replaced entirely by `CodeBlueOverlay`. The switch is instant — no fade, no animation. The transition back to normal mode (when the session ends) is equally instant.

---

## Polling Hook — `useDisplaySnapshot`

**File:** `src/hooks/useDisplaySnapshot.ts`

- On mount: fetch immediately, then on interval
- Interval: `codeBlueSession !== null ? 2000 : 5000`
- On error: continue rendering from last-known state (no offline queue — this is read-only)
- Tracks `codeBlueSession` from previous render to detect mode transitions; on transition to Code Blue, sets interval to 2s immediately (does not wait for next tick)

---

## API — `GET /api/display/snapshot`

Single endpoint that aggregates all data needed for both render modes. `requireAuth`.

**Response shape:**

```json
{
  "currentTime": "2026-04-27T09:14:00Z",
  "currentShift": [
    { "employeeName": "ד״ר כהן", "role": "vet" },
    { "employeeName": "נועה", "role": "senior_technician" }
  ],
  "hospitalizations": [
    {
      "id": "...",
      "status": "critical",
      "ward": "ICU",
      "bay": "3",
      "admittingVetName": "ד״ר כהן",
      "animal": { "name": "מקסי", "species": "כלב", "breed": "לברדור", "weightKg": 28 },
      "overdueTaskCount": 1,
      "overdueTaskLabel": "אמוקסיצילין — 09:00 (14 דק׳ באיחור)"
    }
  ],
  "equipment": [
    {
      "id": "...",
      "name": "מכשיר הנשמה",
      "status": "ok",
      "checkedOutAt": "...",
      "linkedAnimalName": "מקסי",
      "checkedOutLocation": "ICU 3"
    }
  ],
  "upcomingTasks": [
    {
      "id": "...",
      "startTime": "2026-04-27T09:30:00Z",
      "taskType": "medication",
      "notes": "אמוקסיצילין",
      "animalName": "בלו",
      "status": "pending"
    }
  ],
  "activeAlertCount": 2,
  "totalOverdueCount": 1,
  "crashCartStatus": {
    "lastCheckedAt": "2026-04-27T06:00:00Z",
    "allPassed": true,
    "performedByName": "נועה"
  },
  "codeBlueSession": null
}
```

**When `codeBlueSession` is not null** it contains the full Code Blue payload (same shape as `GET /api/code-blue/sessions/active`): session metadata, logEntries, presence.

**`upcomingTasks`** — appointments for all patients where `startTime` is within the next 2 hours and `status` is `pending`, `assigned`, or `scheduled`. All task types included (medication, procedure, inspection, etc.). Sorted by `startTime` ascending.

**`overdueTaskCount` / `overdueTaskLabel` per hospitalization** — computed server-side: appointments for that animal where `startTime < now` and `status` is `pending` or `assigned`. If multiple are overdue, `overdueTaskLabel` shows the most overdue one; `overdueTaskCount` shows the total.

**`currentShift`** — staff rows from `vt_shifts` where `date = today` and `startTime <= now <= endTime`.

---

## Normal Mode: Component Breakdown

### `AwarenessBar`

Full-width strip. Left to right (RTL — right to left on screen):
- **Clock** — `HH:MM` in large monospace, updates each poll
- Divider
- **Staff pills** — one pill per `currentShift` entry showing name + role label
- Divider
- **Crash cart chip** — green "✓ עגלה נבדקה · Xשע׳" or amber "⚠ עגלה לא נבדקה היום" (same logic as Code Blue spec)
- **Alert count chip** — amber "⚠ N התראות" (hidden if 0)
- **Overdue medication chip** — red, pulsing animation "💊 תרופה באיחור — [patientName]". Hidden if `totalOverdueCount === 0`. If multiple patients have overdue meds, shows the first name + "ועוד N". Uses same `pulse-border` CSS animation as the patient card alert.
- **Hospitalization count chip** — gray "N מאושפזים" (always shown)

### `PatientGrid`

CSS grid: `auto-fill, minmax(180px, 1fr)`. Patients are sorted: `critical` first, then `observation`, then others, then `recovering`. Within each group, sorted by `admittedAt` ascending (longest-admitted first).

### `PatientCard`

Per hospitalization. Visual treatment by status:

| Status | Card background | Border | Top bar color | Badge color |
|--------|----------------|--------|---------------|-------------|
| `critical` | red-tinted | red | `#dc2626` | red |
| `observation` | amber-tinted | amber | `#d97706` | amber |
| `recovering` | green-tinted | green | `#16a34a` | green |
| `admitted` | indigo-tinted | indigo | `#6366f1` | indigo |

Card contents (top to bottom):
1. Status bar (3px colored strip)
2. Badge row: status badge + CPR Risk badge (shown if `status === 'critical'`)
3. Animal name (large, bold)
4. Species · Breed · Weight
5. Location: ward + bay
6. Attending vet name
7. **Overdue medication alert** (if `overdueTaskCount > 0`): pulsing red box showing `overdueTaskLabel`

The overdue alert box uses a CSS keyframe animation cycling border and background opacity (1s, infinite). No JS timers required.

### `EquipmentPane` (right rail, top ~60%)

Lists all equipment from `snapshot.equipment`. Each row:
- Equipment name (with emoji icon by category where available)
- Sub-line: `linkedAnimalName · checkedOutLocation` if checked out; room name if not
- Status chip: `in-use` (green), `available` (indigo), `maintenance`/`critical`/`needs_attention` (red)

Sorted: in-use first, then available, then maintenance.

### `UpcomingTasksPane` (right rail, bottom ~40%)

Lists `snapshot.upcomingTasks`. Each row:
- Time (`HH:MM`): amber + bold if within 30 minutes, gray otherwise
- Task description: `notes` field (drug name / procedure name) + ` — ` + animal name
- Task type badge: `medication` (purple), everything else (blue "פרוצדורה")

Maximum 6 rows shown (overflow hidden — screen space is fixed). If there are more than 6, show a gray "+N נוספים" line.

---

## Code Blue Mode: `CodeBlueOverlay`

Replaces the entire page content (awareness bar + main layout gone). Full-screen dark background (`#0d0505`).

### Header bar

Pulsing red background (CSS animation, 1.5s). Contains:
- "⚠ CODE BLUE" label (large, bold)
- Elapsed timer — computed from `session.startedAt` (server time, not `Date.now()`) formatted as `MM:SS`
- Manager name: "מנהל הפצה: [managerUserName]"
- Presence pills — one per entry in `snapshot.codeBlueSession.presence` with a blinking green dot. Stale threshold: `lastSeenAt > 30s ago` → pill grays out.

### Three-column body

**Column 1 — Patient**
- Animal name (large), species/breed/weight, location
- CPR Risk badge if applicable
- Attached equipment list (log entries with `category = 'equipment'`)

**Column 2 — Event timeline**
- All `logEntries` from the session, sorted by `elapsedMs` ascending
- Each row: elapsed time (MM:SS) · label · logged-by name
- Newest entries at bottom. No scroll on the display — last N entries that fit are shown.

**Column 3 — Sidebar**
- Remaining hospitalized patients — all hospitalizations except the one matching `session.patientId` (if `session.patientId` is null, all hospitalizations are shown) — name, location, status color
- Crash cart status chip
- Push notification confirmation: "📱 Push נשלח לכל הצוות · לפני X דק׳"

---

## Push Notifications — Phone Integration

Uses the existing BullMQ web-push worker and `vt_push_subscriptions` table.

### New job type: `overdue_medication_alert`

**Trigger:** A new repeatable BullMQ job (`medication-overdue-check`) runs every **60 seconds** server-side. It queries:
```sql
SELECT a.*, an.name AS animal_name
FROM vt_appointments a
JOIN vt_animals an ON an.id = a.animal_id
WHERE a.task_type = 'medication'
  AND a.status IN ('pending', 'assigned')
  AND a.start_time < NOW()
  AND (a.overdue_notified_at IS NULL OR a.overdue_notified_at < a.start_time)
```

For each newly-overdue appointment:
1. Enqueue a `send_push_notification` job targeting: the assigned vet (`vetId`) + all users on the current shift.
2. Set `overdue_notified_at = NOW()` on the appointment row to prevent duplicate notifications.

**Notification payload:**
```json
{
  "title": "💊 תרופה באיחור",
  "body": "[animal_name] — [drug_name] · [N] דק׳ באיחור",
  "url": "/patients/[animalId]"
}
```

**Schema change:** Add `overdue_notified_at TIMESTAMPTZ` column to `vt_appointments`.

### Existing: Code Blue push

Code Blue session start already fires push to all staff (from Code Blue redesign spec). No change needed here.

---

## Modification to Code Blue Redesign Plan

The `/code-blue/display` route and `CodeBlueDisplay` component (Batch 5 of `2026-04-27-code-blue-redesign.md`) are **removed**. The ward display (`/display`) handles the Code Blue room view.

Items removed from Code Blue plan:
- `src/pages/code-blue-display.tsx` (no longer created)
- Route registration for `/code-blue/display` in `src/app/routes.tsx`

The `GET /api/display/snapshot` endpoint includes the full Code Blue session payload, so no separate Code Blue polling endpoint is needed for the display page.

---

## New Files

| File | Action |
|------|--------|
| `src/pages/display.tsx` | Create — `WardDisplayPage` + `CodeBlueOverlay` |
| `src/hooks/useDisplaySnapshot.ts` | Create — polling hook, 5s/2s interval |
| `server/routes/display.ts` | Create — `GET /api/display/snapshot` |
| `src/app/routes.tsx` | Modify — add `/display` route with `<AuthGuard>` |
| `server/app/routes.ts` | Modify — register display router |
| `tests/ward-display.test.js` | Create — static analysis tests |

**Schema change:** `overdue_notified_at TIMESTAMPTZ` added to `vt_appointments` in a new migration.

---

## Testing Requirements

Static analysis against source files (Vitest pattern, same as existing tests):

| Test | What it checks |
|------|---------------|
| Code Blue mode activates | `WardDisplayPage` renders `CodeBlueOverlay` when `snapshot.codeBlueSession !== null` |
| Polling interval | `useDisplaySnapshot` uses interval `2000` when session active, `5000` otherwise |
| Overdue alert on card | `PatientCard` renders `.overdue-alert` element when `overdueTaskCount > 0` |
| Overdue chip in awareness bar | `AwarenessBar` renders overdue chip when `totalOverdueCount > 0` |
| No interactive elements | `display.tsx` source contains no `onClick`, `onPress`, `<button`, or `<a href` (read-only enforcement) |
| Task sort | `upcomingTasks` in snapshot response are sorted by `startTime` ascending |
| Equipment sort | `EquipmentPane` renders in-use equipment before available |
| Overdue notification dedup | `overdue_notified_at` is set after firing; job skips rows where `overdue_notified_at >= start_time` |

---

## Implementation Batches

**Batch 1 — Schema + API**
- Migration: add `overdue_notified_at` to `vt_appointments`
- `server/routes/display.ts`: `GET /api/display/snapshot` (aggregates all 6 data domains)
- Register router in `server/app/routes.ts`

**Batch 2 — Polling hook + page shell**
- `useDisplaySnapshot` hook (5s/2s interval, error fallback to last state)
- `WardDisplayPage` shell with mode detection

**Batch 3 — Normal mode components**
- `AwarenessBar` (clock, staff, cart, alerts, overdue chip)
- `PatientGrid` + `PatientCard` (status colors, CPR badge, overdue alert)
- `EquipmentPane` + `UpcomingTasksPane`

**Batch 4 — Code Blue overlay**
- `CodeBlueOverlay` (header, 3-column body, presence pills, elapsed timer)
- Instant mode swap on `codeBlueSession` change

**Batch 5 — Push notification job**
- BullMQ repeatable job `medication-overdue-check` (60s interval)
- `overdue_notified_at` dedup logic

**Batch 6 — Route wiring + tests**
- `/display` route in `src/app/routes.tsx`
- `tests/ward-display.test.js`
- Remove `/code-blue/display` from Code Blue plan
