-- One active restock session per container (DB-enforced concurrency).

-- PRE-MIGRATION SAFETY CHECK: abort if duplicate active sessions exist
DO $$
DECLARE
    dup_count INT;
    dup_details TEXT;
BEGIN
    SELECT COALESCE(COUNT(*)::INT, 0), COALESCE(string_agg(d.container_id::text, ', ' ORDER BY d.container_id), '')
    INTO dup_count, dup_details
    FROM (
        SELECT container_id
        FROM vt_restock_sessions
        WHERE status = 'active'
        GROUP BY container_id
        HAVING COUNT(*) > 1
    ) AS d;

    IF dup_count > 0 THEN
        RAISE EXCEPTION
            'Migration aborted: % container(s) have multiple active restock sessions: [%]. Resolution: for each container, keep the most recent session (MAX(started_at)) active and set the others to status ''finished'' with finished_at=NOW(). Run the resolution manually (see migrations/manual/resolve_duplicate_active_sessions.sql), then re-run this migration.',
            dup_count, dup_details;
    END IF;
END $$;

DROP INDEX IF EXISTS uniq_restock_session_active_container;

CREATE UNIQUE INDEX IF NOT EXISTS ux_vt_restock_sessions_active_container
ON vt_restock_sessions (container_id)
WHERE status = 'active';

-- Manual rollback:
-- DROP INDEX IF EXISTS ux_vt_restock_sessions_active_container;
