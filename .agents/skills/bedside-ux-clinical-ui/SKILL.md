---
name: bedside-ux-clinical-ui
description: Audits React bedside and ICU-adjacent UI for speed, clarity, minimal navigation, and tablet or glove-friendly targets in high-stress workflows (ward display, Code Blue, technician rounds). Use when reviewing Ward View, display or emergency takeover screens, RTL bedside layouts, contrast readability, or Tailwind/Radix components used in clinical contexts.
---

# Bedside UX & clinical UI

## Quick start

1. Read the ward display product spec: `docs/superpowers/specs/2026-04-27-ward-display-design.md`.
2. Walk the **critical path in under three taps** from entry to the primary action (acknowledge, administer, escalate).
3. Apply the checklist in [REFERENCE.md](REFERENCE.md) (touch targets, contrast, motion, RTL). For review tone and severity examples, see [EXAMPLES.md](EXAMPLES.md).
4. Prefer existing primitives from `src/components/ui/` and patterns from high-traffic pages (e.g. `src/pages/display.tsx`).

## Workflows

### A — Ward / floor display

- **Glanceability**: primary patient identifier and status visible without scrolling on common tablet breakpoints.
- **Mode swap**: ER / Code Blue transitions must not unload critical state or hide the active patient row without an obvious persistent indicator.

### B — Code Blue / takeover

- Full-screen or dominant overlay; **no nested menus** to reach cancel or escalate.
- Errors use plain language; retry must not clear clinical context.

### C — Tablet & bedside ergonomics

- Minimum interactive target **44×44 CSS px** where feasible; spacing scales with `gap-*` so gloved taps do not mis-hit.
- Avoid relying on hover-only affordances.

### D — i18n & RTL

- User-visible strings through `src/lib/i18n.ts` / locale JSON; layout uses logical properties (`ms-*`, `pe-*`, `flex` + `gap`) per project RTL rules.

## Tailwind / CSS standards

Authoritative token and utility guidance: [REFERENCE.md](REFERENCE.md) (clinical visibility, color semantics, reduced motion).

## Outputs

- Short **review note**: blocking vs nice-to-have, with component/file pointers and screenshot callouts if applicable.
