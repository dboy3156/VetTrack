# Analytics Performance & DB Indexes

## What & Why
As equipment count grows to hundreds of items, three performance issues will cause visible degradation:

1. The analytics endpoint does a full table scan of `vt_equipment` and `vt_scan_logs` on every request — no caching, no query optimization. Under concurrent users this hits the database hard and slows down every page load.

2. Common query patterns (list all equipment by status, list equipment checked out by a user, list scan logs for an equipment ID, activity feed sorted by timestamp) have no database indexes. These will degrade from milliseconds to seconds at scale.

3. Bulk operations (`bulk-move`, `bulk-delete`) write to the database but produce no `vt_scan_logs` or `vt_transfer_logs` entries, creating invisible gaps in the audit trail. The activity feed shows nothing for bulk actions, which is a compliance problem.

## Done looks like
- The analytics endpoint caches its response in-memory for 60 seconds with a simple TTL cache keyed by no parameters; a request within the TTL returns the cached result without hitting the database.
- A new SQL migration adds indexes on the most-queried columns: `vt_equipment(status)`, `vt_equipment(checked_out_by)`, `vt_scan_logs(equipment_id, created_at)`, `vt_transfer_logs(equipment_id, created_at)`, `vt_activity(created_at DESC)`.
- After a `bulk-move`, one transfer log entry per moved item is written in the same transaction, with the note "Bulk moved to [Folder Name]".
- After a `bulk-delete`, one scan log entry per deleted item is written before deletion, with the note "Bulk deleted by [User Name]" (tombstone record for audit trail).
- The activity feed shows bulk operations correctly labeled: "Bulk moved to ICU (5 items)" or "Bulk deleted" with the acting user.

## Out of scope
- Redis or distributed caching (in-memory TTL is sufficient for this scale)
- Full-text search indexing
- Data archival or partitioning

## Tasks
1. **Add database indexes migration** — Write migration `006_add_indexes.sql` adding indexes on `vt_equipment(status)`, `vt_equipment(checked_out_by)`, `vt_scan_logs(equipment_id, created_at)`, `vt_transfer_logs(equipment_id, created_at)`; run automatically on startup via the existing migration runner.

2. **Analytics response caching** — Add a simple in-memory TTL cache (60-second window) to the analytics route; cache is keyed globally and invalidated when any equipment mutation occurs (hook into the equipment POST/PATCH/scan endpoints to clear the cache).

3. **Audit trail for bulk operations** — In the bulk-move handler, write a `vt_transfer_logs` entry per item within the existing transaction; in the bulk-delete handler, write a `vt_scan_logs` tombstone entry per item before deletion; update the activity feed query to surface these events with appropriate labels.

## Relevant files
- `server/routes/analytics.ts`
- `server/routes/equipment.ts`
- `server/db.ts`
- `migrations/`
- `src/pages/analytics.tsx`
