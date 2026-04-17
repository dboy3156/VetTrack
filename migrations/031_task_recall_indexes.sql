-- Phase 3.3: Daily Recall Engine — composite indexes for clinic-scoped task queries (idempotent).

CREATE INDEX IF NOT EXISTS vt_appointments_clinic_status_idx ON vt_appointments (clinic_id, status);
CREATE INDEX IF NOT EXISTS vt_appointments_clinic_start_idx ON vt_appointments (clinic_id, start_time);
CREATE INDEX IF NOT EXISTS vt_appointments_clinic_end_idx ON vt_appointments (clinic_id, end_time);
CREATE INDEX IF NOT EXISTS vt_appointments_clinic_vet_idx ON vt_appointments (clinic_id, vet_id);
