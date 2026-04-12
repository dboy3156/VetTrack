# VetTrack Demo Video Recording Guide

## What & Why
Produce a complete, ready-to-use recording and editing guide for a 60–90 second VetTrack demo video. The guide covers exactly what to tap in the real app (in order), what text overlays to show, and how to cut/time the final edit. This replaces any animated simulation — all footage comes from the real running app.

## Done looks like
- A structured recording plan document delivered as a readable in-app page or exported markdown
- Every scene specifies exact screen, exact tap target, and any data to have pre-loaded
- Text overlay copy and timing is specified per scene (no guesswork for the editor)
- Editing instructions describe cut points, trim guidelines, and overlay placement
- The guide assumes realistic demo data: "IV Pump #3", "Monitor #2", rooms like ICU / Room 4 / Surgery
- A reviewer can hand this to any team member and they can record the video without further explanation

## Out of scope
- Actual video recording or editing (this is the guide, not the final video)
- Animated or simulated screens
- Voiceover script

## Tasks
1. **Seed realistic demo data** — Ensure the app has the right demo data pre-loaded for recording: equipment items (IV Pump #3, Monitor #2, Cardiac Monitor, Ventilator #1), rooms (ICU, Room 4, Surgery), and at least one active alert and one checked-out item assigned to the demo user.

2. **Produce the recording plan document** — Write a scene-by-scene recording plan as an in-app page (e.g. `/demo-guide`) or a clearly formatted exported file. Each scene includes: screen to be on, exact element to tap, any input to type, and what the result should look like on screen.

3. **Specify text overlays and timing** — For each scene, document the exact overlay copy, the second it appears, and how long it stays on screen. Match the script from the attached prompt exactly (e.g. "Scan. Assign. Done." at ~12s).

4. **Write editing instructions** — Provide cut and trim guidelines per scene: where to cut dead time, maximum duration per scene, transition style (hard cut preferred), and where to add highlight circles on taps.

## Relevant files
- `attached_assets/Pasted-You-are-a-product-marketing-expert-Your-task-is-to-crea_1775374253411.txt`
- `attached_assets/Pasted-Here-is-your-idea-translated-into-a-clean-execution-rea_1775373836188.txt`
- `src/App.tsx`
- `src/pages/equipment-detail.tsx`
- `src/pages/my-equipment.tsx`
- `src/pages/alerts.tsx`
- `server/routes/equipment.ts`
