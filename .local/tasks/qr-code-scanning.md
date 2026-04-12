# QR Code Scanner — Full Implementation

## What & Why
VetTrack currently has no camera-based QR scanning. Technicians need to physically scan equipment tags to instantly pull up status and take action (check out, return, report issue) — without typing. This feature closes that gap and makes the core QR-first workflow functional on mobile.

## Done looks like
- A "Scan" button on the Home page opens a full-screen camera scanner immediately (< 1 second)
- Scanning a valid QR code navigates to the equipment detail screen and shows a quick-action overlay (Check Out / Return / Report Issue) with zero extra steps
- Camera permissions are requested gracefully; if denied, a fallback "Enter code manually" option is shown
- The scanner works on iOS Safari and Android Chrome
- Low-light conditions are handled: torch/flashlight toggle is available where the browser supports it
- If the same item is scanned twice quickly, the second scan is debounced (ignored for ~2 seconds)
- If the QR code is unrecognized (no matching equipment), a clear error message is shown with the manual entry fallback
- Scanning works fully offline — the equipment data is read from local IndexedDB cache and actions are queued for sync (consistent with Task #2's offline infrastructure)
- A Cancel button dismisses the scanner from any state with one tap
- Continuous scan mode: after completing an action, the scanner can re-open immediately for the next item

## Out of scope
- Generating or printing QR codes (already handled by `qr-print.tsx`)
- Barcode formats other than QR (no barcodes, no Data Matrix)
- Native mobile app packaging (iOS/Android app stores)

## Tasks

1. **Install html5-qrcode and create the QR scanner component** — Install `html5-qrcode` (or `@zxing/browser` as a fallback if html5-qrcode has iOS issues). Build a `QrScanner` full-screen overlay component: immediate camera open on mount, auto-focus/continuous scanning, a torch toggle button where `MediaTrackCapabilities.torch` is supported, and a Cancel button. Handle permission denial by showing a clear message and a "Enter code manually" text input fallback in the same overlay.

2. **Wire scan result to navigation and quick-action overlay** — On successful scan, parse the QR payload to extract `equipmentId`. Look up the equipment from the TanStack Query cache (or Dexie offline DB if offline). Navigate to `/equipment/:id` and immediately surface an action sheet (bottom sheet / modal) showing the equipment name, current status badge (highlighted if checked out or has an active issue), and three large tap-friendly buttons: "Check Out", "Return", and "Report Issue". Tapping an action triggers the existing mutation logic already present in `equipment-detail.tsx`.

3. **Debounce, error handling, and edge cases** — Implement a ~2-second cooldown after a successful scan to prevent duplicate triggers. If the scanned ID doesn't match any known equipment (online or offline cache), show an inline error message with the "Enter code manually" fallback. Handle the "already checked out by another user" case by showing who has it and offering Return (if admin) or a Read-only view. Handle camera hardware failures (device has no camera, `getUserMedia` error) with a graceful fallback message.

4. **Integrate Scan trigger into Home page and layout** — Replace or enhance the existing QR icon/button on the home page to open the scanner overlay. Ensure the scanner is accessible from the bottom navigation bar as well (consistent with how technicians would access it during rounds).

5. **Offline compatibility** — Ensure the scan lookup works against the Dexie local cache when offline. Actions taken from the scan overlay (check out, return, report issue) must route through the same offline sync queue being built in Task #2.

## Relevant files
- `src/pages/home.tsx`
- `src/pages/equipment-detail.tsx`
- `src/components/layout.tsx`
- `src/lib/offline-db.ts`
- `src/lib/api.ts`
- `src/pages/qr-print.tsx`
