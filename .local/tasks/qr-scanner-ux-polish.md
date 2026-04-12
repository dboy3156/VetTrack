# QR Scanner Visual & UX Fix

## What & Why
The QR scanner currently shows two competing viewfinder visuals: the `html5-qrcode` library renders its own scanning rectangle with borders, and our custom corner-bracket overlay draws a second frame on top of it. On a real device (screenshot provided) this looks broken — a large white library box surrounded by teal corner brackets at a different scale. Additionally there is no animated feedback to signal active scanning, and the camera viewport layout feels off on portrait mobile.

## Done looks like
- Only one clean viewfinder frame is visible — the custom corner-bracket design, with no library border behind it
- The custom frame size matches the library's `qrbox` exactly (250×250)
- An animated horizontal scan line pulses inside the frame to signal active scanning
- The camera feed fills the full available height on portrait mobile naturally (no black bands or awkward cropping)
- "Scan QR Code" header and "Enter code manually" footer remain visible and functional
- All existing error states (permission denied, no camera, not found) are unaffected

## Out of scope
- Replacing the `html5-qrcode` library with a different scanning engine
- Changing the scan logic, debounce, or navigation behaviour
- Changing the manual entry mode UI

## Tasks
1. **Suppress library default UI** — Add CSS that hides `html5-qrcode`'s own scanning region border, shaded overlay regions, and any injected buttons/text so the camera feed renders as a clean full-bleed video.
2. **Align custom overlay to scan region** — Fix the custom corner-bracket frame dimensions to exactly match the `qrbox` (250×250px), ensure it is centered correctly over the live video feed, and add a CSS keyframe animation for a scan-line that sweeps top-to-bottom inside the frame.
3. **Camera viewport layout** — Remove the square `aspectRatio: 1.0` constraint (or increase it) so the camera fills the available height on a tall portrait phone without awkward black bands.

## Relevant files
- `src/components/qr-scanner.tsx`
