# Security Sprint (Days 1–7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining Gate 1 security items from `docs/due-diligence-report.md` — stability token production guard, migration system consolidation, and documented ops runbooks for git history scrub and SECRET_SESSION rotation.

**Architecture:** Three code changes (stability token guard, migration command aliasing, docs) plus two ops-only runbooks that require manual execution. The code changes are small and targeted. No new dependencies.

**Tech Stack:** Express middleware, Node.js `req.socket`, TypeScript, pnpm scripts, git filter-repo (external tool)

---

## File Map

| File | Action | What changes |
|---|---|---|
| `server/middleware/auth.ts` | Modify | Add loopback-only guard for stability token in production |
| `package.json` | Modify | Alias `db:migrate` to the canonical raw-SQL runner |
| `docs/migrations.md` | Create | Canonical migration system reference |

---

## Task 1 — Stability Token Loopback Guard

**What this fixes:** `x-stability-token` currently grants full admin access from any network origin if the token is known. In production the token defaults to a random boot-time value (safe), but the bypass should be restricted to loopback addresses regardless — defence in depth.

**Files:**
- Modify: `server/middleware/auth.ts` around line 200

- [ ] **Step 1: Write the failing test**

Add to `tests/phase-1-auth-hardening.test.ts` (or whichever auth test file exists):

```typescript
it("rejects x-stability-token from non-loopback IP in production", async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    const req = {
      headers: { "x-stability-token": "any-token" },
      socket: { remoteAddress: "203.0.113.42" }, // external IP
    } as unknown as Request;
    const result = await resolveAuthUser(req);
    expect(result.ok).toBe(false);
    expect((result as { status: number }).status).toBe(403);
  } finally {
    process.env.NODE_ENV = original;
  }
});

it("allows x-stability-token from 127.0.0.1 in production", async () => {
  const original = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  process.env.STABILITY_TOKEN = "test-token-loopback";
  try {
    const req = {
      headers: { "x-stability-token": "test-token-loopback" },
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;
    const result = await resolveAuthUser(req);
    // should NOT be rejected for loopback — it may fail auth for other reasons
    // but must not return 403 FORBIDDEN
    if (!result.ok) {
      expect((result as { status: number }).status).not.toBe(403);
    }
  } finally {
    process.env.NODE_ENV = original;
    delete process.env.STABILITY_TOKEN;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm test -- --reporter=verbose 2>&1 | grep -A 5 "stability-token"
```

Expected: test fails because the guard does not exist yet.

- [ ] **Step 3: Implement the loopback guard**

In `server/middleware/auth.ts`, replace the stability token check block (around line 200–203):

```typescript
// BEFORE:
export async function resolveAuthUser(req: Request): Promise<ResolveResult> {
  if (req.headers["x-stability-token"] === STABILITY_TOKEN) {
    return { ok: true, user: { ...DEV_USER, role: "admin" } };
  }
```

```typescript
// AFTER:
const LOOPBACK_ADDRS = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export async function resolveAuthUser(req: Request): Promise<ResolveResult> {
  if (req.headers["x-stability-token"] === STABILITY_TOKEN) {
    if (process.env.NODE_ENV === "production") {
      const remote = req.socket?.remoteAddress ?? req.ip ?? "";
      if (!LOOPBACK_ADDRS.has(remote)) {
        return {
          ok: false,
          status: 403,
          body: { error: "FORBIDDEN", reason: "STABILITY_TOKEN_EXTERNAL_ORIGIN", message: "Forbidden" },
        };
      }
    }
    return { ok: true, user: { ...DEV_USER, role: "admin" } };
  }
```

- [ ] **Step 4: Run tests**

```bash
pnpm test 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add server/middleware/auth.ts
git commit -m "fix: restrict x-stability-token bypass to loopback addresses in production"
```

---

## Task 2 — Canonicalise the Migration System

**What this fixes:** Two commands exist for migrations — `pnpm db:migrate` (Drizzle journal) and `pnpm migrate` (raw SQL runner). CI and Railway use the raw SQL runner. Drizzle's journal is a vestige. Investors probing the codebase will find two systems with a confusing duplicate 019 numbering.

**Files:**
- Modify: `package.json` (scripts section)
- Create: `docs/migrations.md`

- [ ] **Step 1: Update `db:migrate` to use the canonical runner**

In `package.json`, change the `db:migrate` script so it points to the same runner as `migrate`:

```json
"db:migrate": "tsx scripts/run-migrations.ts",
"migrate": "tsx scripts/run-migrations.ts",
```

Both commands now run the same thing. `db:migrate` is kept for muscle memory; it no longer silently diverges.

> Note: Do NOT delete the `migrations/meta/` directory or the Drizzle journal — Drizzle Kit (`drizzle-kit generate`) still reads the journal when generating new migration SQL. We're only fixing the *apply* command, not schema generation.

- [ ] **Step 2: Write `docs/migrations.md`**

```markdown
# VetTrack Migration System

## Canonical Command

```
pnpm migrate          # applies pending SQL migrations to DATABASE_URL
pnpm db:migrate       # alias — runs the same command
```

Both run `scripts/run-migrations.ts`, which uses `server/migrate.ts` — a custom raw-SQL runner that tracks applied migrations in the `vt_migrations` table (advisory-locked).

## Generating New Migrations

Use Drizzle Kit to generate the SQL from schema changes:

```
npx drizzle-kit generate
```

This creates a new `.sql` file in `migrations/` and updates `migrations/meta/_journal.json`. Commit both.

**Naming convention:** `NNN_description.sql` where NNN is the next sequential number. Check existing files to avoid duplicates.

## The Duplicate 019 Situation

`migrations/` contains two files numbered 019:
- `019_add_user_display_name.sql`
- `019_smart_role_notifications_schema.sql`

Both have been applied to production (tracked by distinct filenames in `vt_migrations`). Do **not** rename them — renaming would break `vt_migrations` tracking and cause re-application. The numbering is cosmetically confusing but operationally correct.

Future migrations must start at 064 or higher to avoid gaps and duplicates.

## What `pnpm db:migrate` Used to Do

Previously `db:migrate` ran `drizzle-kit migrate`, which applied Drizzle's journal-based migration system. That path is retired. `drizzle-kit migrate` should not be run directly.

## CI

The CI pipeline (`.github/workflows/ci.yml`) runs `pnpm migrate` against a test PostgreSQL instance as part of the test job.
```

- [ ] **Step 3: Verify both commands resolve to the same script**

```bash
node -e "const p = require('./package.json'); console.log(p.scripts['db:migrate'], p.scripts['migrate'])"
```

Expected: both print `tsx scripts/run-migrations.ts`.

- [ ] **Step 4: Commit**

```bash
git add package.json docs/migrations.md
git commit -m "fix: canonicalise migration system — db:migrate now runs raw SQL runner, not drizzle-kit"
```

---

## Task 3 — Ops Runbook: Git History Scrub + Clerk Key Rotation

> **This task requires manual execution by the repo owner. It is destructive and cannot be undone. Read every step before starting.**

**What this fixes:** DD item 1.4 — if any historical commit ever contained `pk_live_*` or `sk_live_*` Clerk keys, those keys are permanently compromised if the repo was ever public.

**Files:** None — this is a git operation.

- [ ] **Step 1: Check whether the keys are actually in history**

```bash
git log --all --oneline | wc -l
git log --all -p -- "*.md" "*.ts" "*.env*" | grep -E "pk_live_|sk_live_" | head -20
```

If no output: the keys were never committed. Skip to Step 6 (key rotation only). If output exists: continue.

- [ ] **Step 2: Install git-filter-repo (if not installed)**

```bash
pip3 install git-filter-repo
# or on macOS: brew install git-filter-repo
git filter-repo --version
```

Expected: version string printed.

- [ ] **Step 3: Create a backup branch before scrubbing**

```bash
git checkout -b backup/pre-scrub-$(date +%Y%m%d)
git checkout main
```

- [ ] **Step 4: Scrub the keys from history**

Replace `pk_live_ACTUAL_KEY_HERE` and `sk_live_ACTUAL_KEY_HERE` with the real leaked values:

```bash
git filter-repo --replace-text <(cat <<'EOF'
pk_live_ACTUAL_KEY_HERE==>REDACTED_CLERK_PK
sk_live_ACTUAL_KEY_HERE==>REDACTED_CLERK_SK
EOF
)
```

- [ ] **Step 5: Verify the scrub worked**

```bash
git log --all -p | grep -E "pk_live_|sk_live_" | head -5
```

Expected: no output.

- [ ] **Step 6: Force-push all branches (required after history rewrite)**

```bash
git push origin --force --all
git push origin --force --tags
```

> Warn any collaborators: their local clones are now diverged. They must `git fetch --all` and reset their branches.

- [ ] **Step 7: Rotate the Clerk keys**

1. Log in to [dashboard.clerk.com](https://dashboard.clerk.com)
2. Select the `vettrack.uk` instance
3. Go to **API Keys** → **Reveal** → **Roll keys**
4. Copy new `pk_live_*` and `sk_live_*` values
5. Update Railway environment variables:
   - `CLERK_SECRET_KEY` = new `sk_live_*`
   - `VITE_CLERK_PUBLISHABLE_KEY` = new `pk_live_*`
6. Trigger a Railway redeploy
7. Verify the app loads and auth works on `vettrack.uk`

- [ ] **Step 8: Update `docs/due-diligence-report.md`**

Mark item 1.4 as ✅ Done.

---

## Task 4 — Ops Runbook: SESSION_SECRET Rotation

> **This is a Railway env var change. It will invalidate all active sessions (users will be logged out). Do this during a low-traffic window.**

**What this fixes:** DD item 1.5 — the `SESSION_SECRET` committed in `.env.example` may be the same value used in production.

- [ ] **Step 1: Generate a new high-entropy secret**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"
```

Copy the output.

- [ ] **Step 2: Update Railway**

1. Go to Railway → VetTrack project → Variables
2. Update `SESSION_SECRET` to the new value
3. Trigger a redeploy

- [ ] **Step 3: Update `.env.example` with a placeholder (not a real value)**

In `.env.example`, find the `SESSION_SECRET` line and replace the value with:
```
SESSION_SECRET=replace-with-output-of--node-e-require-crypto-randomBytes-64-toString-base64
```

- [ ] **Step 4: Verify the app works after redeploy**

Navigate to `vettrack.uk`, sign in, confirm the session persists across a page refresh.

- [ ] **Step 5: Update `docs/due-diligence-report.md`**

Mark item 1.5 as ✅ Done. Commit:

```bash
git add .env.example docs/due-diligence-report.md
git commit -m "docs: replace real SESSION_SECRET in .env.example with placeholder"
```

---

## Self-Review

**Spec coverage check:**
- 1.4 (Clerk key scrub): Task 3 ✅
- 1.5 (SESSION_SECRET): Task 4 ✅
- 1.6 (stability token): Task 1 ✅
- 2.3 (migration consolidation): Task 2 ✅

**Placeholder scan:** No TBDs. All code blocks contain actual implementation.

**Type consistency:** `LOOPBACK_ADDRS` defined and used in the same task. `req.socket?.remoteAddress` is available on `Request` from express via the underlying `http.IncomingMessage`.

**Risk note:** Task 3 (git filter-repo) is irreversible. Backup branch is required before starting. Task 4 (session rotation) logs out all active users.
