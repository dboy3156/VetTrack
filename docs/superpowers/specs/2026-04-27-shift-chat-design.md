# Shift Chat — Design Spec

**Date:** 2026-04-27  
**Branch:** feat/code-blue-redesign  
**Status:** Approved

---

## Overview

A built-in shift-scoped group chat channel embedded in VetTrack as a floating button accessible from every screen. Scoped to the active shift session (`vt_shift_sessions`), visible only to doctors, technicians, and senior technicians. Messages are archived read-only when the shift ends. Real-time updates via 3-second polling.

The chat has two layers:
1. **Regular messaging** — plain text, @mentions, optional URGENT flag
2. **Broadcast commands** — senior technician only; structured alert cards (e.g. "סגירת מחלקה") requiring per-technician acknowledgment

A third category of **system cards** is auto-posted by the server on specific events (Code Blue, critical medication, low stock, etc). System cards are read-only.

---

## RBAC

| Role | Send messages | Send broadcast | See broadcast acks | Pin message | Post system cards |
|---|---|---|---|---|---|
| `doctor` | ✅ | ❌ | read-only | ❌ | auto only |
| `technician` | ✅ | ❌ | own response only | ❌ | — |
| `senior_technician` | ✅ | ✅ | full progress view | ✅ | — |
| `admin` | ✅ | ✅ | full progress view | ✅ | auto only |
| `student` | ❌ | ❌ | ❌ | ❌ | — |

Shift membership is determined by the active `vt_shift_sessions` row for the clinic. Users not part of the active shift cannot read or write to the channel.

---

## Data Model

### `vt_shift_messages`

| Column | Type | Notes |
|---|---|---|
| `id` | `text` PK | nanoid |
| `shiftSessionId` | `text` FK → `vt_shift_sessions.id` | Required |
| `clinicId` | `text` FK → `vt_clinics.id` | Required |
| `senderId` | `text` FK → `vt_users.id` | Null for system cards |
| `senderName` | `text` | Snapshot at send time |
| `senderRole` | `text` | Snapshot at send time |
| `body` | `text` | Message content (max 1000 chars) |
| `type` | `text` | `regular` \| `broadcast` \| `system` |
| `broadcastKey` | `text` | e.g. `department_close`. Null for non-broadcast |
| `systemEventType` | `text` | e.g. `code_blue_start`, `med_critical`, `low_stock`. Null for non-system |
| `systemEventPayload` | `jsonb` | Structured data for the event card |
| `roomTag` | `text` | Optional room label (e.g. `חדר 3`, `ICU`) |
| `isUrgent` | `boolean` | Default false |
| `mentionedUserIds` | `text[]` | User IDs extracted from @mentions |
| `pinnedAt` | `timestamp` | Set when message is pinned; null otherwise |
| `pinnedByUserId` | `text` | Who pinned it |
| `createdAt` | `timestamp` | Auto |

### `vt_shift_message_acks`

| Column | Type | Notes |
|---|---|---|
| `messageId` | `text` FK → `vt_shift_messages.id` | |
| `userId` | `text` FK → `vt_users.id` | |
| `status` | `text` | `acknowledged` \| `snoozed` |
| `respondedAt` | `timestamp` | Auto |

Composite PK: `(messageId, userId)`. Upsert on re-response.

### `vt_shift_message_reactions`

| Column | Type | Notes |
|---|---|---|
| `messageId` | `text` FK → `vt_shift_messages.id` | |
| `userId` | `text` FK → `vt_users.id` | |
| `emoji` | `text` | `👍` \| `✅` \| `👀` |
| `createdAt` | `timestamp` | Auto |

Composite PK: `(messageId, userId, emoji)`. Toggle: delete if row exists, insert if not.

---

## API Endpoints

### `GET /api/shift-chat/messages`
Poll for messages. Returns messages created after `after` timestamp for the current open shift.

**Query params:** `after` (ISO timestamp, optional — omit for full history)  
**Auth:** `requireAuth` + user must have role `doctor`, `technician`, `senior_technician`, or `admin` in a clinic with an open shift. No explicit enrolment list — membership is role-based: any eligible user in the clinic can join the active shift's channel.  
**Response:**
```json
{
  "messages": "ShiftMessage[]",
  "pinnedMessage": "ShiftMessage | null",
  "typing": ["Lita", "Dr. Cohen"],
  "onlineUserIds": ["user-id-1", "user-id-2"]
}
```

`onlineUserIds` is derived from the server-side in-memory presence map (same TTL mechanism as typing, updated on each successful poll — 5-minute TTL). The client renders the green dot on avatars for IDs in this list.

Polling interval: **3 seconds** on the client. Paused when panel is closed.

---

### `POST /api/shift-chat/messages`
Send a regular message or broadcast command.

**Body:**
```json
{
  "body": "string (max 1000)",
  "type": "regular | broadcast",
  "broadcastKey": "department_close",
  "roomTag": "חדר 3",
  "isUrgent": false,
  "mentionedUserIds": ["user-id-1"]
}
```

**Auth:** `requireAuth` + `requireEffectiveRole(['doctor','technician','senior_technician','admin'])`  
Broadcast: additionally requires `senior_technician` or `admin`.

---

### `POST /api/shift-chat/messages/:id/ack`
Respond to a broadcast card.

**Body:** `{ "status": "acknowledged" | "snoozed" }`  
**Auth:** requireAuth + technician only  
**Snooze behaviour:** server enqueues a BullMQ job to re-send a push notification to this user after 5 minutes.

---

### `POST /api/shift-chat/messages/:id/pin`
Pin a message. Unpins any previously pinned message for this shift.

**Auth:** `senior_technician` or `admin`

---

### `POST /api/shift-chat/reactions`
Add or toggle an emoji reaction on a message.

**Body:** `{ "messageId": "...", "emoji": "👍" | "✅" | "👀" }`  
**Auth:** `requireAuth` + active shift member  
Toggles the row in `vt_shift_message_reactions`: deletes if exists, inserts if not. Returns updated reaction counts for the message.

---

## System Auto-Post Events

The following server-side events trigger an automatic `system` type message posted to the active shift channel. Each uses `systemEventType` and `systemEventPayload` to render a specific card on the client.

| Event | `systemEventType` | Trigger |
|---|---|---|
| Code Blue opened | `code_blue_start` | Existing Code Blue POST handler |
| Code Blue closed | `code_blue_end` | Existing Code Blue PATCH handler |
| Critical medication task created | `med_critical` | `vt_medication_tasks` insert with `safetyLevel = critical` |
| Hospitalization → critical status | `hosp_critical` | `vt_hospitalizations` status update |
| Hospitalization → discharged | `hosp_discharged` | `vt_hospitalizations` status update |
| Equipment not returned after 60 min | `equipment_overdue` | BullMQ scheduled check (existing overdue worker) |
| Inventory item below threshold | `low_stock` | Existing inventory deduction worker |
| Shift ended — summary card | `shift_summary` | Shift end handler (pulls from handover summary API) |

Auto-post logic: a shared `postSystemMessage(clinicId, type, payload)` utility checks for an open shift session and inserts a message if one exists. No-op if no open shift.

---

## Broadcast Templates

Defined server-side. `broadcastKey` maps to a display label and subtitle:

| Key | Hebrew label | Subtitle |
|---|---|---|
| `department_close` | סגירת מחלקה | כל הטכנאים — לנקות ולסדר את המחלקה |

Additional templates can be added to the config without schema changes.

---

## Push Notifications

Reuses existing `vt_push_subscriptions` and web-push infrastructure.

| Trigger | Audience |
|---|---|
| `@mention` in message | Mentioned users only |
| `isUrgent = true` | All shift members |
| Broadcast command | All technicians in shift |
| Snooze expiry | The snoozed user only (via BullMQ) |

Push payload includes `shiftChatMessageId` so the client can deep-link to the message on tap.

---

## Frontend Components

### `ShiftChatFab`
Fixed-position floating button (bottom-left on RTL layout). Shows unread badge count. Clicking opens `ShiftChatPanel`. Polling starts when panel is open, pauses when closed.

### `ShiftChatPanel`
Full-height slide-up sheet. Contains:
- **Chat header** — title, online count, close button
- **Pinned strip** — shown when a pinned message exists; amber background
- **Room filter bar** — horizontal scrollable chips (All + unique room tags from messages). Filters message list client-side.
- **Presence bar** — avatars of shift members, green dot = active in last 5 min. Online state is derived from `onlineUserIds` in the poll response (server-side in-memory map, updated on each poll, 5-minute TTL)
- **Message list** — scrollable; auto-scrolls to bottom on new messages unless user has scrolled up
- **Typing indicator** — debounced, sent via a lightweight `POST /api/shift-chat/typing` (TTL 3s)
- **Input bar** — broadcast trigger button (📢, senior/admin only), text input with @mention autocomplete, ⚡ URGENT toggle, send button

### Message rendering by type

| Type | Rendered as |
|---|---|
| `regular` | Chat bubble (left = others, right = me) with reactions strip |
| `broadcast` | Full-width indigo card with action buttons (ack/snooze) for recipients; progress bar for sender |
| `system` | Full-width tinted card, no actions, no reactions |

### `#patient` mention
`#` in the input opens an animal search popover (filtered by clinic). Selecting inserts `#animalName` as a token. Rendered as a tappable link that navigates to the animal record.

### Quick replies
When a message contains your `@mention`, or a broadcast arrives, a strip of quick-reply chips appears above the input bar: **בדרך · 5 דק׳ · ✏️ כתוב**. Tapping "בדרך" sends a pre-filled reply; "5 דק׳" triggers snooze; "✏️ כתוב" focuses the input.

---

## Archive Access

After a shift ends, the chat is locked (no new messages). Accessible at `/shifts/:shiftId/chat` — read-only view, same rendering, no input bar. Visible to `admin` and `senior_technician` roles. Useful for incident review and auditing.

---

## Typing Indicator & Presence

Both typing and online presence are tracked via a single in-memory map on the server (no DB writes):

```
presenceMap: { clinicId → { userId → { name, typingUntil, lastSeenAt } } }
```

- **Typing:** `POST /api/shift-chat/typing` sets `typingUntil = now + 3s`. Names with `typingUntil > now` appear in the `typing` array of the poll response.
- **Online:** Every successful poll updates `lastSeenAt = now`. Users with `lastSeenAt > now - 5min` appear in `onlineUserIds`.
- Map is reset on server restart (acceptable — presence is ephemeral).

---

## Error Handling

- **No open shift:** FAB is hidden. Chat is not accessible.
- **Message send failure:** Optimistic UI roll-back, toast error.
- **Poll failure:** Silent retry; no error shown unless 3 consecutive failures.
- **Broadcast ack failure:** Retry once; if still failing, show inline error on the card.

---

## Out of Scope

- Private 1-on-1 conversations
- Message editing or deletion
- File/image attachments
- Multiple broadcast templates in one send
- Room-level presence (location tracking removed — not viable in a PWA without hardware)
- Push-to-talk / voice messages
