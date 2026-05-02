-- Migration 0022: Add er_mode_state column to vt_clinics
-- Aligns the database with the Drizzle schema definition in server/db.ts.
-- Safe to replay: IF NOT EXISTS guard makes this idempotent.

ALTER TABLE vt_clinics
  ADD COLUMN IF NOT EXISTS er_mode_state VARCHAR(20) NOT NULL DEFAULT 'disabled';
