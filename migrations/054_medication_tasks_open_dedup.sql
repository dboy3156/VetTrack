-- One open medication task per patient + drug + route (pending or in_progress only).
CREATE UNIQUE INDEX IF NOT EXISTS vt_med_tasks_open_animal_drug_route_uq
  ON vt_medication_tasks (clinic_id, animal_id, drug_id, route)
  WHERE status IN ('pending', 'in_progress');
