# VetTrack — investor presentation (HTML)

Two **Reveal.js** decks — **14 slides** each: OS narrative, **differentiation vs PIMS/point tools**, **Ward View** emphasis, **audit / operational proof**, product depth, engineering, traction, ask. **Dark enterprise** styling.

| File | Language |
|------|----------|
| [`deck-en.html`](./deck-en.html) | English (LTR) |
| [`deck-he.html`](./deck-he.html) | Hebrew (RTL) |

**Competitive context (short):** [`COMPETITIVE_LANDSCAPE.md`](./COMPETITIVE_LANDSCAPE.md)
**How to share package:** [`SHARE.md`](./SHARE.md)

## Open

- `start docs/investor-deck/deck-en.html` (Windows) or open in Chrome.
- **Fullscreen:** `F11`. **Export:** Print → Save as PDF.

## Real app screenshots (`pnpm run deck:capture`)

Requires **`pnpm dev`** (Vite **:5000** + API **:3001**) with **database** and **dev-bypass auth** (no Clerk keys, per `server/middleware/auth.ts` / `src/hooks/use-auth.tsx`) so `/api/users/me` succeeds.

### Populate realistic demo data (`pnpm run deck:seed`)

After migrations, seed rows scoped to `dev-clinic-default` (equipment for Code Blue / equipment list, audit samples, ward snapshot data, medication tasks, billing leakage demo). Safe to re-run; `--force` replaces only rows whose IDs start with `investor-demo`.

```bash
DATABASE_URL=postgres://… pnpm run deck:seed
```

Use your real Postgres URL on Windows, for example:

```powershell
$env:DATABASE_URL="postgresql://USER:PASS@localhost:5432/vettrack"; $env:NODE_ENV="development"; pnpm run deck:seed
```

Unset **`CLERK_SECRET_KEY`** and **`VITE_CLERK_PUBLISHABLE_KEY`** (or ensure `.env` does not set them) so the UI uses dev-bypass auth and stays signed in for captures.

Start API + Vite (keep running):

```bash
DATABASE_URL=postgres://… PORT=3001 pnpm dev
```

Capture screenshots (separate terminal):

```bash
pnpm run deck:capture
```

Writes PNGs into `assets/`:

| Output file | Route |
|-------------|--------|
| `landing.png` | `/landing` (always tries first) |
| `home.png` | `/home` |
| `ward.png` | `/display` |
| `code-blue.png` | `/code-blue` |
| `meds.png` | `/meds` |
| `billing.png` | `/billing/leakage` |
| `equipment.png` | `/equipment` |
| `audit.png` | `/audit-log` |

If you are not signed in (e.g. API down), authenticated shots are **skipped** in the log; fix env and re-run. Missing files still **fall back** to [`_placeholder.svg`](./assets/_placeholder.svg) in the deck.

### Env precedence (important)

Dotenv loads **`.env.local` before `.env`**. If **`CLERK_SECRET_KEY`** / **`VITE_CLERK_PUBLISHABLE_KEY`** are set in **`.env.local`**, they override a Clerk-free `.env` and the UI stays in **Clerk mode** — captures then hit `/signin` and **authenticated PNGs are skipped**. For README-style captures, **comment or remove those keys in `.env.local`**, save, restart **`pnpm dev`**, then run **`pnpm run deck:capture`**.

### Verify captures

1. **`pnpm run auth:preflight`** — expect **`mode=dev-bypass`** for scripted captures, and **`/api/healthz ok=true`** once the API is up.
2. After **`pnpm run deck:capture`**, run **`pnpm run deck:verify-assets`** — confirms all **eight** PNGs exist under `assets/` and are not tiny empty files.

Commit generated PNGs when you are happy with them (optional for the repo).

## Slide 2 — “operational system of record”

That line means: one **trusted** place where care, finance, and accountability **line up** — instead of each team holding a **partial** truth in different tools.

## Edit copy

Inline in each HTML file; replace traction / ask `<em>` lines before external use.
