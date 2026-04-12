# Equipment CSV Import & Clone

## What & Why
A hospital deploying VetTrack for the first time has 100–300 pieces of equipment to register. The current system requires a separate form submission per item, which is a critical adoption blocker. Additionally, adding 10 "Autoclave Unit" variants means filling the same form 10 times. Two features fix this: (1) a CSV import that lets an admin upload a spreadsheet and bulk-register equipment, and (2) a "Duplicate" button on existing equipment that pre-fills a new item form with the same fields (minus the serial number).

## Done looks like
- Admin sees a "Import CSV" button on the Equipment List page.
- Clicking opens a dialog with a downloadable template CSV (headers: name, serial, status, location, folder, maintenanceIntervalDays, notes).
- Admin uploads a CSV; the system validates each row, shows a preview table with any errors highlighted, and requires confirmation before inserting.
- On success, a toast shows "X items imported" and the list refreshes.
- Row-level errors (missing name, duplicate serial, invalid status) are shown inline — valid rows still import, invalid rows are skipped with a report.
- On any equipment detail page, an admin or technician sees a "Duplicate" button that opens the "Add Equipment" form pre-filled with all fields from the current item except the serial number and ID.
- CSV import is admin-only; Duplicate is technician+.

## Out of scope
- Importing scan log history or transfer history from CSV
- Excel (.xlsx) format support (CSV only)
- Equipment photo import

## Tasks
1. **CSV import backend endpoint** — Create `POST /api/equipment/import` (admin-only) that accepts a multipart CSV upload, parses rows with validation, performs a batched insert in a single transaction, and returns a result summary (inserted count, skipped rows with reasons).

2. **CSV import UI** — Add an "Import CSV" button to the Equipment List admin toolbar; build a dialog with file upload, template download link, row preview table with error highlights, and confirmation step before submitting.

3. **Equipment duplication** — On the equipment detail page, add a "Duplicate" action (admin/technician only) that navigates to the new-equipment form with all fields pre-populated except serial number; the form title should read "New Equipment (copied from X)".

## Relevant files
- `src/pages/equipment-list.tsx`
- `src/pages/equipment-detail.tsx`
- `src/pages/new-equipment.tsx`
- `server/routes/equipment.ts`
- `server/db.ts`
