-- Manual resolution: keep latest active session per container (by started_at), finish others.
-- Schema uses status = 'finished' and finished_at (not closed / closed_at).
-- Review the preview SELECT before uncommenting the UPDATE.

BEGIN;

-- Preview rows that would be closed (older active sessions when a newer active exists):
SELECT s.id, s.container_id, s.started_at
FROM vt_restock_sessions s
WHERE s.status = 'active'
  AND EXISTS (
    SELECT 1
    FROM vt_restock_sessions s2
    WHERE s2.container_id = s.container_id
      AND s2.status = 'active'
      AND s2.started_at > s.started_at
  );

-- Apply (uncomment after review):
-- UPDATE vt_restock_sessions s
-- SET status = 'finished', finished_at = NOW()
-- WHERE s.status = 'active'
--   AND EXISTS (
--     SELECT 1
--     FROM vt_restock_sessions s2
--     WHERE s2.container_id = s.container_id
--       AND s2.status = 'active'
--       AND s2.started_at > s.started_at
--   );

COMMIT;
