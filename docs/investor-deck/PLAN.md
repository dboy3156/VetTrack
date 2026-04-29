# Investor deck — implementation plan

## Current spec (post-rebuild v2)

- **14 slides** / language: title → problem (plain-English “system of record”) → **differentiation + competitor context** → thesis → **pillars with “vs market” lines** → **Ward View (hero)** → **audit & traceability** → Code Blue → meds → billing → equipment → engineering → traction → ask.
- **Differentiation:** Orchestration layer, **integration adapter base**, land **on top of** incumbent PIMS where relevant.
- **Audit:** **Immutable audit log** for defined critical actions + **operational histories** (e.g. scans / verification) — not literal “every HTTP page view” unless product adds that (deck wording is accurate to codebase audit types).
- **Screenshots:** `scripts/capture-investor-deck-screenshots.ts` captures **8 routes** when dev auth works.
- **COMPETITIVE_LANDSCAPE.md** — high-level market note with caveats.

## Compliance checklist

- [x] EN + HE aligned; RTL on HE.
- [x] Competitor names as **examples** with non-exhaustive disclaimer.
- [x] No fabricated revenue percentages on slides.
