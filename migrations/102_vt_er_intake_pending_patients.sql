-- Pending patients: ambulation + Accept Patient claim

ALTER TABLE vt_er_intake_events ADD COLUMN IF NOT EXISTS ambulation VARCHAR(20);
ALTER TABLE vt_er_intake_events ADD COLUMN IF NOT EXISTS accepted_by_user_id TEXT REFERENCES vt_users(id) ON DELETE SET NULL;
