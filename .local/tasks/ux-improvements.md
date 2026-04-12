# UX Flow Improvements

## What & Why
Fix 10 identified UX friction points across the core VetTrack workflows (scanning, checkout/return, issue reporting, alerts, My Equipment, and the home screen). All changes are UI and flow level only — no backend data structure changes, no new APIs.

## Done looks like
- The detail-page status button is no longer labeled "Scan" — it has a distinct name that makes its purpose obvious
- Reporting an issue is a direct one-tap action from the equipment detail page, not hidden inside a multi-step scan flow
- After scanning a QR code the user lands on a focused action screen, not a layered sheet on top of a detail page
- WhatsApp alert is sent by default on issue report; a cancel toast is shown instead of a blocking prompt
- Alert cards show equipment location inline — no extra tap needed
- Home stat cards for "Issues" and "OK" are tappable deep links into filtered views
- The home screen shows a "Resume" banner when the user's last session was on a specific equipment page
- The 10-second undo toast has a visible progress bar so the window feels real and time-limited
- Manual scan fallback surfaces automatically after ~8s if no code is detected
- My Equipment page has a "Return All" button with a single confirmation dialog

## Out of scope
- Backend API changes or new data fields
- Redesigning the overall layout or navigation structure
- Any new feature that isn't already present in the existing codebase
- Changes to the video, demo guide, analytics, admin, or QR print pages

## Tasks

1. **Rename the detail-page "Scan" button to "Update Status"** — In `equipment-detail.tsx`, find all instances where the status-update action is labeled "Scan" (button label, dialog title, sheet heading) and replace with "Update Status" or "Log Status". Update the `Scan` icon import to a more appropriate icon (e.g., `ClipboardEdit` or `Activity`) for this button only. The bottom-nav Scan button is untouched.

2. **Add a direct "Report Issue" shortcut on the equipment detail page** — Add a clearly visible "Report Issue" button on the equipment detail page that opens a focused bottom sheet containing only: the mandatory note field, an optional photo upload, and a submit button. Submitting this sheet sets the status to "issue" directly, without going through the status picker. This replaces the buried path of Scan → pick Issue status → fill note.

3. **Replace WhatsApp blocking prompt with default-send + cancel toast** — When an issue is reported (via the new shortcut or the existing scan flow), automatically send the WhatsApp alert and show a toast: "Issue reported — WhatsApp alert sent. Cancel?" with a 10-second cancel action. Remove the existing blocking dialog/prompt that asks "Send WhatsApp alert?" before sending.

4. **Show equipment location on alert cards** — In `alerts.tsx`, add a location line to each alert card below the equipment name. Use `alert.location` or `alert.checkedOutLocation` from the equipment data already fetched. Show it as a small `MapPin` + text line. If no location is set, omit the line gracefully.

5. **Make home stat cards deep-link into filtered views** — In `home.tsx`, wrap the "Issues" stat card in a `<Link>` to `/equipment?status=issue` and the "OK" stat card in a `<Link>` to `/equipment?status=ok`. Match the existing pattern already used by the "Alerts" card (which already links to `/alerts`). Ensure the Equipment List page respects the `?status=` query param to pre-filter on load.

6. **Add a "Resume" banner on the home screen for interrupted sessions** — In `home.tsx`, store the last-visited equipment ID in `localStorage` whenever the user navigates to an equipment detail page (hook into the detail page's mount). On the home screen, read this value and if it exists and the item is still checked out by the current user, show a dismissible banner at the top: "Continue with [Equipment Name]?" with a tap-to-navigate action. Clear the stored ID when the user explicitly returns the equipment or dismisses the banner.

7. **Add a progress bar to the undo toast** — In `equipment-detail.tsx`, the existing `startUndoTimer` function already tracks a countdown in `undoCountdown` state. Add a thin animated progress bar element inside the undo toast (or as a persistent inline element below the action buttons when `undoCountdown > 0`) that shrinks from full width to zero over 10 seconds. This makes the undo window visually concrete without changing the timer logic.

8. **Auto-surface the manual scan fallback after 8 seconds** — In `qr-scanner.tsx`, start an 8-second timer when the scanner opens. If no QR code has been successfully decoded by then, automatically reveal/highlight the manual entry field with a subtle prompt: "Having trouble? Try entering the ID manually." If a scan succeeds before the timer fires, cancel it.

9. **Add "Return All" to My Equipment** — In `my-equipment.tsx`, add a "Return All" button above the item list (only visible when 2 or more items are checked out). Clicking it shows a confirmation dialog: "Return all [N] items?" with Confirm and Cancel. On confirm, call the existing `api.equipment.return` for each item in sequence (or in parallel), then invalidate queries and show a success toast.

## Relevant files
- `src/pages/equipment-detail.tsx`
- `src/pages/home.tsx`
- `src/pages/alerts.tsx`
- `src/pages/my-equipment.tsx`
- `src/components/qr-scanner.tsx`
- `src/lib/utils.ts`
- `src/types/index.ts`
