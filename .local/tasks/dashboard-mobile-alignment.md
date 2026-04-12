# Dashboard Mobile Alignment Fix

## What & Why
On narrow mobile screens, the dashboard header row (title + Refresh + Report buttons) crams everything into a single line. The action buttons get pushed to the very right edge of the screen, making the page feel misaligned compared to the card content below it. The layout needs to handle the constrained width gracefully.

## Done looks like
- On mobile, the Refresh and Report buttons are never clipped or jammed against the screen edge
- All page content (title, cards, lists) has consistent horizontal alignment with the surrounding layout padding
- On wider screens the header row layout is unchanged (title left, buttons right)
- No other pages or components are affected

## Out of scope
- Changing button labels or functionality
- Redesigning the dashboard layout beyond the header alignment fix
- Any other pages

## Tasks
1. **Responsive header layout** — Make the dashboard header row wrap gracefully on small screens: stack the action buttons below the title when the viewport is narrow (e.g. use `flex-wrap` or a breakpoint), so the buttons never overflow or press against the screen edge.

2. **Consistent content padding** — Audit the top-level container div inside the page for any padding or margin values that differ from the `px-4` applied by the Layout wrapper, and remove any duplicate or conflicting spacing that would cause items to shift relative to each other.

## Relevant files
- `src/pages/management-dashboard.tsx:70-107`
- `src/components/layout.tsx:239`
