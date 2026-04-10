-- Migration 015: Asset Radar & NFC Room Reset — Phase 1 Schema
-- Creates vt_rooms table and extends vt_equipment with room FK,
-- NFC tag ID, and verification metadata fields.

-- ── 1. Rooms table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vt_rooms (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  floor            TEXT,
  master_nfc_tag_id TEXT UNIQUE,
  sync_status      VARCHAR(20) NOT NULL DEFAULT 'stale',
  last_audit_at    TIMESTAMP,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT vt_rooms_name_unique UNIQUE (name)
);

-- ── 2. Equipment extensions ───────────────────────────────────────────────────

-- 2a. Normalised room FK (nullable — existing rows have no room assigned yet)
ALTER TABLE vt_equipment
  ADD COLUMN IF NOT EXISTS room_id TEXT
    REFERENCES vt_rooms (id) ON DELETE SET NULL;

-- 2b. NFC tag ID — unique per physical tag chip
ALTER TABLE vt_equipment
  ADD COLUMN IF NOT EXISTS nfc_tag_id TEXT;

ALTER TABLE vt_equipment
  DROP CONSTRAINT IF EXISTS vt_equipment_nfc_tag_id_unique;

ALTER TABLE vt_equipment
  ADD CONSTRAINT vt_equipment_nfc_tag_id_unique UNIQUE (nfc_tag_id);

-- 2c. Verification metadata
ALTER TABLE vt_equipment
  ADD COLUMN IF NOT EXISTS last_verified_at   TIMESTAMP;

ALTER TABLE vt_equipment
  ADD COLUMN IF NOT EXISTS last_verified_by_id TEXT;

-- ── 3. Indexes ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_equipment_room_id
  ON vt_equipment (room_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_equipment_nfc_tag_id
  ON vt_equipment (nfc_tag_id)
  WHERE nfc_tag_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rooms_master_nfc_tag_id
  ON vt_rooms (master_nfc_tag_id)
  WHERE master_nfc_tag_id IS NOT NULL;
