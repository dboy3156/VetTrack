# VetTrack — Investment Due Diligence Report

**Date**: 2026-04-25  
**Auditor**: Technical Investor (AI-assisted)  
**Scope**: Full codebase static analysis + architecture review  
**Branch**: `claude/vettrack-due-diligence-xigcc`

---

## PHASE 1 — Investment Lens Audit

### A. Founder Signal

This does not look like a hobbyist codebase. The choices signal real engineering judgment: TypeScript strict mode across 250+ files with exactly **2 `any` annotations and zero `@ts-ignore`s**; a sync engine with jittered backoff, circuit breakers, and conflict surfaces; BullMQ workers with DLQ, idempotency, heartbeat TTLs, and graceful SIGTERM shutdown; Drizzle partial unique indexes used correctly for clinical invariants (one active medication task per animal/drug/route, soft-delete-aware formulary uniqueness). These patterns require deliberate thinking. A hobbyist would not build them.

That said, the founder signal is mixed. The same codebase that has a sophisticated sync engine also has production Clerk keys committed to a markdown file, a 2,143-line route handler, and a folder of empty shell typos (`tsx`, `vettrack@1.1.0`) at the repo root. The presence of both a 25KB `.cursorrules` file and a `CHATGPT_PROJECT_INSTRUCTIONS.md` raises a legitimate question: how much of the architectural sophistication did the founder drive versus how much was AI-generated and accepted without full understanding? That question cannot be answered from the code alone, but it is the right question to ask at a technical interview.

The codebase also shows a "stabilization" arc — phase-named test files (phase-1 through phase-7) and a `VETTRACK_MASTER_STABILIZATION_PLAN.md` in the docs folder. This suggests the founder built fast, made a mess, recognized it, and started fixing it systematically. That is more investable than a founder who doesn't recognize the mess.

**Verdict**: Above-average founder signal with a real execution inconsistency gap.

---

### B. Product Defensibility

The product goes significantly deeper than typical vet SaaS:

- **Pharmacy forecast PDF parsing** (`server/routes/forecast.ts`, 1,058 lines): ingests clinic pharmacy delivery PDFs, extracts drug quantities, deduplicates via content hash, surfaces exclusion rules, routes to approval workflow. This is bespoke clinical logic competitors don't have.
- **Medication calculator with RBAC** (`shared/medication-calculator-rbac.ts`): dose calculations with species/weight/route constraints and a separate vet-approval pathway. This is not CRUD.
- **Offline-first for emergency clinics**: hand-rolled service worker (v7, 273 lines of documented production scar tissue), Dexie sync engine with conflict resolution and circuit breaker. The most defensible feature in the product — internet reliability in emergencies is a real unsolved pain, and this takes months to do correctly.
- **NFC scanning integration**: physical clinical workflow, not just software. Equipment checkout, return, plug-alert chains tied to billing.
- **Shift handover workflow** with consumables report, pending emergencies, discharge summary — operational depth competitors will under-invest in.
- **41-table schema** covering animals, owners, appointments, medication tasks, drug formulary, pharmacy orders, equipment, rooms, billing ledger, inventory containers, purchase orders, shifts, audit logs, push subscriptions. This is genuine operational surface area.

The formulary, pharmacy forecast, and offline engine constitute a meaningful moat. The rest (equipment tracking, billing) is less defensible but adds switching cost.

---

### C. Engineering Quality

**Strong:**
- TypeScript discipline is elite for a solo founder.
- Test surface is broad: 73 files spanning auth hardening, multi-tenancy, RBAC, sync, queue workers, forecast pipeline, PWA, migration integrity, error contract enforcement.
- CI enforces typecheck, build, migration run, and vitest on every PR.
- Queue design is production-grade: circuit breakers, rate limiting (200/min/clinic notifications, 50/min/clinic automation), no-throw producers that degrade gracefully when Redis is down.
- Auth model correctly re-resolves role from DB every request; `onConflictDoUpdate` explicitly excludes the role column so Clerk claims cannot elevate a demoted user.
- Idempotency at the data layer: billing ledger has a UNIQUE `idempotencyKey`, inventory logs have a UNIQUE `(taskId, clinicId, logType)`, medication tasks enforce one-active-task-per-(animal, drug, route) via partial unique index.

**Weak:**
- `equipment.ts` is 2,143 lines. `admin.tsx` is 2,296 lines. `appointments.tsx` is 1,697 lines. God-file concentration is high.
- Entire database schema in one 745-line file (`server/db.ts`) with no FK from any tenant table to `vt_clinics`. Multi-tenancy is purely application-layer.
- Two parallel migration systems (Drizzle journal vs raw SQL runner) with duplicate-numbered files (016, 019, 021 each appear twice).
- Two parallel medication-task models in flight simultaneously (`vt_medication_tasks` table and `vt_appointments` with `task_type='medication'`).
- Production runs untranspiled TypeScript via `tsx` in the `start` script.
- `validateUuid` middleware (`server/middleware/validate.ts`) only checks that the param is non-empty. It does not validate UUID format.

---

### D. Execution Risk

**Critical (require immediate remediation before any customer can go live):**

1. **`/api/medication-tasks` routes have no `requireAuth` middleware.** `router.post("/")`, `router.post("/:id/take")`, `router.post("/:id/complete")`, `router.get("/")` — all unauthenticated. In a clinical system where medication tasks carry patient weight, drug, dose, and route data, this is a regulatory and liability exposure, not just a security bug.

2. **`/api/stability` admin routes are unauthenticated.** `POST /run` (triggers a diagnostic pass), `DELETE /logs`, `GET /results`, `GET /logs`, `GET /status` — all callable without auth in production.

3. **Production Clerk keys (`pk_live_*`/`sk_live_*`) committed in `AGENTS.md`**, bound to `clerk.vettrack.uk`. A real test credential is also committed (`AGENTS.md`). The `.env.example` contains what appears to be a real, high-entropy `SESSION_SECRET`, real Sentry DSN, and a real personal admin email. These require key rotation and git history scrubbing.

4. **`x-stability-token` header bypass**: any request with this single env-supplied value is instantly granted admin access without Clerk.

**Structural (high blast radius, fixable but non-trivial):**

5. **No database FK from tenant tables to `vt_clinics`.** Every query relies on application-layer `WHERE clinicId = ?`. One missing filter is a tenant data leak.

6. **`vt_rooms.name UNIQUE` is globally scoped**, not per-clinic. Two different hospitals cannot have a room named "ICU". Multi-tenancy correctness bug.

7. **Dual migration systems with colliding numbered files** (016, 019, 021 appear twice). CI uses raw SQL path; `pnpm db:migrate` uses Drizzle journal. These will diverge.

8. **Runtime secrets (SMTP credentials, billing webhook URLs/secrets) stored in `vt_server_config` DB table.** DB compromise yields all per-clinic credentials.

**Operational:**

9. Repo root contains: empty files (`tsx`, `vettrack@1.1.0`, `test-trigger.txt`), typo duplicates (`.nvmrc`/`.nvrmc`, `node-version`/`node-version_`), committed PR scratch files (`.pr-body-temp.txt`, `.pr-phase3.md`), a `tmp-senior-overdue-test.ts` script, and an unrelated PyQt6 desktop disk-cleaner app under `desktop/cleaner/`.

10. Public README is one line: `# Vet-track-`. Internal `replit.md` references a table that doesn't exist (`vt_alert_acknowledgments`), an old role name (viewer → student), and SW v5 while the code is v7.

---

### E. Commercial Potential

Veterinary SaaS is a real, underpenetrated vertical. The competitive landscape (ezyVet, Provet, Cornerstone, ImproMed) is dominated by legacy desktop software with poor UX and no offline-first posture. Emergency clinics in particular have an unmet need: they cannot tolerate internet-dependent workflows during multi-hour critical cases.

The product structure supports B2B pricing at the clinic level. The billing ledger with idempotency and webhook infrastructure suggests monetization architecture is partially ready. The pharmacy forecast pipeline (PDF ingestion → approval workflow → order generation) is the kind of workflow that justifies a meaningful per-clinic monthly fee because it directly reduces drug waste and over-ordering.

The Hebrew locale and Israeli admin email suggest this is being built for (or by someone operating within) the Israeli market first. That is a coherent GTM wedge — Israeli emergency vet clinics as a tight initial segment — but it needs to be confirmed as intentional, not accidental.

There is no evidence in the repository of paying customers, signed pilots, or revenue.

---

## PHASE 2 — Brutal Scoring

| # | Category | Score | Rationale |
|---|---|---|---|
| 1 | **Founder Quality Signal** | **7/10** | TypeScript discipline is elite, architectural patterns (circuit breakers, idempotency, DLQ) are real. Penalized for committed secrets, god-files, dual migrations, and heavy AI-augmentation raising "does founder actually understand this" questions. |
| 2 | **Product Potential** | **7/10** | Genuine clinical depth. Pharmacy forecast, offline engine, medication calculator, NFC integration, shift handover — not a CRUD app. No paying customers visible in repo, which caps the score. |
| 3 | **Engineering Quality** | **5/10** | TypeScript discipline is a genuine bright spot. Unauthenticated medication-tasks endpoint, committed production secrets, application-layer multi-tenancy, and dual migration systems are hard pulls down. |
| 4 | **Market Credibility** | **4/10** | Vet SaaS is real. But: no customer evidence, no revenue signal, solo founder with no team, and a Hebrew-locale-first product that may have limited international GTM without localization investment. |
| 5 | **Scale Readiness** | **4/10** | Queue workers, Redis, PostgreSQL, Railway deployment suggest architectural intent. But app-layer multi-tenancy is fragile at scale, god-files increase bug density, and production running untranspiled TS adds fragility. |
| 6 | **Investability Today** | **3/10** | Cannot write a check with unauthenticated medication routes and committed production secrets in a clinical SaaS. The signal is there; the execution is not ready. |

---

## PHASE 3 — Red Flags

Every item below is specific and sourced from the codebase.

**Security / Legal Liability:**

1. **`/api/medication-tasks` has zero authentication.** `router.post("/")`, `router.post("/:id/take")`, `router.post("/:id/complete")`, `router.get("/")` — unauthenticated in production. In a clinical context touching patient medication records, this is a liability event waiting to happen, not a bug to fix in the next sprint.

2. **`/api/stability` admin diagnostic endpoints are unauthenticated.** `POST /run`, `DELETE /logs`, `GET /results` are all callable without credentials. Someone can delete audit trail data in production today with a single curl.

3. **Production Clerk keys committed in `AGENTS.md`** (`pk_live_*`/`sk_live_*` bound to `clerk.vettrack.uk`). If this repo is or ever was public, those keys are compromised. History scrub + rotation required before any DD.

4. **Real test credentials committed** in `AGENTS.md`. If this maps to a clinic with any real data, it is a data breach.

5. **`.env.example` contains what appear to be real secrets**: a 128-character base64 `SESSION_SECRET`, real Sentry DSN, real admin email, VAPID public key. The secret scanner in `scripts/scan-secrets.ts` explicitly excludes `.env.example`, which is why these were not caught.

6. **`x-stability-token` header grants full admin access without Clerk.** A single leaked env var bypasses the entire auth stack.

7. **`ssl: { rejectUnauthorized: false }` for production Postgres.** Accepts any certificate.

**Multi-tenancy:**

8. **No FK from any tenant table to `vt_clinics`.** 40 tables with `clinicId` columns that have no DB-level referential integrity. One missed `WHERE clinicId = ?` anywhere in 33 route files is a cross-clinic data leak.

9. **`vt_rooms.name` has a globally unique constraint, not per-clinic.** The second hospital customer cannot create a room named "ICU".

**Architecture:**

10. **Dual migration systems with duplicate-numbered files.** 016, 019, and 021 each appear twice in `migrations/`. CI uses `scripts/run-migrations.ts` (raw SQL). `pnpm db:migrate` uses Drizzle's journal. These will diverge.

11. **Two parallel medication-task models in flight.** `vt_medication_tasks` and `vt_appointments` with `task_type='medication'` both exist. In-progress migration is a dual-write surface with no completion signal.

12. **`validateUuid` middleware does not validate UUIDs.** Only checks non-empty string. Every parameterized route that calls `requireValidUuid` believes it is validating format but is not.

**Business:**

13. **Zero evidence of paying customers or revenue.** No Stripe integration, no customer IDs, no invoice records.

14. **Solo founder with no team.** Single point of failure on every dimension: technical, sales, support, domain knowledge.

15. **Documentation written for AI agents.** `replit.md`, `.cursorrules` (25KB), `CHATGPT_PROJECT_INSTRUCTIONS.md` — primary documentation is prompts for LLMs. Internal docs are already stale (wrong table names, wrong role names, wrong SW version).

16. **Unrelated desktop PyQt6 app committed to the same repo** under `desktop/cleaner/`. Organizational clutter; raises questions about focus.

17. **Repo root noise**: empty shell typo files, committed PR scratch files, duplicate config variants.

---

## PHASE 4 — Reasons to Lean In

**Technical:**

1. **TypeScript discipline is genuinely elite.** Strict mode, zero `@ts-ignore`, 2 `any` annotations across 250+ files, all in a solo-built clinical SaaS. This reflects real engineering character — it is hard to fake.

2. **Sync engine sophistication is commercial-grade.** Jittered backoff with three retry intervals, circuit breaker with 60-second cooldown, conflict surfacing via `ConflictModal`, batch limits, Sentry on permanent failures, `haltQueue` on 401, FIFO-by-client-timestamp ordering — and the service worker is on v7 after a documented v6 self-destruct incident. This is operational scar tissue, not textbook code.

3. **Idempotency is baked into the data model**, not bolted on. Billing ledger has a UNIQUE `idempotencyKey`. Inventory logs have a UNIQUE `(taskId, clinicId, logType)`. Medication tasks use a partial unique index to prevent duplicate active tasks. Pharmacy forecast deduplicates by SHA-256 content hash.

4. **Queue architecture is production-ready.** BullMQ with DLQ, per-clinic + per-user rate limiting via Redis, circuit breaker gates on enqueue and dispatch, no-throw producers that degrade gracefully, heartbeat TTL for worker health, graceful SIGTERM shutdown.

5. **73 test files.** Covering auth hardening, multi-tenancy, RBAC, queue workers, forecast pipeline, PWA, sync, migration integrity, error contract enforcement. Unusual depth for pre-seed. Phase-named test files (`phase-5-error-contract`, `phase-5-route-error-contract`) mean the founder was enforcing API shape contracts — not just feature-testing.

**Product:**

6. **Pharmacy forecast PDF parsing is genuinely hard.** A 1,058-line route that ingests PDFs, extracts drug quantities, deduplicates by content hash, supports exclusion rules, routes to approval, and generates pharmacy orders. This is domain logic competitors will take months to reverse-engineer.

7. **Offline-first for emergency veterinary clinics is a real, largely unaddressed pain.** When a 4am code blue hits and the clinic's internet goes down, every competitor's SaaS stops working. VetTrack's offline engine means the workflow continues, syncs on reconnect, surfaces conflicts. This is a category-defining moat if executed.

8. **Medication calculator with RBAC** (dosing constraints by species/weight/route, vet-approval pathway) demonstrates genuine clinical domain knowledge.

9. **The billing ledger infrastructure exists.** `vt_billing_ledger` with idempotency, `vt_usage_sessions` for time-based billing, `enqueueBillingWebhookJob` with HMAC-signed payloads, and `/api/billing/leakage-report` suggest the founder has thought about revenue capture.

10. **NFC scanning is a physical moat.** Once a clinic has NFC tags on equipment and containers, switching costs are real and visible.

**Market:**

11. **Veterinary SaaS is genuinely underserved internationally.** The dominant players are legacy desktop software. A mobile-first, offline-capable, PWA-based tool has a real displacement story for small-to-mid emergency clinics.

12. **The "stabilization arc" in the test names suggests the founder can recognize and address technical debt.** A founder who does not see the problem is harder to invest in than one who does and is fixing it systematically.

---

## PHASE 5 — What Must Change in 90 Days

To move from "interesting side project" to "fundable vertical SaaS company":

### Days 1–7: Stop the bleeding

1. **Add `requireAuth` to every route in `/api/medication-tasks`**. Every handler is currently unauthenticated. This is one line per route.
2. **Add `requireAuth` + `requireAdmin` to `/api/stability`** diagnostic routes. At minimum gate `POST /run`, `DELETE /logs`.
3. **Rotate all committed secrets immediately**: Clerk production keys, SESSION_SECRET, Sentry DSN. Scrub the git history using `git filter-repo`. This repo may have been public at any point.
4. **Remove the test credential from `AGENTS.md`** and rotate that account's password.
5. **Remove the `x-stability-token` admin bypass** or move it to a proper internal service auth mechanism with explicit scope.

### Days 8–30: Close structural gaps

6. **Add FK constraints from every table's `clinicId` to `vt_clinics.id`** with appropriate cascade policies. This is the most important architectural change for B2B trust.
7. **Fix `vt_rooms.name` uniqueness to be `UNIQUE (clinicId, name)`** — a single migration.
8. **Consolidate to one migration system.** Pick the raw SQL runner (since CI uses it), generate a canonical ordered list resolving the 016/019/021 duplicates, and retire the Drizzle journal path. Document it.
9. **Fix `validateUuid` to actually validate UUID format** (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`).
10. **Complete or officially shelve the medication task model migration.** Two parallel data models is a permanent bug source.

### Days 30–60: Product credibility

11. **Get one paying pilot clinic.** Even $200/month. Revenue changes every investor conversation. The product is technically capable of supporting a live pilot — the blocker is sales motion, not product readiness (post security fixes).
12. **Split `equipment.ts` (2,143 lines) into logical sub-modules** (scan/checkout/return/CRUD).
13. **Write the README.** One sentence company description, what the product does, who it's for, how to run it locally.
14. **Move the PyQt6 desktop app to a separate repo.** It does not belong here.

### Days 60–90: Fundable narrative

15. **Document the pilot.** What workflow did the clinic adopt? What was the before/after? What do they pay and why? This becomes the deck.
16. **Articulate the ICP explicitly.** Emergency vet clinics in Israel with offline requirements? 24-hour specialty hospitals? The investor meeting requires a specific starting segment with a credible reason.
17. **Thread i18n through push notification handlers.** Hardcoded Hebrew in `sw.js` and `expiryCheckWorker.ts` signals English market readiness is incomplete.
18. **Move per-clinic secrets out of `vt_server_config`.** Use Railway's env injection or AWS Secrets Manager. DB compromise should not yield all clinic credentials.

---

## PHASE 6 — Final Verdict

### Interesting but Too Early

**Why this is not a Hard Pass:**

The product depth is real. The offline-first emergency vet workflow is a genuine insight, not a feature flag. The TypeScript discipline, idempotency infrastructure, queue architecture, and pharmacy forecast pipeline signal a founder who can build things that are hard to build. The 73-test suite and multi-phase stabilization arc signal a founder who can recognize and address his own technical debt. The category — vet SaaS, offline-first, PWA, international — is structurally interesting and underserved.

**Why this is not yet a Serious Seed Candidate:**

An unauthenticated endpoint on a medication task route is disqualifying for a clinical SaaS. Full stop. Before the security gaps (medication routes, stability routes, committed production secrets, admin token bypass) are closed, writing a check creates liability, not just risk. The multi-tenancy gap (no DB-level clinic isolation) is the second item that would prevent a security-conscious hospital from deploying this in a regulated environment.

The commercial validation is also absent. There are no customers visible, no revenue signal, no testimonials. The product is technically sophisticated enough to sell — the problem is that it hasn't been sold yet.

**The path to "Serious Seed Candidate" is well-defined and entirely executable in 60–90 days:**

1. Close the five security issues (one to two days of work).
2. Run one paying pilot (sales motion, not engineering).
3. Write the README and document the pilot outcome.

If those three things happen, the technical foundation is strong enough to support a seed raise. The founder signal is interesting enough to take a second meeting today, but not strong enough to write a check without remediation.

**Take the second meeting. Do not write the check.**

---

*Report generated via automated codebase analysis. All findings are sourced from static analysis of the repository at the time of audit.*
