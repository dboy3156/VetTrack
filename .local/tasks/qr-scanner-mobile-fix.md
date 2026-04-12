# QR Scanner Mobile Centering & Polish

## What & Why
The QR scanner's viewfinder frame is visually off-center on real mobile devices. The `html5-qrcode` library injects deeply nested divs; the blanket `height: 100%` CSS rule applied to all nested divs inside `#qr-scanner-container` conflicts with the library's internal layout and prevents the video from filling the space correctly. As a result, the custom corner-bracket overlay does not align with the actual camera feed. The scanner also does not fully meet mobile UX standards (safe area insets, tap targets, portrait layout).

## Done looks like
- The green corner-bracket frame is visually centered over the live camera feed on portrait mobile (tested on iOS Safari and Android Chrome)
- The camera video fills the entire available height between the header and footer — no black bands or dead space
- The scan line animates correctly inside the centered frame
- Header and "Enter code manually" footer respect safe area insets (no overlap with home bar or status bar)
- All error states (permission denied, no camera, not found) remain correctly centered and functional

## Out of scope
- Replacing the `html5-qrcode` library
- Changing scan logic, debounce, or navigation behaviour
- Manual entry mode UI changes

## Tasks
1. **Fix library div height cascade** — Replace the blanket `#qr-scanner-container div { height: 100% }` CSS with a more targeted rule that forces only the immediate wrapper divs (not the scan-region div) to stretch, while leaving the library's internal qrbox div at its natural 250×250 size. Use `:not` selectors or more specific selectors to avoid interfering with the scan-region sizing.

2. **Re-center the custom overlay** — Change the scanning guide overlay positioning in `qr-scanner.tsx` from `absolute inset-0 flex items-center justify-center` to an explicit `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)` so it centers correctly regardless of how the library's divs are laid out underneath.

3. **Safe area insets** — Add `env(safe-area-inset-top)` padding to the header and `env(safe-area-inset-bottom)` padding to the footer so the scanner is fully usable on phones with notches and home indicators.

4. **Camera viewport height** — Ensure the camera viewport `flex-1` region actually expands to fill all remaining space on tall portrait phones, with no `aspectRatio` or fixed height constraint interfering.

## Relevant files
- `src/components/qr-scanner.tsx:264-460`
- `src/index.css:91-129`
