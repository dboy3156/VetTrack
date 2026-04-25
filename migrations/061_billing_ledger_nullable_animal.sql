-- Migration 061: make vt_billing_ledger.animal_id nullable
--
-- WHY: billingLedger.animalId was NOT NULL, meaning staff could not create a
-- billing entry without a registered patient. This blocked consumable capture
-- in code-blue scenarios and for unlinked emergency dispenses. Making it
-- nullable allows immediate capture; animal linkage can be reconciled later.
-- The existing restock billing path already supplies animalId when available.

ALTER TABLE vt_billing_ledger
  ALTER COLUMN animal_id DROP NOT NULL;
