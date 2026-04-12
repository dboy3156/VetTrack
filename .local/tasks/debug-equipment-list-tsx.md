# Fix JSX Structure Bug in Equipment List

## What & Why
`src/pages/equipment-list.tsx` has a stray extra `</div>` on line 492 that prematurely closes the main content container (the `<div className="flex flex-col gap-3 pb-24 animate-fade-in">` that opens at line 297). This causes 4 TypeScript compile errors. Vite tolerates it at runtime, but it will break a production build and makes the code structurally incorrect.

## Done looks like
- `npx tsc --noEmit` passes with zero errors in the entire project
- The Equipment List page still renders and behaves exactly as before
- `npm run build` completes without errors

## Out of scope
- Visual or feature changes to the equipment list page
- Modifications to any other file

## Tasks
1. **Remove the stray closing tag** — Delete the extra `</div>` at line 492 of `src/pages/equipment-list.tsx`. The div that opens at line 297 should stay open until line 694, where the existing `</div>` correctly closes it. The `CsvImportDialog` (line 696) should remain a direct child of `<Layout>`.
2. **Verify** — Confirm `npx tsc --noEmit` reports zero errors and that the Equipment List page renders correctly in the running app.

## Relevant files
- `src/pages/equipment-list.tsx:290-700`
