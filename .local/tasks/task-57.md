---
title: VetTrack Mobile UI — Canvas Mockup
---
# VetTrack Mobile UI — Canvas Mockup

  ## What & Why

  Build an interactive mockup of the VetTrack mobile app on the canvas using the mockup-sandbox. The design follows a strict production-grade spec: a clean system-tool aesthetic (no "designed" look), locked component library, strict spacing/color system, and four frozen screens. The goal is a pixel-accurate, live-rendered preview of how the real app should look and behave on a mobile device.

  ## Done looks like

  - Four mobile-viewport iframes (390×844) on the canvas side by side: Dashboard, Equipment Details, QR Scanner, Alerts
  - All four screens share the same locked component library: Header, EquipmentCard (list row style, no shadow, bottom border only), StatusTag (single source of truth for available/in_use/cleaning/missing colors), Button (primary/secondary full-width), AlertItem (strong red), ScanButton (fixed bottom-right, identical on every screen)
  - Status color system is centralized — green/orange/blue/red — used only for meaning, never decorative
  - Spacing is strict: 8px / 16px / 24px only (p-2 / p-4 / p-6)
  - QR Scanner screen is full-bleed black with a centered scan frame and minimal UI
  - Equipment Details screen shows a settings-panel layout with stacked action buttons
  - Dashboard screen has search + equipment list rows + floating scan button
  - Alerts screen has a strong-red alert list + scan button
  - The mockup is fully self-contained (no backend calls) with realistic sample data

  ## Out of scope

  - Integration into the main app (that is a separate graduate task)
  - Backend data or auth — the mockup uses hardcoded realistic sample data
  - Accessibility or i18n work

  ## Tasks

  1. **Scaffold mockup-sandbox and shared component library** — Set up the sandbox, create the shared `_shared/` folder with the locked set of primitives (Header, EquipmentCard, StatusTag, Button, AlertItem, ScanButton) plus a centralized status color map. No screen-specific logic belongs here.

  2. **Build Dashboard screen** — Equipment list with search bar, EquipmentCard rows (full-width, bottom border, no shadow), and the floating ScanButton. Realistic sample data with mixed statuses.

  3. **Build Equipment Details screen** — StatusTag at the top, settings-panel structured info rows, stacked primary/secondary action buttons, and ScanButton. Shows a single piece of equipment with its full metadata.

  4. **Build QR Scanner screen** — Full-bleed black background, centered scan frame with corner brackets, minimal label text, and ScanButton. Static preview (no live camera needed in mockup).

  5. **Build Alerts screen** — Header + alert list using AlertItem (strong red interrupting style), and ScanButton. Realistic sample alert data.

  6. **Embed all four screens on the canvas** — Place iframes in a horizontal row at mobile viewport size (390×844) with 50px gutters. Use descriptive componentName labels.

  ## Relevant files

  - `attached_assets/Pasted-You-are-a-senior-frontend-engineer-building-a-productio_1775448560769.txt`