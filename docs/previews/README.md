# Landing screenshot helper

PNG captures for the public marketing page are generated locally — they are not committed (see `.gitignore`).

## Regenerate

With dev server on port **5000** (adjust if needed):

```powershell
$env:PREVIEW_BASE_URL = "http://localhost:5000"
pnpm exec tsx scripts/capture-css-preview-screenshots.ts
```

Output: `docs/previews/landing-css-preview.png`

The marketing shell always loads [`src/landing-theme.css`](../../src/landing-theme.css) via `MarketingLayout`; scoped rules do not change the signed-in app theme.
