---
title: Clinical Scan UX & Staff Onboarding
---
# Clinical Scan UX & Staff Onboarding

## What & Why
Two real-world failure modes are addressed here:

1. **Post-scan friction**: When a technician scans a QR code in the field, they land on the full equipment detail page and must scroll down, find the right button, and tap through a confirmation — 5–7 taps under ICU pressure. The scan action should surface immediately after the QR scan as a single-tap bottom sheet.

2. **Alert acknowledgment abandonment**: "I'm handling this" currently has no follow-up. An alert can be acknowledged, forgotten, and left unresolved indefinitely — the alert disappears from the active list with no consequence. Critical alerts need a reminder cycle.

3. **Zero onboarding**: New staff land on the home dashboard with no guidance on how to scan, check out, or report issues. This kills adoption for non-technical users.

## Done looks like
- **Quick-action scan sheet**: After a QR scan resolves to an equipment item, a bottom sheet slides up BEFORE navigating to the detail page. It shows the item name, current status, and 3-4 large tappable action buttons: "Mark OK", "Mark Issue", "Check Out / Return", "View Details". Tapping an action executes it immediately (with the existing confirmation flow if needed) and dismisses the sheet. "View Details" navigates to the full detail page.
- **Alert acknowledgment timer**: When a user taps "I'm handling this" on a Critical or High alert, the system records a `handledAt` timestamp and sets a follow-up reminder (configurable, default 30 minutes). If the alert has not been resolved (status still active) after the follow-up window, the acknowledging user receives a push notification: "Reminder: You said you'd handle [Equipment Name] — still unresolved." The alert card shows "Handling since X minutes ago" instead of the acknowledge button.
- **First-run onboarding**: New users who have never scanned anything see a dismissible 3-card walkthrough on the Home page: (1) how to scan a QR, (2) how to check out equipment, (3) how to report an issue. Progress is tracked in localStorage and the walkthrough disappears permanently once dismissed or completed.

## Out of scope
- Multi-step guided tours or interactive overlays (keep it to static info cards)
- Alert auto-resolution based on a subsequent OK scan (handled in a separate alert logic task)
- Video tutorials or help documentation

## Tasks
1. **Post-scan quick-action bottom sheet** — After QR scan resolves an equipment ID, show a bottom sheet with large action buttons (Mark OK, Mark Issue, Checkout/Return, View Details) before routing to the detail page; execute the chosen action using the existing mutation logic.

2. **Alert acknowledgment follow-up reminders** — Add a `handledAt` timestamp and `handledBy` field to the alert-acks table; schedule a push notification reminder after a configurable window (default 30 min) if the alert is still active; update the alert card UI to show "Handling since X ago" with the handler's name instead of the acknowledge button.

3. **First-run onboarding walkthrough** — Build a dismissible 3-card info strip on the Home page for users with zero scan history; use localStorage to track dismissal; cards cover: scan a QR, check out equipment, report an issue.

## Relevant files
- `src/pages/home.tsx`
- `src/pages/qr-scanner.tsx`
- `src/pages/alerts.tsx`
- `src/components/shift-summary-sheet.tsx`
- `server/routes/alert-acks.ts`
- `server/routes/equipment.ts`
- `server/lib/push.ts`