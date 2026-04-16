-- VetTrack — ZERO ERROR AUTH: data-only alignment (Clerk = source of truth, DB = mirror).
-- Application auth is fail-closed; do not weaken it. Fix vt_users + Clerk org membership only.
-- Run against production DB after backup. Clerk Dashboard required for org_xxx per user.

-- TASK GROUP 1 — FULL DATA AUDIT (all rows)
-- IF result > 0 → not production-safe until fixed
SELECT id, clerk_id, clinic_id
FROM vt_users
WHERE clinic_id = 'legacy-clinic'
   OR clinic_id IS NULL;

-- Optional: audit active users only (soft-deleted excluded)
-- SELECT id, clerk_id, clinic_id FROM vt_users
-- WHERE deleted_at IS NULL AND (clinic_id = 'legacy-clinic' OR clinic_id IS NULL);

-- TASK GROUP 2 — CLERK (manual): for each clerk_id, confirm org membership; copy org_xxx

-- TASK GROUP 3 — FORCE ALIGNMENT (run once per bad row; use real org from Clerk)
-- UPDATE vt_users
-- SET clinic_id = '<org_xxx>'
-- WHERE clerk_id = '<clerk_id>';

-- TASK GROUP 4 — HARD VALIDATION
-- EXPECT 0
SELECT count(*) AS legacy_clinic_count FROM vt_users WHERE clinic_id = 'legacy-clinic';

-- EXPECT 0 (schema has NOT NULL; defensive)
SELECT count(*) AS null_clinic_count FROM vt_users WHERE clinic_id IS NULL;

-- TASK GROUP 5 — Session: JWT must carry org; user must have org active / selected in Clerk
-- TASK GROUP 6 — Backend: user.clinic_id === getAuth(req).orgId or TENANT_MISMATCH (correct)

-- TASK GROUP 7–8 — Real login test in app; zero ACCESS_DENIED for clinic reasons after alignment
