-- Align vt_appointments with Drizzle schema (medication task inventory container).
ALTER TABLE vt_appointments
  ADD COLUMN IF NOT EXISTS container_id TEXT;
