# Restore Soft-Deleted Records

## What & Why
Allow admins to recover soft-deleted users and equipment. Task #39 (Soft Delete System) lays the `deletedAt`/`deletedBy` columns and stops hard deletes — this task adds the restore endpoints and the admin UI surface to find and undelete those records.

## Done looks like
- Admin can open a "Deleted Items" section in the admin panel showing all soft-deleted equipment and users
- Each row has a "Restore" button that clears `deletedAt` and `deletedBy`, making the record active again
- Restored equipment reappears in the normal equipment list immediately
- Restored users regain access and reappear in the user list
- All scan logs, transfer logs, and audit history associated with a deleted record are untouched and remain intact after restore
- Non-admin users cannot access or trigger restore operations

## Out of scope
- Permanent / hard purge of soft-deleted records
- Bulk restore of multiple records at once
- Restoring transient tables (`vt_undo_tokens`, `vt_push_subscriptions`, etc.) — these are never soft-deleted per Task #39

## Tasks
1. **Restore API endpoints** — Add `POST /api/equipment/:id/restore` and `POST /api/users/:id/restore` route handlers. Each handler must verify the record exists with a non-null `deletedAt`, clear `deletedAt` and `deletedBy`, and return the restored record. Guard both endpoints with admin-only middleware.

2. **Deleted Items query endpoints** — Add `GET /api/equipment/deleted` and `GET /api/users/deleted` endpoints that return records where `deleted_at IS NOT NULL`, accessible to admins only.

3. **Admin Deleted Items UI** — Add a "Deleted Items" tab or section to the admin panel (or admin user management dashboard). Display two lists — deleted equipment and deleted users — each showing the record name, who deleted it, when, and a Restore button that calls the restore endpoint and refreshes the list on success.

## Relevant files
- `server/db.ts`
- `server/routes/equipment.ts`
- `server/routes/users.ts`
- `src/pages/settings.tsx`
