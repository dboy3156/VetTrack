-- Fix vt_rooms.name uniqueness from global to per-clinic.
-- Previously: UNIQUE (name) — blocked two clinics from having a room named "ICU".
-- Now: UNIQUE (clinic_id, name) — enforces uniqueness within a clinic only.

ALTER TABLE vt_rooms DROP CONSTRAINT IF EXISTS vt_rooms_name_unique;
DROP INDEX IF EXISTS vt_rooms_name_unique;

CREATE UNIQUE INDEX IF NOT EXISTS vt_rooms_clinic_name_unique
  ON vt_rooms (clinic_id, name);
