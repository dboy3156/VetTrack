-- Enforce medication task state invariants (last line of defense).
ALTER TABLE vt_medication_tasks
  ADD CONSTRAINT vt_med_tasks_chk_pending_no_completed_at
  CHECK (status <> 'pending' OR completed_at IS NULL);

ALTER TABLE vt_medication_tasks
  ADD CONSTRAINT vt_med_tasks_chk_pending_no_assignee
  CHECK (status <> 'pending' OR assigned_to IS NULL);

ALTER TABLE vt_medication_tasks
  ADD CONSTRAINT vt_med_tasks_chk_completed_requires_timestamps
  CHECK (status <> 'completed' OR (completed_at IS NOT NULL AND assigned_to IS NOT NULL));

ALTER TABLE vt_medication_tasks
  ADD CONSTRAINT vt_med_tasks_chk_in_progress_requires_assignee
  CHECK (status <> 'in_progress' OR assigned_to IS NOT NULL);
