# Settings Overhaul & App Cleanup

## What & Why
The Settings system has several issues: the Language selector does nothing (no i18n), sounds don't actually play, there's no brightness/dimmer control, and density changes have no visible CSS effect. Beyond settings, the Admin page contains "Smart Folders" that are purely placeholder UI with no real logic. This task fully implements the settings features that matter, removes fake ones, and ensures every visible control has a real effect.

## Done looks like
- Settings page has exactly these sections: Display (dark mode, display size, dimmer/brightness slider), Sound (master on/off, critical alerts on/off), Date & Time (time format, date format), Reset (with confirmation), Account (logout)
- Language & Input section is gone from both the Settings page and Quick Settings panel — it was never functional
- The brightness/dimmer slider (30–100%) visibly dims or brightens the entire app UI in real time
- "UI Density" is renamed to "Display Size" with options "Comfortable" and "Compact"; compact mode visibly reduces padding and spacing across the app
- Toggling Master Sound ON plays a short confirmation audio tone; toggling it OFF plays a short muted tone; the same applies to Critical Alerts toggle. Tones use the Web Audio API — no external audio files needed
- Critical alert sounds fire a distinct warning tone whenever an alert status is set on equipment (wired to the existing alert/status system)
- Quick Settings panel shows: Dark Mode, Display Size, Brightness slider, Master Sound, Critical Alerts — Language is removed
- Logout button on Settings page navigates the user to `/landing` and clears all persisted session state
- Smart Folders section in the Admin page is removed — it showed hardcoded placeholder data with no working configuration UI
- All setting labels use plain, direct language (no jargon)
- Every toggle and control has a visible, immediate effect when changed

## Out of scope
- Multi-language translation / i18n (the Language feature is being removed, not replaced)
- Server-side settings persistence (localStorage only)
- Real Clerk auth integration for logout (dev auth handles it via navigation)
- Adding new equipment workflow features

## Tasks
1. **Extend settings hook with brightness + remove language** — Add a `brightness` field (number, 30–100, default 100) to the `Settings` interface and `DEFAULT_SETTINGS`. Remove the `language` field entirely. Update `applySettings` to set `filter: brightness(N%)` on `document.body` (or the app root container) so the dimmer takes effect globally. Save and load the new field via the existing localStorage key.

2. **Implement real sound playback** — Create a `src/lib/sounds.ts` utility using the Web Audio API that exposes two functions: `playFeedbackTone()` (short, soft click — plays when any sound toggle is switched) and `playCriticalAlertTone()` (distinct multi-beep warning tone). Both functions respect the `soundEnabled` and `criticalAlertsSound` settings by checking the current settings context before playing. Wire `playFeedbackTone` to each Sound toggle's `onCheckedChange` handler. Wire `playCriticalAlertTone` to the point in the codebase where equipment status is set to "issue" or a critical alert fires.

3. **Rebuild the Settings page** — Rewrite `src/pages/settings.tsx` to reflect the new structure: Display section (dark mode toggle, Display Size select renamed from "UI Density", Brightness slider component), Sound section (Master Sound toggle, Critical Alerts toggle — each plays feedback tone on change), Date & Time section (time format, date format selects), Reset section (confirmation dialog), Account section (logout button). Remove the Language & Input section entirely. Ensure all labels are plain, short, and human-readable.

4. **Rebuild the Quick Settings panel** — Update the Quick Settings dropdown in `src/components/layout.tsx` to match the new structure: Dark Mode toggle, Display Size select, Brightness slider, Master Sound toggle, Critical Alerts toggle. Remove the Language selector. Ensure the panel reflects live settings state and changes apply instantly.

5. **Fix density CSS** — Audit `src/index.css` and key layout components to ensure the `data-density="compact"` attribute on `<html>` actually produces visible layout differences (reduced padding, tighter spacing on cards and list rows). Add explicit CSS rules scoped to `[data-density="compact"]` if they are missing or insufficient.

6. **Remove Smart Folders from Admin** — In `src/pages/admin.tsx`, remove the Smart Folders section (placeholder UI with hardcoded data and no working configuration). Clean up any related dead imports or helper code.

## Relevant files
- `src/hooks/use-settings.tsx`
- `src/pages/settings.tsx`
- `src/components/layout.tsx`
- `src/components/settings-controls.tsx`
- `src/pages/admin.tsx`
- `src/index.css`
