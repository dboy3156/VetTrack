# VetTrack Canva-Style Showcase Screen

## What & Why
Build a single, polished product showcase screen in the mockup sandbox that replicates the Canva-style layout from the user's reference images. This is ONE screen — not a presentation, not multiple slides — rendered as a live component on the canvas.

## Done looks like
- A single rendered screen visible on the canvas as an iframe
- Left side: phone mockup image inside a perfect circle, with a soft organic olive/taupe blob shape behind it
- Right side: large bold title ("VetTrack" or similar) + short paragraph with key words in bold
- Warm beige/cream background (#f0ece3 or similar)
- Olive/taupe blob shape (matching the reference: #8a8570 or similar)
- Clean whitespace, no clutter, no borders or hard edges
- The user's attached phone mockup screenshot (IMG_2431) used as the device image
- Typography: large bold serif or heavy sans-serif title, smaller light-gray body text
- Looks indistinguishable from a premium Canva product showcase template

## Out of scope
- Multiple screens or slides
- Slide navigation or presentation chrome
- Redesigning the VetTrack app UI itself
- Any interactivity (buttons, hover states, animations)

## Tasks
1. **Create the showcase component** — Build a single React component at `artifacts/mockup-sandbox/src/components/mockups/VetTrackShowcase/VetTrackShowcase.tsx`. Use a two-column layout: left column has a circular clipped phone mockup with an absolute-positioned organic SVG blob shape behind it in olive/taupe; right column has the bold title and body paragraph with bolded key words. Background is warm off-white/beige. Use the attached image `@assets/IMG_2431_1775453762257.jpg` as the phone mockup. All sizing in viewport units, no overflow.

2. **Embed on canvas** — Place the rendered component as an iframe shape on the workspace canvas at an appropriate position with no overlap with existing content.

## Relevant files
- `artifacts/mockup-sandbox/src/components/mockups/`
- `attached_assets/IMG_2431_1775453762257.jpg`
- `attached_assets/IMG_2435_1775453762258.jpg`
