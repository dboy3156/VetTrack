# Rebuild Demo Video — Agency Quality

## What & Why
The current animated demo at `/video` has several bugs and quality problems that make it look unfinished: the back button and VetTrack logo overlap each other in the top-left corner, scene transitions are instant hard cuts with zero animation (all exit animations are `opacity: 1` / `duration: 0`), there is no consistent motion system or custom typography, and Scene 4 has dead time at the end due to misaligned phase timers. The video-js skill should be used to rebuild this as a polished, agency-quality 90-second animated demo.

## Done looks like
- The back button no longer overlaps the VetTrack logo
- Scenes transition smoothly — crossfades, slides, or cinematic wipes between each of the 8 scenes
- A consistent visual identity: custom Google Font(s), a deliberate motion system, cohesive color palette that matches VetTrack's teal brand
- Each scene's phase timers are correctly aligned so no scene ends with dead/empty time
- The full 8-scene narrative plays through: problem → QR scan → checkout → issue report → alerts → my equipment → handoff → closing
- The video loops seamlessly after the final Scene 8 fade-to-black
- Overall feel is cinematic and product-demo quality — not "assembled from components"

## Out of scope
- Adding audio or music
- Changing the route path `/video` or the back-button link
- Modifying any page other than `src/pages/video.tsx`, `src/components/video/VideoTemplate.tsx`, and the 8 scene files

## Tasks
1. **Fix structural layout bug** — Move the VetTrack logo watermark in VideoTemplate so it does not overlap the back button from `video.tsx`. The back button should remain in `video.tsx`; the logo should shift right or be removed from VideoTemplate since the page already has the logo in the back-button area.
2. **Add scene transitions** — Replace all `exit={{ opacity: 1, transition: { duration: 0 } }}` patterns across the 8 scenes with smooth exit animations (crossfade, directional slide, or scale-out) and add matching `AnimatePresence` mode to `VideoTemplate`. Use the video-js skill to implement a coherent motion system.
3. **Upgrade visual identity** — Import 1-2 Google Fonts (e.g., `Plus Jakarta Sans` for display, `Inter` for body), apply them consistently across all scenes, and define a motion system (how elements enter, hold, exit) that is applied uniformly.
4. **Fix Scene 4 phase timing** — The last phase fires at 12 000ms but the scene duration is 15 000ms, leaving 3 seconds of a static state. Either add content for that time or adjust scene duration to match.
5. **Polish each scene** — Review every scene for layout, contrast, and legibility. Ensure the overlay text (hero quotes) never overlaps the phone mockup content, and that the phone mockup is sized appropriately on both wide and narrow screens.

## Relevant files
- `src/pages/video.tsx`
- `src/components/video/VideoTemplate.tsx`
- `src/components/video/video_scenes/Scene1.tsx`
- `src/components/video/video_scenes/Scene2.tsx`
- `src/components/video/video_scenes/Scene3.tsx`
- `src/components/video/video_scenes/Scene4.tsx`
- `src/components/video/video_scenes/Scene5.tsx`
- `src/components/video/video_scenes/Scene6.tsx`
- `src/components/video/video_scenes/Scene7.tsx`
- `src/components/video/video_scenes/Scene8.tsx`
- `src/lib/video/hooks.ts`
- `src/lib/video/index.ts`
- `.local/skills/video-js/SKILL.md`
