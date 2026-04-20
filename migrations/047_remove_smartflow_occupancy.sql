-- Remove the 'smartflow' value from the vt_occupancy_source enum.
-- PostgreSQL does not support DROP VALUE on an enum, so we:
--   1. Migrate any existing 'smartflow' rows to 'manual'
--   2. Swap the column to a new enum that only has 'manual'
--   3. Drop the old enum and rename the new one

-- Step 1: coerce any remaining smartflow occupancy records to manual
UPDATE vt_patient_room_assignments
SET source = 'manual'
WHERE source = 'smartflow';

-- Step 2: create the replacement enum
CREATE TYPE vt_occupancy_source_v2 AS ENUM ('manual');

-- Step 3: swap the column type
ALTER TABLE vt_patient_room_assignments
  ALTER COLUMN source TYPE vt_occupancy_source_v2
  USING source::text::vt_occupancy_source_v2;

-- Step 4: drop the old enum and rename the new one
DROP TYPE vt_occupancy_source;
ALTER TYPE vt_occupancy_source_v2 RENAME TO vt_occupancy_source;

-- Drop the SmartFlow sync state table if it exists (legacy SmartFlow schema)
DROP TABLE IF EXISTS vt_smartflow_sync_state;

-- Drop the smartflow external animal ID entries from the external IDs table if it exists
DELETE FROM vt_animal_external_ids WHERE system = 'smartflow'
  -- guard: only run if the table exists
  AND EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'vt_animal_external_ids');
