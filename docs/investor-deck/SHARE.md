# How To Share The Investor Deck

This is the exact checklist to produce a clean package and send it.

## 1) Final verification (required)

Run these from the repo root:

```bash
pnpm run deck:verify-assets
```

Expected result: all 8 PNGs exist and no `MISSING` lines.

## 2) Decide what you are sharing

Use one of these options:

- **Option A (recommended): HTML deck + screenshots**
  - `docs/investor-deck/deck-en.html` or `docs/investor-deck/deck-he.html`
  - `docs/investor-deck/assets/*.png`
- **Option B: PDF export**
  - Open `deck-en.html` (or `deck-he.html`) in Chrome
  - Print -> Save as PDF
  - Share the exported PDF
- **Option C: Screenshot-only teaser**
  - Share only selected PNGs from `docs/investor-deck/assets/`
  - Best for WhatsApp/Slack previews, not full pitch flow

## 3) Build a share folder (exact commands)

From repo root:

```bash
mkdir -p dist/investor-deck-share/assets
cp docs/investor-deck/deck-en.html dist/investor-deck-share/
cp docs/investor-deck/deck-he.html dist/investor-deck-share/
cp docs/investor-deck/README.md dist/investor-deck-share/
cp docs/investor-deck/assets/*.png dist/investor-deck-share/assets/
```

Optional zip:

```bash
cd dist
zip -r investor-deck-share.zip investor-deck-share
```

If `zip` is unavailable, compress the `dist/investor-deck-share` folder with your file explorer.

## 4) Add one short sender note

Use this message template:

> Sharing VetTrack investor deck package.  
> Includes English + Hebrew deck files and fresh product screenshots from the current build.  
> Open `deck-en.html` or `deck-he.html` in Chrome, then use fullscreen (`F11`) or Print -> Save as PDF.

## 5) Pre-send visual sanity check (30 seconds)

Before sending, quickly confirm:

- No onboarding modal appears in screenshots
- `billing.png` and `audit.png` are clear and readable
- No sign-in page captured in authenticated slides
- Language matches your audience (English or Hebrew)

## 6) If something looks wrong

Re-generate screenshots:

```bash
pnpm run deck:capture
pnpm run deck:verify-assets
```

Then re-copy files into `dist/investor-deck-share`.

