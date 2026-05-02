# Reference — Clinical enterprise integrity

## Canonical repo anchors

| Concern | Where to look |
|--------|----------------|
| Domain language (ER wedge) | `CONTEXT.md` |
| Schema & tables | `server/db.ts`, `migrations/` |
| REST routes | `server/routes/`, registration `server/app/routes.ts` |
| External PMS / adapters | `server/integrations/` |
| Audit logging | `server/lib/audit.ts` |
| Auth / clinic context | `server/middleware/auth.ts`, `server/lib/auth-mode.ts` |
| Background jobs | `server/workers/`, `server/app/start-schedulers.ts` |
| Offline client | `src/lib/offline-db.ts`, `src/lib/sync-engine.ts` |
| Ward + Code Blue UI behavior | `docs/superpowers/specs/2026-04-27-ward-display-design.md`, Code Blue routes under `server/routes/` |
| Asset Radar / rooms | `replit.md` (Asset Radar section), `src/` rooms pages |
| ER Mode / allowlist | `shared/er-mode-access.ts`, `server/lib/er-mode.ts`, `src/features/er/components/ErModeGuard.tsx` |

## Clinical–financial sync — review prompts

- Does completing this task **always** create the expected `vt_billing_*` / ledger rows when billing applies?
- Is inventory movement **one** job enqueue per completion (or explicitly idempotent)?
- Are failures visible (API error, job dead-letter, or UI toast)—not silent?

## Offline-first — review prompts

- Does a mutation work when offline (queued) and **replay** safely when online?
- Does the worker handle duplicate deliveries without double effect?

## RBAC — review prompts

- Is `clinicId` on **every** query?
- Is the operation allowed for this role per DB role, not claim text?

## ER Mode — review prompts

- Is every **critical** route/API pair represented so ER deployments do not Concealment-404 essential care flows?
- Do optional services (analytics, heavy reports) fail **without** taking down checkout, meds, or billing handlers?

## PowerShell — manual commands (repo root)

```powershell
# Core validation and production-readiness check
npx tsc --noEmit
pnpm validate:prod

# Default unit/integration suite (see vite.config.ts for excludes)
pnpm test

# Database + Drizzle alignment (requires DATABASE_URL and a reachable DB)
if ($env:DATABASE_URL) {
    pnpm exec drizzle-kit check
    pnpm db:migrate   # if migrations pending — manual per AGENTS.md / CLAUDE.md
    pnpm test -- tests/integrations/
}
```

Apply migrations before relying on DB-heavy tests. Vitest **excludes** some paths by default (e.g. certain DB and live-server tests); see `vite.config.ts` `test.exclude`. When changing **ER Allowlist** / **Concealment 404** rules, run or extend tests that cover `shared/er-mode-access.ts` and `server/middleware/er-mode-concealment.ts`.

## Risk label rubric (enhanced)

- **P0/P1**: Critical feature path (meds, billing, Code Blue, core ER) **missing** from `shared/er-mode-access.ts`, risking functional lockout during ER Mode; wrong dose path, wrong patient/clinic, missing audit on controlled action, duplicate billing.
- **P1**: Schema or migration changes that break **backward compatibility** with `src/lib/offline-db.ts` / sync payloads for clients already in the field.
- **P2**: Non-allowlisted or peripheral UI that hurts performance or clarity in high-stress flows; degraded UX with recovery path.
- **P3/P4**: Hygiene, logging noise, docs-only gaps.

When unsure, **bias to P1** for anything touching medications, billing, identity, or ER allowlist coverage.
