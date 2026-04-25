-- Add preferred_locale to vt_users for per-user push notification localisation.
-- Defaults to 'he' for existing users (current operational locale).
ALTER TABLE vt_users
  ADD COLUMN IF NOT EXISTS preferred_locale VARCHAR(10) NOT NULL DEFAULT 'he';
