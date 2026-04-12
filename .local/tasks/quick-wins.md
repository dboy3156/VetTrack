# Quick Wins: Four Targeted Fixes

## What & Why
Four small, independent improvements that each have a concrete, measurable impact on reliability, UX, or safety — none of which are covered by existing tasks.

## Done looks like
- Typing in the equipment search bar no longer hammers the URL/render cycle on every keystroke — there is a visible smoothness improvement.
- Clicking "Delete" or "Move" on a bulk selection disables the button immediately, preventing a second request from firing before the first completes.
- If the QR scanner camera fails to initialize within 10 seconds, the UI automatically falls back to a manual equipment ID entry field instead of showing an infinite spinner.
- Attempting to attach a photo larger than 2 MB during a scan/status update shows a clear, immediate error message before any network request is made.

## Out of scope
- DB query indexes (covered by Task #32)
- General loading/empty state patterns (covered by Task #45)
- Sync queue UI changes (covered by Task #30)
- Any auth, RBAC, or audit log work (covered by Tasks #33–#44)

## Tasks

1. **Debounce equipment list search** — Add a 200–300ms debounce between the input's `onChange` event and the URL param update (`setSearch`) in `equipment-list.tsx` so the filter and URL only update after the user pauses typing.

2. **Disable bulk action buttons while pending** — In `equipment-list.tsx`, set the bulk-move dropdown trigger and the bulk-delete button to `disabled` (and show a spinner or "Working…" label) whenever their respective mutations are `isPending`, preventing duplicate submissions.

3. **QR scanner camera timeout fallback** — In `qr-scanner.tsx`, start a 10-second timer when entering the camera init phase. If the camera has not successfully started by then, cancel the init attempt and switch to a manual "Enter Equipment ID" text input so the user is never stuck on the loading screen.

4. **Client-side photo size guard** — In `equipment-detail.tsx` (and any other place a `FileReader` converts an image to base64 before upload), check `file.size` before reading. If it exceeds 2 MB, show an inline error ("Photo must be under 2 MB") and abort — never send the request.

## Relevant files
- `src/pages/equipment-list.tsx`
- `src/components/qr-scanner.tsx`
- `src/pages/equipment-detail.tsx`
