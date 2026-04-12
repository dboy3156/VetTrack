# Soft Delete System

## What & Why
Replace all hard deletes on primary data tables with soft deletes so records are never permanently removed from the database. This prevents accidental or malicious data loss and preserves a full history of all records including who deleted them and when.

## Done looks like
- Equipment, folders, and users all have `deletedAt` and `deletedBy` columns
- Deleting any of these records sets those fields instead of removing the row
- All normal queries (list, search, fetch by ID) automatically exclude soft-deleted records
- The app continues to work exactly as before from a user perspective — deletions still appear to "remove" items from the UI
- No record is ever permanently removed via normal app operations
- Cascade hard-delete on scan/transfer logs for equipment is replaced with soft-delete on the equipment row only (child logs are retained)

## Out of scope
- A UI to view or restore deleted records (future work)
- Soft deleting transient/operational tables: `vt_undo_tokens`, `vt_push_subscriptions`, `vt_alert_acks`, `vt_whatsapp_alerts`, `vt_server_config`
- Bulk restore or purge tooling

## Tasks
1. **Database migration** — Add `deleted_at` (timestamp, nullable) and `deleted_by` (text, nullable) columns to `vt_equipment`, `vt_folders`, and `vt_users`. Update or replace the cascade delete foreign key on scan/transfer logs so equipment deletion no longer cascades.

2. **Schema & ORM update** — Add `deletedAt` and `deletedBy` fields to the Drizzle schema definitions for equipment, folders, and users. Update all default queries for these tables to filter `WHERE deleted_at IS NULL`.

3. **Route soft-delete implementation** — Replace every `.delete()` call for equipment, folders, and users in the route handlers with an `.update()` that sets `deletedAt` and `deletedBy`. Update the folder-deletion logic (which currently nullifies equipment folder references before deleting) to instead soft-delete the folder only.

4. **Integrity check** — Verify that fetching equipment by ID, listing equipment, folder listing, and user listing all correctly exclude soft-deleted records. Confirm scan logs and transfer logs associated with soft-deleted equipment are still present in the database.

## Relevant files
- `server/db.ts`
- `server/routes/equipment.ts`
- `server/routes/folders.ts`
- `server/routes/users.ts`
- `migrations/001_initial_schema.sql`
