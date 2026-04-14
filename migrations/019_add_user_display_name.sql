ALTER TABLE vt_users
ADD COLUMN IF NOT EXISTS display_name TEXT NOT NULL DEFAULT '';

UPDATE vt_users
SET display_name = COALESCE(NULLIF(name, ''), email)
WHERE display_name = '';
