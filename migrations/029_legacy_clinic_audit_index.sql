-- Supports operational queries to find rows that must be migrated off placeholder clinic id.
-- Application code rejects `legacy-clinic` in production; fix data and Clerk org membership.
CREATE INDEX IF NOT EXISTS idx_vt_users_clinic_id_legacy
  ON vt_users (clinic_id)
  WHERE clinic_id = 'legacy-clinic' AND deleted_at IS NULL;
