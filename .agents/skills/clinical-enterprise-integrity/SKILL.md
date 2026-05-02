---
name: clinical-enterprise-integrity
description: Audits VetTrack changes for clinical–financial alignment, offline-first safety, ER Mode allowlist coverage, critical-bedside workflows, and audit/RBAC integrity so medical, financial, and asset data stay one coherent source of truth. Use when reviewing medication or inventory flows, server integrations, BullMQ/Redis workers, PWA/offline sync, Code Blue or ward display, Asset Radar, new routes or UI in ER, permission or dispensing paths, or hospital-grade deployment readiness.
---

# Clinical enterprise integrity (VetTrack OS)

Treat VetTrack as a **clinical-grade operational layer**: 24/7 hospital use requires synchronized medical, financial, and asset state—no manual double-entry, no silent loss on connectivity drops, no blind spots at the bedside.

## Quick start

1. Read `CONTEXT.md` and the domain section of the change (ER, meds, equipment, billing).
2. If the change adds or moves **routes, APIs, or entry points**, verify **ER Mode**: critical paths must appear in `shared/er-allowlist.ts` (and related guards); run or extend `tests/er-allowlist.test.ts` when behavior changes.
3. Classify findings **P0–P4** (use project audit convention: severity, file:line, risk, effort).
4. Run the smoke script in `scripts/verify-stack.ps1` after substantive edits.
5. Deep checklists and repo map: [REFERENCE.md](REFERENCE.md).

## Workflow A — Clinical–financial sync

Trace **one clinical action** end-to-end (e.g. complete medication task, NFC checkout/return, billing line):

- API handler → domain service → DB writes — confirm **billing** and **inventory** outcomes match the clinical fact (atomicity, same `clinicId`).
- Async paths (`inventory-deduction`, queues): document brief inconsistency windows; avoid duplicate charges or missing deductions.
- Integration adapters live under `server/integrations/` — no vendor-specific leakage into core clinical logic.

## Workflow B — Offline-first & workers

- Client: `src/lib/offline-db.ts`, `sync-engine.ts` — new reads/writes must have a **queue or cache story**; failed sync must surface to the user, not vanish.
- Server: BullMQ/Redis jobs in `server/workers/`, schedulers in `server/app/start-schedulers.ts` — idempotent processing, **tenant/clinic scoping** on every query, safe retries.
- Do not assume continuous ER connectivity for correctness of **authoritative** clinical state.

## Workflow C — Critical workflows (Code Blue, Ward View)

- **Ward display** spec: `docs/superpowers/specs/2026-04-27-ward-display-design.md` — instant mode swap, snapshot includes Code Blue payload where applicable.
- **Code Blue**: full-screen takeover, minimal latency; no nested navigation to “find” emergency state.
- **Asset Radar**: rooms/equipment sync semantics — `replit.md` / rooms feature; verification timestamps and stale logic consistent with scans.

## Workflow D — Audit trail & RBAC

- Sensitive actions: use `logAudit()` from `server/lib/audit.ts` (fire-and-forget outside transactions per project rules).
- **Role** comes from `vt_users.role` in the DB, not JWT claims alone (`server/middleware/auth.ts` pattern).
- Permission changes, dispensing, integration credential use: must leave an **auditable** trace.

## Workflow E — ER Mode & resilience

- **Allowlist**: When adding or changing a route, API surface, or staff-facing entry, check `shared/er-allowlist.ts`. Features on critical paths (Code Blue, medication dispensing, ward display, core ER boards) **must** stay allowlisted so they work under restricted ER Mode—avoid Concealment 404 lockout for bedside workflows.
- **Graceful degradation**: Analytics, reporting, or other non-urgent dependencies must **not** throw uncaught errors that abort billing, inventory, or active treatment flows; fail soft or isolate behind timeouts.
- **Emergency UI state reliability**: Code Blue / emergency overlays must not hide the patient or queue facts staff need for decisions; avoid extra navigation layers during an active emergency—see Workflow C for display spec.

## Outputs for humans & agents

- **Gap report**: table of issues with P-tier, clinical risk statement, and concrete fix or test to add.
- **Fixes**: production-ready TypeScript (strict), matching existing module patterns; prefer integration tests for DB behavior.

## Product narrative (external docs)

Investor or architecture decks are **north-star** only—verify every claim against **this repo**. When deck and code diverge, file the gap as clinical risk and either fix code or update the controlled spec document.
