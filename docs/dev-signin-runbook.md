# Dev Sign-in Runbook

Deterministic procedures for signing in to a local VetTrack dev instance in
both modes, plus troubleshooting when things get stuck.

This runbook mirrors what the agent can execute. No secrets appear in outputs.

## Mode Contract

The server and client agree on a single rule:

| Condition | Mode |
|-----------|------|
| `CLERK_SECRET_KEY` set (trimmed) AND `CLERK_ENABLED !== "false"` | `clerk` |
| Otherwise | `dev-bypass` |

- `VITE_CLERK_PUBLISHABLE_KEY` is what the **browser** checks to decide if it
  needs Clerk. Keep it aligned with the server secret so they don't desync.
- `.env.local` is the sole local override file for auth keys. It is the last
  file loaded and wins over `.env`.

Startup banners confirm the active mode without leaking secrets:
- Server: `[auth-mode] server mode=<clerk|dev-bypass> reason=... env=... hasSecret=... hasPublishable=...`
- Client (dev only): `[auth-mode] client=<clerk|dev-bypass> publishableKey=pk_tes... env=development`

## Agent preflight (always run this first)

```powershell
pnpm run auth:preflight
```

Prints (no secrets):
- which env files exist and which watched keys they define,
- resolved auth mode and reason,
- parsed `DATABASE_URL` (host/user/db/port, password presence only),
- `/api/healthz` reachability on `PORT` (defaults to 3001).

Exit code is `1` only on fatal misconfig (e.g., unparseable `DATABASE_URL`).

## Flow A — Dev bypass quick start (no Clerk)

Use when you just want to load the app without signing in through Clerk.

1. In `.env.local`, leave `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY`
   unset (or comment them out). Optionally set `CLERK_ENABLED=false` to be
   explicit.
2. Run `pnpm run auth:preflight` and confirm `auth-mode mode=dev-bypass`.
3. Start the app: `pnpm run dev`.
4. The app auto-authenticates as the built-in `dev-admin-001` user via
   `/api/users/me`. No sign-in page is required.

Expected server boot line:
```
[auth-mode] server mode=dev-bypass reason=secret-missing env=development hasSecret=false hasPublishable=false
```

## Flow B — Real Clerk quick start (test keys)

Use when you need a real Clerk session (e.g., to reproduce pending/active flows).

1. In `.env.local`, set both:
   - `CLERK_SECRET_KEY=sk_test_...`
   - `VITE_CLERK_PUBLISHABLE_KEY=pk_test_...`
   Do **not** set `CLERK_ENABLED=false`.
2. Run `pnpm run auth:preflight` and confirm `auth-mode mode=clerk`.
3. Start the app: `pnpm run dev`.
4. Sign in at `/signin` using a Clerk user in the matching Clerk instance.

Expected server boot line:
```
[auth-mode] server mode=clerk reason=secret-present env=development hasSecret=true hasPublishable=true
```

## Troubleshooting

### Stuck on the loading spinner

AuthGuard shows a spinner for up to 30s before surfacing an actionable panel.
In dev, that panel now includes:
- resolved client mode (`clerk` vs `dev-bypass`) and Vite MODE,
- likely causes,
- the exact `pnpm run auth:preflight` command to diagnose further.

Common causes:
- API server not running (`/api/healthz` unreachable).
- Server and client disagree on mode (secret present but no publishable key,
  or vice versa). Preflight flags this explicitly.
- `DATABASE_URL` is unreachable; `/api/users/me` hangs, then the guard retries.

### "Account pending hospital management approval" screen

This means Clerk authentication succeeded but the backend row for the user is
in `status='pending'`. Check and activate with the safe utility:

```powershell
# Inspect only
pnpm run auth:user-status -- --email=you@example.com

# Flip an existing user to active
pnpm run auth:user-status -- --email=you@example.com --activate

# Create + activate a brand-new dev user (requires clinic + clerk id)
pnpm run auth:user-status -- `
  --email=you@example.com `
  --clerk-id=user_xxx `
  --clinic-id=dev-clinic-default `
  --name="Dan" `
  --activate
```

The script refuses to run with `NODE_ENV=production` and will never insert a
row without explicit `clinic_id` and `clerk_id`, which is the root cause of
the earlier ad-hoc `.tmp-activate-user.ts` failures.

### "Access denied" with a reason

AuthGuard maps backend `reason` codes to localized descriptions. Common codes:
- `MISSING_CLINIC_ID` — user row has no `clinic_id`. Set one via the utility
  script or directly in the DB.
- `DB_FALLBACK_DISABLED` — Clerk session has no `org_id` and
  `DB_CLINIC_FALLBACK=false`. Either add the org to the Clerk session or
  remove the env override.
- `ACCOUNT_BLOCKED` / `ACCOUNT_PENDING_APPROVAL` — see the section above.

### Env confusion between `.env` and `.env.local`

`pnpm run auth:preflight` prints which file defines which watched key. If the
same key is defined in both, `.env.local` wins at runtime (via `dotenv/config`).

## Reference commands

| Task | Command |
|------|---------|
| Diagnose mode + env + API | `pnpm run auth:preflight` |
| Inspect a user | `pnpm run auth:user-status -- --email=<email>` |
| Activate an existing user | `pnpm run auth:user-status -- --email=<email> --activate` |
| Create + activate (dev only) | `pnpm run auth:user-status -- --email=<email> --clerk-id=<id> --clinic-id=<id> --activate` |
| Regression suite (includes auth mode tests) | `pnpm test` |

## Related files

- `server/lib/auth-mode.ts` — shared mode resolution helper.
- `server/index.ts` — emits the secret-free server startup banner.
- `src/main.tsx` — emits the dev-only client banner and decides whether to
  wrap the app in `ClerkProvider`.
- `src/hooks/use-auth.tsx` — Clerk vs dev bypass provider selection and
  backend sync via `/api/users/me` + `/api/users/sync`.
- `src/features/auth/components/AuthGuard.tsx` — spinner, pending, blocked,
  and (dev only) actionable timeout diagnostics.
- `scripts/auth-preflight.ts` — agent preflight tool.
- `scripts/dev-user-status.ts` — safe user inspect/activate tool.
- `tests/auth-mode-resolution.test.ts` — mode contract regression tests.
- `tests/dev-user-status-smoke.test.ts` — safety guardrail tests.
