-- Migration 077: Integration config control-plane metadata (JSON)
-- Holds ownership, SLA, flags, migration state, etc. — validated at API boundary (Zod).

ALTER TABLE vt_integration_configs
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN vt_integration_configs.metadata IS 'Integration control-plane metadata (ownership, SLA, migration, flags). See server/integrations/config-metadata.ts';
