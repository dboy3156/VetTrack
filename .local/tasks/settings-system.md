# Settings System & Quick Settings Panel

## What & Why
Build a centralized Settings system for VetTrack with two surfaces: a full Settings page for complete configuration, and a Quick Settings panel accessible from the top bar for instant in-shift adjustments. All settings share a single source of truth persisted to localStorage so they survive page refreshes without a server round-trip.

## Done looks like
- A settings icon appears in the top bar that opens a compact Quick Settings panel (not a full page)
- Quick Settings panel has large, easy-to-tap toggles for: dark/light mode, UI density, master sound on/off, and critical alerts sound on/off
- A full Settings page is accessible at `/settings` (and linked from the slide-down menu) with all sections: Display, Sound, Language & Input, Date & Time, Reset, and Logout
- Dark mode toggles a `dark` class on `<html>` and the entire UI responds correctly
- UI density (compact / comfortable) adjusts spacing/padding visually throughout the app
- All changes apply instantly — no save button needed
- Quick Settings and full Settings page always reflect the same values; changing one updates the other immediately
- "Reset to defaults" in the full Settings page shows a confirmation before resetting
- Logout is clearly accessible in the full Settings page

## Out of scope
- Server-side settings persistence (localStorage only for now)
- Role-based settings visibility beyond what is described
- Language switching with actual i18n/translation (UI shows the selector but locale switching is light-touch; date/time format uses the selected preference)
- Sound file playback implementation (toggles control the preference state; actual audio wiring is a future task)

## Tasks
1. **Settings context & hook** — Create `src/hooks/use-settings.tsx` with a React context that holds all settings state (darkMode, density, soundEnabled, criticalAlertsSound, language, timeFormat, dateFormat), persists to localStorage under a single key, and exposes typed getters and setters. Apply the `dark` class to `document.documentElement` and a density data-attribute whenever the relevant settings change.

2. **Reusable settings primitives** — Create `src/components/settings-controls.tsx` with small, reusable components used by both surfaces: `SettingsToggle` (labeled toggle row with icon), `SettingsSelect` (labeled dropdown row), and `SettingsSectionHeader` (section label/divider). Make controls large enough for high-pressure clinical use.

3. **Quick Settings panel** — Add a settings gear icon button to the top bar in `src/components/layout.tsx`. Clicking it opens a small dropdown panel (using the existing `sheet` or a positioned div) containing the five quick controls: dark/light mode, density, master sound, critical alerts sound, and language. The panel closes on outside click or pressing the icon again.

4. **Full Settings page** — Create `src/pages/settings.tsx` using the `Layout` wrapper and the reusable primitives. Render all sections in order: Display, Sound, Language & Input, Date & Time, Reset (with confirmation dialog using the existing `alert-dialog` component), and Account (logout button). Add the route `/settings` to `src/App.tsx` and a "Settings" entry to the slide-down nav menu in `src/components/layout.tsx`.

5. **Dark mode & density integration** — Update `tailwind.config` to enable `darkMode: 'class'`. Add `dark:` variants to the key layout surfaces (`layout.tsx`, top bar, bottom nav, `Card`, backgrounds) so dark mode is visible across the whole app. Apply the density data-attribute from the settings context to adjust padding/spacing on list items and cards.

## Relevant files
- `src/components/layout.tsx`
- `src/App.tsx`
- `src/hooks/use-auth.tsx`
- `src/hooks/use-sync.tsx`
- `src/components/ui/sheet.tsx`
- `src/components/ui/alert-dialog.tsx`
- `src/components/ui/select.tsx`
- `src/index.css`
