-- Migration 043: Fix active session index replay safety
-- Ensures all environments converge to a single, correctly named unique partial index
-- on vt_restock_sessions(container_id) WHERE status = 'active'.
-- (Outer transaction is provided by scripts/run-migrations.ts.)

-- Step 1: Drop both possible legacy index names (idempotent)
DROP INDEX IF EXISTS uniq_restock_session_active_container;
DROP INDEX IF EXISTS ux_vt_restock_sessions_active_container;

-- Step 2: Duplicate guard — fail loudly if data violates the invariant
DO $$
DECLARE
    dup_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO dup_count
    FROM (
        SELECT container_id
        FROM vt_restock_sessions
        WHERE status = 'active'
        GROUP BY container_id
        HAVING COUNT(*) > 1
    ) d;

    IF dup_count > 0 THEN
        RAISE EXCEPTION
            'Migration 043 aborted: % container(s) have multiple active restock sessions. Resolve duplicates before re-running.',
            dup_count;
    END IF;
END $$;

-- Step 3: Recreate the canonical unique partial index
CREATE UNIQUE INDEX uniq_restock_session_active_container
    ON vt_restock_sessions (container_id)
    WHERE status = 'active';
