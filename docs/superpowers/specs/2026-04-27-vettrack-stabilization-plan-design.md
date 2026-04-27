# VetTrack Stabilization, Completion & Growth Plan

**Date:** 2026-04-27  
**Sequence:** Option B — Value-first ordering  
**Scope:** 9 phases, executed sequentially with Phases 3, 5, 6 as ongoing background tracks

---

## Vision

Transform VetTrack from a feature-complete prototype into a production-grade veterinary hospital management platform — stable enough for real hospital use, extensible enough to integrate with external systems, and polished enough that staff trust it with critical workflows.

---

## Phase Sequence (Option B)

| # | Phase | Deliverable | Depends On |
|---|-------|-------------|-----------|
| 1 | Full Audit | Ranked P0–P4 action list with file:line refs | — |
| 2 | Active Patients Feature | Working feature + relational patient model | Audit findings |
| 3 | Close Open Ends | No dead buttons, no placeholder pages | Active Patients |
| 7 | Testing / CI | Green pipeline, zero unjustified skips | Open Ends closed |
| 6 | i18n Fix | Clean Hebrew + English on every screen | Tests passing |
| 8 | Mobile Optimization | Verified iPhone/Android, PWA solid | i18n clean |
| 9 | Missing / Deleted Users | Root cause + prevention + recovery | Audit findings |
| 4 | Sigal Integration Prep | Adapter layer + API contracts | Core stable |
| 5 | Cleanup / Bloat | Trimmed bundle, no dead code | All phases done |

Phases 3, 5, and 6 are also treated as ongoing background tracks — issues found during any phase are noted and fixed without waiting for the dedicated phase.

---

## Phase 1 — Full Audit

### Goal
Understand the entire system before touching it. Produce a single prioritized action list that all subsequent phases draw from.

### Audit Areas

| Area | Scope |
|------|-------|
| Frontend routes | Every route in `src/app/routes.tsx` — verify nav items match, no dead links, no 404 destinations |
| Backend APIs | Every file in `server/routes/` — missing handlers, unguarded endpoints, shadow routes, unused routes |
| Database schema | All migrations `migrations/*.sql` in order — FK integrity, nullable gaps, enum consistency, index coverage |
| Auth / users | Clerk integration in `server/middleware/`, webhook sync path, role guards, tenant isolation, `vt_users` consistency |
| Feature connections | Trace each frontend page to its API calls — broken wires, missing endpoints, stale API client methods |
| i18n | `src/i18n/` — missing translation keys, hardcoded strings, RTL layout gaps, number/date formatting |
| Test coverage | `tests/` and `src/**/*.test.*` — coverage per feature, skipped tests, tests that reference removed code |
| Performance | Bundle analysis, N+1 query patterns, missing DB indexes, unoptimized joins |
| Dead code | Unused imports, orphaned components, stale assets in `public/`, unused packages in `package.json` |
| Mobile / PWA | Viewport meta, touch targets, safe-area handling, keyboard overlay behavior, manifest validity |
| Existing bugs | TODO/FIXME comments, known broken flows from prior QA, console noise, unhandled promise rejections |

### Output Format

Each finding documented as:
```
[P0|P1|P2|P3|P4] file:line — description — risk: [low|medium|high] — effort: [XS|S|M|L]
```

Grouped by priority. P0 and P1 items fixed immediately within the audit sprint.

### Sprint Output Format (all phases)
1. What was found
2. What was changed
3. Why it matters
4. Risk level
5. Validation performed
6. Next sprint recommendation

---

## Phase 2 — Active Patients Feature Fix & Redesign

### Current Bug
Clicking "Active Patients" in navigation routes to the Tasks page instead of a patient list. Root cause TBD from audit — likely a route registration conflict in `src/app/routes.tsx`.

### Relational Patient Model

Patients are the central entity that all clinical workflows orbit. The existing `vt_animals` table provides the base. The redesign adds:

- **Hospitalization record** — admission date, expected discharge, ward/bay, admission reason, admitting vet
- **Status** — `admitted | observation | critical | recovering | discharged | deceased`
- **Patient ↔ Module links** — explicit FK or join table connecting `vt_animals` to: tasks, billing ledger, code blue events, inventory dispenses, shift handovers, medication records, appointments, notes

### Frontend Experience

**Patient List view:**
- All currently admitted patients in a card/table layout
- Filter by: status, ward, assigned vet, species
- Search by: patient name, owner name, chip/ID
- Quick-admit button (minimal required fields, rest filled later)
- Status badge per patient (color-coded: critical = red, recovering = green, etc.)

**Patient Detail view:**
- Header: name, species, breed, owner, admission date, assigned vet, status
- Tabbed sections: Overview | Tasks | Medications | Billing | Notes | Timeline
- Timeline shows all app events linked to this patient in chronological order
- "Discharge" action — sets status to `discharged`, prompts for discharge notes, soft-archives
- "Code Blue" action — launches code blue page pre-linked to this patient

**Admit Patient flow:**
- Minimal required: patient name, species, owner contact, admitting vet, reason
- Optional at admission: weight, age, existing conditions, assigned ward
- Creates hospitalization record, patient immediately visible in active list

### Data Model

```sql
-- Hospitalization records (new table)
vt_hospitalizations (
  id, tenant_id, animal_id FK vt_animals,
  admitted_at, discharged_at nullable,
  status ENUM(admitted|observation|critical|recovering|discharged|deceased),
  ward text nullable, bay text nullable,
  admission_reason text, admitting_vet_id FK vt_users,
  discharge_notes text nullable,
  created_at, updated_at
)

-- Existing tables gain hospitalization_id FK (nullable, for backward compat)
vt_tasks         → hospitalization_id nullable
vt_billing_ledger → hospitalization_id nullable (already has animal_id)
vt_code_blue_events → hospitalization_id nullable
```

### Soft Delete / Archive
Discharged patients remain in DB. The active list filters `WHERE discharged_at IS NULL`. A separate "Discharged" tab shows recent discharges. Medical history is never destroyed unless an admin explicitly triggers hard delete with confirmation.

---

## Phase 3 — Close All Open Ends

### Goal
No staff member should encounter a dead button, a placeholder page, or a broken form. Completeness signals trust.

### Methodology
1. Walk every route in the app
2. Click every button and link
3. Submit every form with valid and invalid data
4. Document: broken → fix inline; partial → complete; placeholder → build if it supports an active workflow, remove if it has no clear purpose

### Known open ends from prior QA
- "Auto Captured Charges" badge in billing-ledger always shows 0 in normal use (label mismatch)
- Leakage report missing bar chart (spec called for Recharts bar chart, only table built)
- Server TypeScript errors silent in normal dev builds (excluded from main tsconfig)

---

## Phase 7 — Testing / GitHub Quality Gate

### Goal
Zero failing tests. Zero unjustified skipped tests. Green CI on every push to main.

### Scope
- Unit tests: all utility functions, validation logic, API client methods
- Integration tests: all API routes with real DB (no mocks per project preference)
- E2E tests: critical user flows — admit patient, dispense medication, code blue, billing capture, shift handover
- CI checks: lint, typecheck, build, test — all must pass before merge to main

### Non-negotiables
- Integration tests hit real database (not mocks) — prior incident showed mock/prod divergence masks broken migrations
- Any skipped test must have a documented reason in the test file
- TypeScript strict mode enforced on both `src/` and `server/`

---

## Phase 6 — i18n Fix (Hebrew / English)

### Goal
Every string in the app is either in the translation system or is a proper noun. No screen mixes languages accidentally. RTL and LTR layouts both correct.

### Scope
- Audit all `src/pages/` and `src/components/` for hardcoded strings
- Verify every key in Hebrew translation file has an English counterpart and vice versa
- RTL: all flex directions, text alignment, icon mirroring, modal placement
- Dates: use locale-aware formatting throughout
- Numbers: currency (₪) formatting consistent
- Fallback: if a key is missing, fall back to English, log warning in dev

---

## Phase 8 — Mobile Optimization

### Goal
The app works excellently on iPhone Safari and modern Android. Staff use phones at the bedside.

### Scope
- Viewport: correct meta tag, no horizontal scroll
- Touch targets: minimum 44×44px on all interactive elements
- Safe areas: `env(safe-area-inset-*)` on bottom nav and fixed headers
- Keyboard overlay: forms scroll to show focused input, no content hidden behind keyboard
- PWA: manifest valid, icons correct, install prompt functional, offline fallback clean
- Test on: iPhone Safari (iOS 16+), Chrome Android, Samsung Internet

---

## Phase 9 — Missing / Deleted Users

### Goal
Understand why users disappear after registration. Recover data where possible. Prevent recurrence.

### Audit Path
1. Clerk webhook handler — does every `user.created` event successfully write to `vt_users`?
2. Race conditions — duplicate key conflicts on rapid webhook delivery?
3. Tenant assignment — do new users get assigned a tenant_id correctly?
4. Cascade deletes — does deleting a Clerk user cascade-delete `vt_users` row?
5. Cleanup jobs — any scheduled jobs that purge unverified users?
6. Soft delete — is there a `deleted_at` column being set unexpectedly?

### Deliverable
- Root cause documented
- Recovery script for affected users if data exists in Clerk but not in DB
- Prevention: idempotent webhook handler with explicit duplicate handling

---

## Phase 4 — Sigal Integration Preparation

### Goal
Create a modular adapter layer so VetTrack can sync with external veterinary software (Sigal) without hardcoding vendor details. The integration foundation is reusable for any future external system.

### Architecture

```
src/integrations/
  adapters/
    sigal/          ← Sigal-specific adapter (implements IntegrationAdapter interface)
    base/           ← Abstract IntegrationAdapter interface
  jobs/             ← BullMQ jobs: sync-patients, sync-inventory, sync-appointments
  webhooks/         ← Inbound webhook handlers from external systems
  mappers/          ← Transform external data shape → VetTrack internal shape
```

### Integration Points
- **Patient sync** — import/export patient records, map to `vt_animals` + `vt_hospitalizations`
- **Inventory sync** — map external stock levels to `vt_items` / `vt_containers`
- **Appointment sync** — map external schedule to `vt_appointments`
- **Billing export** — push `vt_billing_ledger` entries to external system
- **Credential handling** — stored in `vt_server_config` (encrypted), never in code
- **Retry pattern** — BullMQ with exponential backoff, dead letter queue for failures
- **Audit logging** — every sync operation logged to `vt_audit_logs`

### Constraints
- No Sigal-specific details hardcoded — all via config + adapter interface
- No sync runs without explicit enable flag per tenant
- All outbound calls HMAC-signed

---

## Phase 5 — Cleanup / Bloat Removal

### Goal
Smaller bundle, no dead code, no console noise. Runs as background track throughout all phases.

### Scope
- Unused imports and components (identified by TypeScript + ESLint)
- Stale assets in `public/` not referenced by any code
- Obsolete npm packages (audit with `npm ls`)
- Duplicate utility functions (identify via audit)
- Redundant state management (identify during Phase 2-3 work)
- Console.log noise removed or guarded by `import.meta.env.DEV`
- Bundle analysis: identify largest chunks, lazy-load non-critical routes

---

## Success Criteria

The plan is complete when:
1. Every P0 and P1 audit item is resolved
2. Active Patients feature is live and linked to all relevant modules
3. No dead buttons or placeholder pages remain
4. CI is green on every push
5. Every screen is clean in both Hebrew and English
6. App verified working on iPhone Safari and Android Chrome
7. User disappearance root cause understood and prevented
8. Integration adapter layer in place and documented
9. Bundle size reduced, no console noise in production
