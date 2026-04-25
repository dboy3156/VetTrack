-- Migration 062: add billable tracking fields to vt_items
--
-- WHY: Without a billable flag, the system has no way to distinguish high-value
-- consumables that need scan-to-bill enforcement from low-cost supplies that
-- staff should not be required to track (the "cheap syringe" problem). Adding
-- is_billable and minimum_dispense_to_capture lets admins configure exactly
-- which items feed the leakage report and auto-billing logic.

ALTER TABLE vt_items
  ADD COLUMN IF NOT EXISTS is_billable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS minimum_dispense_to_capture integer NOT NULL DEFAULT 1;
