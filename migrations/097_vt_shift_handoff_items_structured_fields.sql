-- Structured Clinical Handoff: add mandatory structured fields to handoff items.
-- currentStability, pendingTasks, criticalWarnings enforce the three-field artifact schema.
ALTER TABLE vt_shift_handoff_items
  ADD COLUMN IF NOT EXISTS current_stability TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pending_tasks      TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS critical_warnings  TEXT NOT NULL DEFAULT '';
