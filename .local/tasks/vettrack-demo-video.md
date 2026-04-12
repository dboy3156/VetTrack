# VetTrack Animated Demo Video

## What & Why
Build an ~80-second animated motion graphics demo video for VetTrack, coded in React with Framer Motion. The video follows the 8-scene structure already defined in the `/demo-guide` page, using the exact overlay text and timing from that guide. This gives VetTrack a shareable, auto-playing product demo that plays in the browser without needing any screen recording or manual editing.

## Done looks like
- The video auto-plays at `/` (or a dedicated `/video` route) and loops seamlessly
- All 8 scenes are represented with their correct overlay text and approximate timing:
  - Scene 1 (0–7s): Equipment list scroll — "Where is the equipment?" / "No one knows who took it"
  - Scene 2 (7–20s): QR scan → check-out — "Scan. Assign. Done."
  - Scene 3 (20–32s): Equipment in use — "Now tracked. Fully accountable."
  - Scene 4 (32–47s): Issue reporting — "Clear issue reporting. No guesswork."
  - Scene 5 (47–57s): Alerts — "No missed problems. No duplicates."
  - Scene 6 (57–65s): My Equipment list — "Full accountability per shift"
  - Scene 7 (65–75s): Return flow — "Everything goes back"
  - Scene 8 (75–80s): Dashboard close — "Nothing gets lost."
- Each scene uses animated UI mockups or motion graphics representing the VetTrack app screens — not static screenshots
- The VetTrack teal/medical color palette is used throughout
- Text overlays appear and disappear at the correct timecodes per the guide
- The video is visually layered (background + midground + foreground) with continuous motion — not a slideshow
- Hard-cut transitions between scenes as specified in the guide
- Final scene fades to black (the only fade in the video)

## Out of scope
- Actual screen recording or video editing of real app footage
- Audio / voiceover / background music
- Exporting to an MP4 file (video plays in the browser only)
- Any interactive elements inside the video

## Tasks
1. **Creative direction & setup** — Establish the visual direction: VetTrack teal palette (`#0d9488` primary, white, dark slate background), geometric sans typography (e.g. Plus Jakarta Sans), and a "Tech Product / Clinical Precision" aesthetic. Define the motion system: clip-path reveals for scene transitions, spring entrances for foreground elements, drifting background shapes for continuous motion. Set up the video component structure using `useVideoPlayer` from `@/lib/video` with 8 scene durations matching the guide timings.

2. **Persistent background & midground layers** — Build the animated background and midground layers that live outside `AnimatePresence` and persist across all 8 scenes. These include: a continuously drifting teal gradient background, floating geometric shapes (circles, grid lines) that shift position per scene, and a persistent VetTrack logo mark in the corner.

3. **Scenes 1–4** — Build Scene1 through Scene4 as individual files in `src/components/video/video_scenes/`. Each scene renders a stylized animated mockup of the corresponding VetTrack screen (equipment list cards, QR scan animation, checkout status banner, issue dialog) with the correct overlay text appearing at the right moment. Each scene must have entrance and exit animations.

4. **Scenes 5–8** — Build Scene5 through Scene8. Scene5 shows the Alerts screen with an animated critical alert card. Scene6 shows the My Equipment list with animated equipment rows. Scene7 shows the return flow with a success toast animation. Scene8 is the closing dashboard shot with large bold "Nothing gets lost." text, ending with a fade to black.

5. **Assembly & validation** — Wire all 8 scenes into `VideoTemplate.tsx` with `AnimatePresence mode="popLayout"`. Run `bash scripts/validate-recording.sh` to confirm the recording lifecycle is wired correctly. Verify the video loops, all overlays appear at the correct times, and no scene looks like a static slide.

## Relevant files
- `src/pages/demo-guide.tsx`
- `.local/tasks/demo-video.md`
- `src/App.tsx`
- `src/components/layout.tsx`
- `index.html`
