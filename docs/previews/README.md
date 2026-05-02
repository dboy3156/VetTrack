# Landing screenshot helper

PNG captures for the public marketing page are generated locally — they are not committed (see `.gitignore`).

## Regenerate

With dev server on port **5000** (adjust if needed):

```powershell
$env:PREVIEW_BASE_URL = "http://localhost:5000"
pnpm exec tsx scripts/capture-css-preview-screenshots.ts
```

Output: `docs/previews/landing-css-preview.png`

The marketing route uses the same global styles as the app (`src/main.tsx` → `index.css`); `MarketingLayout` does not load a separate landing-only stylesheet.
