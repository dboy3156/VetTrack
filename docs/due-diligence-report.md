# VetTrack — Raise Readiness Tracker

**Purpose:** Internal living document. Tracks progress from current state → Serious Seed Candidate.  
**Last updated:** 2026-04-25 (sprint complete)  
**Owner:** Founder / CTO

---

## Raise Readiness Score

```
Security & Legal    [█████████░]  90%   Gate: ALMOST
Architecture        [████████░░]  80%   Gate: PARTIAL
Commercial          [███░░░░░░░]  33%   Gate: OPEN

Overall Raise Readiness:  70 / 100  ◄ "Credible early stage — schedule follow-up"
```

**To reach "Serious Seed Candidate" (≥75):** Close Gates 1 + 2. Gate 3 (commercial) requires a pilot.

> Score methodology: Gate 1 = 40 pts, Gate 2 = 30 pts, Gate 3 = 30 pts.  
> Score updates as items are checked off.

---

## Gate 1 — Security & Legal (40 pts)

> Investors will not write a check if any of these are open. One clinical data breach or liability event ends the company.

**Current gate score: 36 / 40**

| # | Item | Effort | Impact | Status |
|---|------|--------|--------|--------|
| 1.1 | `/api/medication-tasks` — all routes authenticated | XS | 🔴 Critical | ✅ Done — `requireAuth` + `requireEffectiveRole("technician")` applied |
| 1.2 | `/api/stability` — admin routes authenticated | XS | 🔴 Critical | ✅ Done — `requireAuth` + `requireEffectiveRole("admin")` applied |
| 1.3 | Test credentials removed from `AGENTS.md` | XS | 🔴 Critical | ✅ Done — credentials moved to password manager reference |
| 1.4 | Production Clerk keys removed from git history | S | 🔴 Critical | ⬜ Open — run `git filter-repo` on any commit that contained `pk_live_*`/`sk_live_*` and rotate keys |
| 1.5 | `SESSION_SECRET` rotated (was committed in `.env.example`) | XS | 🟠 High | ⬜ Open — generate new secret, update Railway env var |
| 1.6 | `x-stability-token` bypass scoped to internal-only | S | 🟠 High | ✅ Done — `NODE_ENV=production` loopback guard added in `server/middleware/auth.ts`; external IPs get 403 in production. Confirm `STABILITY_TOKEN` env var is not set in Railway prod (ops runbook). |
| 1.7 | `ssl: { rejectUnauthorized: false }` reviewed | XS | 🟡 Medium | ⬜ Open — intentional for Railway Postgres (self-signed cert). Acceptable for Railway; document it. Add `DB_SSL_REJECT_UNAUTHORIZED` env var to allow opt-in enforcement when switching providers. |
| 1.8 | `validateUuid` actually validates UUID format | XS | 🟡 Medium | ✅ Done — regex `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i` added |

---

## Gate 2 — Architecture & Technical DD (30 pts)

> A competent technical investor will probe these. Each open item is a conversation stopper or a valuation haircut.

**Current gate score: 24 / 30**

| # | Item | Effort | Impact | Status |
|---|------|--------|--------|--------|
| 2.1 | `vt_rooms.name` uniqueness fixed to per-clinic | XS | 🟠 High | ✅ Done — migration 063 + `db.ts` updated to `UNIQUE (clinic_id, name)` |
| 2.2 | FK constraints from all tenant tables to `vt_clinics` | L | 🔴 Critical | ✅ Partial — migration 065 adds `ON DELETE RESTRICT` FKs for 6 core tables (users, equipment, appointments, billing_ledger, inventory_jobs, rooms). ~34 secondary tables still open. |
| 2.3 | Dual migration systems consolidated | M | 🟠 High | ✅ Done — `pnpm db:migrate` and `pnpm migrate` both run `tsx scripts/run-migrations.ts`. Drizzle Kit retained for `generate` only. Documented in `docs/migrations.md`. |
| 2.4 | Two parallel medication-task models resolved | M | 🟠 High | ⬜ Open — `vt_medication_tasks` table and `vt_appointments` with `task_type='medication'` both in flight. Complete the migration or officially shelve it. |
| 2.5 | `appointments.service.ts` split (currently 62K) | M | 🟡 Medium | ⬜ Open — God class. Splits into: `scheduling.service.ts`, `medication-task.service.ts`, `task-lifecycle.service.ts`. Reduces bug surface, improves readability for DD. |
| 2.6 | `vt_inventory_jobs` operator UI | M | 🟠 High | ✅ Done — `/billing/inventory-jobs` page shipped: status filter tabs, retry button, 30s auto-refresh. Accessible from Billing Ledger header. |
| 2.7 | Hardcoded Hebrew in service worker + workers | S | 🟡 Medium | ✅ Partial — push notification worker localised via `preferred_locale` + `push.overdue.*` i18n keys (en + he). `sw.js` and `expiryCheckWorker.ts` still contain Hebrew strings. |
| 2.8 | Per-clinic secrets out of `vt_server_config` DB table | M | 🟡 Medium | ⬜ Open — SMTP creds, webhook URLs/secrets stored in DB. DB compromise yields all clinic credentials. Use Railway env injection or Secrets Manager. |

---

## Gate 3 — Commercial Validation (30 pts)

> No amount of engineering quality substitutes for a paying customer. This is purely sales motion.

**Current gate score: 10 / 30**

| # | Item | Effort | Impact | Status |
|---|------|--------|--------|--------|
| 3.1 | One signed pilot clinic (even $200/month) | Sales | 🔴 Critical | ⬜ Open — no revenue signal in repository. Product is technically capable of supporting a live pilot post security fixes. |
| 3.2 | Pilot outcome documented (before/after, what they pay and why) | S | 🔴 Critical | ⬜ Open — requires 3.1 first. Becomes the pitch deck anchor. |
| 3.3 | ICP articulated explicitly in writing | XS | 🟠 High | ⬜ Open — Hebrew locale + Israeli admin email suggests Israeli emergency vet clinics as initial segment. Needs to be explicit, not inferred. |
| 3.4 | i18n threaded through push notification handlers | S | 🟡 Medium | ✅ Partial — overdue-reminder push notifications now localised per `preferred_locale`. Service worker offline messages still in Hebrew. |
| 3.5 | Stripe or equivalent integrated | M | 🟡 Medium | ⬜ Open — billing ledger infrastructure exists. Webhook HMAC is in place. No payment processor. |

---

## Investor Objection Map

---

### "Is the clinical data secure?"

**Current answer:** Mostly yes. Auth is on all sensitive routes. Clerk handles identity. Audit logs are immutable. Rate limiting, Helmet, CORS in place.

**Gaps that remain open:**
- SSL cert verification disabled for production Postgres (acceptable for Railway, needs documentation)
- `x-stability-token` bypass exists but defaults to random-per-boot if env var not set — confirm it is not set in Railway prod
- Git history scrub needed for any historical Clerk key commits

**What closes it:** Items 1.4–1.7. Two days of work.

**Status:** 🟡 Partial

---

### "Is the multi-tenancy safe? Can Clinic A see Clinic B's data?"

**Current answer:** Application-layer enforcement on all queries (`WHERE clinic_id = ?`), now backed by DB-level `ON DELETE RESTRICT` FK constraints on the 6 core tables (users, equipment, appointments, billing_ledger, inventory_jobs, rooms). ~34 secondary tables still application-layer only.

**What closes it:** Remaining FK migrations for secondary tables (containers, inventory_items, shifts, etc.). Each is low-risk given the orphan-safety DO blocks pattern established in migration 065.

**Status:** 🟡 Partial — 6/~40 tables FK'd

---

### "What happens when medication inventory deductions fail?"

**Current answer:** Failed BullMQ jobs are surfaced in the `/billing/inventory-jobs` operator page — status filter tabs (failed/pending/processing/resolved), failure reason column, one-click retry button, 30-second auto-refresh. Pharmacists can investigate and retry without DB access.

**What closes it:** Already closed. Nothing more needed for investor DD.

**Status:** 🟢 Closed

---

### "Is the offline-first architecture defensible?"

**Current answer:** Yes. This is the strongest technical moat in the product. Service worker v7 with documented production scar tissue (survived a v6 self-destruct incident). Dexie sync engine with jittered backoff, circuit breaker, conflict resolution. BullMQ recovery scheduler. In a 4am code blue when the clinic's internet drops — this product keeps working. Every major competitor's SaaS stops.

**What closes it:** Already closed. Nothing to do here except demo it.

**Status:** 🟢 Strong

---

### "How do you scale to multiple hospitals?"

**Current answer:** Schema is multi-tenant from day one. Every table has `clinic_id`. Auth re-resolves clinic membership per request. Room names are now correctly scoped per-clinic (fixed 2026-04-25). Pharmacy formulary, forecast pipeline, and medication tasks are already per-clinic. No FK at DB level yet.

**What closes it:** Item 2.2 (FK constraints), item 2.3 (single migration system), item 2.4 (single medication-task model).

**Status:** 🟡 Partial

---

### "Do you have customers? Is anyone paying?"

**Current answer:** No visible revenue, no paying customers, no Stripe integration.

**What closes it:** Item 3.1 — one signed pilot clinic. This is sales motion, not engineering.

**Status:** 🔴 Open — hardest gate, most important to close.

---

## 90-Day Critical Path

### Days 1–7: Eliminate remaining liability

- [ ] 1.4 — Run `git filter-repo` to scrub any historical Clerk key commits. Rotate all Clerk production keys.
- [ ] 1.5 — Rotate `SESSION_SECRET` in Railway prod env.
- [x] 1.6 — `NODE_ENV=production` loopback guard added. Confirm `STABILITY_TOKEN` not set in Railway prod (ops runbook).
- [x] 2.3 — Single migration system: `tsx scripts/run-migrations.ts`. Documented in `docs/migrations.md`.

### Days 8–30: Close structural gaps

- [x] 2.2 — FK constraints added for 6 core tables (migration 065). Remaining ~34 tables still open.
- [ ] 2.4 — Complete or officially shelve the `vt_medication_tasks` / `vt_appointments` migration.
- [x] 2.6 — `/billing/inventory-jobs` operator UI shipped.
- [x] 2.7 — Push notification worker localised. `sw.js` / `expiryCheckWorker.ts` still open.
- [ ] 3.3 — Write down the ICP explicitly. One paragraph. Commit it.

### Days 30–90: Commercial traction

- [ ] 3.1 — Sign one paying pilot clinic. $200–$500/month. This is the single most important thing.
- [ ] 3.2 — Document the pilot: workflow adopted, before/after, what they pay and why.
- [ ] 3.5 — Integrate Stripe (or equivalent) for managed billing.
- [ ] 2.5 — Split `appointments.service.ts` (signals engineering discipline to technical DD reviewers).

---

## What to Say in the Meeting

### Lead with (don't wait for them to ask)

- "TypeScript strict mode, zero `@ts-ignore` across 250+ files" — real engineering discipline.
- "Offline-first for emergency vet clinics — we survive a 4am internet outage, every SaaS competitor doesn't."
- "Multi-tenancy from day one — every table is clinic-scoped, every query filters by it."
- "BullMQ job queue with dead-letter, idempotency, circuit breakers — medication inventory deductions are async-safe and recoverable."
- "73 test files covering auth hardening, multi-tenancy, RBAC, sync engine, forecast pipeline."
- "Pharmacy forecast PDF parsing — bespoke clinical pipeline competitors will take months to reverse-engineer."

### Don't volunteer (answer honestly if asked)

- Dual migration systems → "We run raw SQL migrations via a custom runner."
- Parallel medication-task models → "We're mid-migration to a unified appointments model."
- `rejectUnauthorized: false` for Postgres → "Railway Postgres uses a self-signed cert; it's a known Railway deployment pattern."

### If they probe hard

**"Multi-tenancy at the DB level?"**  
"Six core tables now have `ON DELETE RESTRICT` FK constraints to `vt_clinics`. All queries enforce `clinic_id`. Remaining secondary tables are on the Q3 roadmap before we scale beyond 5 clinics."

**"Do you have paying customers?"**  
Don't invent a number. "We're in active pilot conversations. The product is deployed and technically capable of supporting a live clinic today."

**"How much AI was used to build this?"**  
"AI pair-programming throughout — same as every serious engineering team in 2026. Every architectural decision, every security design, every clinical workflow was founder-driven."

---

## Reasons to Raise (Genuine Strengths)

1. TypeScript strict mode, zero `@ts-ignore`, 2 `any` across 250+ files — engineering character.
2. Offline-first emergency vet workflow — category-defining insight with 7 service worker versions of production scar tissue.
3. Idempotency in the data model — billing ledger, medication tasks, pharmacy forecasts all idempotent by design.
4. BullMQ queue: DLQ + per-clinic rate limiting + circuit breaker + graceful SIGTERM + worker heartbeat.
5. 73 test files at pre-seed — unusual depth.
6. Pharmacy forecast PDF parsing — a genuine clinical moat.
7. NFC integration — physical switching cost once deployed.
8. 41-table schema — genuine operational surface area across the clinical workflow.
9. The stabilization arc — phase-named test files signal a founder who sees and fixes their own technical debt.

---

## Score History

| Date | Gate 1 | Gate 2 | Gate 3 | Total | Change | Note |
|------|--------|--------|--------|-------|--------|------|
| 2026-04-25 | 32/40 | 12/30 | 6/30 | **47** | Baseline | Auth gaps closed pre-audit. validateUuid + rooms unique + credentials fixed in today's cleanup. |
| 2026-04-25 | 36/40 | 24/30 | 10/30 | **70** | +23 | Security sprint + engineering sprint complete: loopback guard, migration consolidation, inventory-jobs UI, push i18n, FK constraints on 6 core tables. |

---

*Internal use only. Do not share with investors until Gate 1 is fully closed (score ≥ 40/40).*
