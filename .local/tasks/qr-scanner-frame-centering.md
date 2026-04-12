# QR Scanner Frame Centering Fix

## What & Why
The scanning frame (corner bracket overlay) appears near the bottom of the screen instead of the center. This happens because the `html5-qrcode` library injects multiple nested `div` elements and only the direct child div is forced to full height via CSS. Deeper nested divs take on the video's natural height, offsetting the camera feed and the visual overlay relative to each other.

## Done looks like
- The green corner bracket frame is visually centered in the camera viewport on mobile
- The camera feed fills the full available height behind the frame
- The scan line animation moves correctly within the centered frame

## Out of scope
- Any changes to scanning logic, QR decoding, or other scanner phases

## Tasks
1. **Fix library div height cascade** — Extend the CSS selectors in `src/index.css` to force all nested divs within `#qr-scanner-container` (not just the direct child) to fill 100% width and height, so the video and its wrapper divs fill the container completely.

2. **Verify overlay centering** — Ensure the scanning guide overlay in `qr-scanner.tsx` uses `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)` (or equivalent) to guarantee pixel-perfect vertical and horizontal centering independent of any library-injected layout.

## Relevant files
- `src/index.css:91-117`
- `src/components/qr-scanner.tsx:298-299,423-440`
