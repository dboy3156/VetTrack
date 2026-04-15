-- Phase 2 Scheduling: owners, animals, and appointments workflow tables.
-- Idempotent and multi-tenant scoped.

CREATE TABLE IF NOT EXISTS vt_owners (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_animals (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  owner_id TEXT REFERENCES vt_owners(id) ON DELETE SET NULL,
  name TEXT NOT NULL DEFAULT '',
  species TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS vt_appointments (
  id TEXT PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  animal_id TEXT REFERENCES vt_animals(id) ON DELETE SET NULL,
  owner_id TEXT REFERENCES vt_owners(id) ON DELETE SET NULL,
  vet_id TEXT NOT NULL REFERENCES vt_users(id) ON DELETE RESTRICT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS vt_owners_clinic_id_idx ON vt_owners (clinic_id);
CREATE INDEX IF NOT EXISTS vt_animals_clinic_id_idx ON vt_animals (clinic_id);
CREATE INDEX IF NOT EXISTS vt_animals_owner_id_idx ON vt_animals (owner_id);

CREATE INDEX IF NOT EXISTS vt_appointments_clinic_id_idx ON vt_appointments (clinic_id);
CREATE INDEX IF NOT EXISTS vt_appointments_vet_time_idx ON vt_appointments (clinic_id, vet_id, start_time, end_time);
CREATE INDEX IF NOT EXISTS vt_appointments_start_time_idx ON vt_appointments (clinic_id, start_time);

-- Hot-path overlap check index for active appointments.
CREATE INDEX IF NOT EXISTS vt_appointments_active_overlap_idx
  ON vt_appointments (clinic_id, vet_id, start_time, end_time)
  WHERE status IN ('scheduled', 'completed');
