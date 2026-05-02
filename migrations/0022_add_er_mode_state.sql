-- Migration 0022: Add er_mode_state column to vt_clinics
-- Aligns the database with the Drizzle schema definition in server/db.ts.
-- Safe to replay: IF NOT EXISTS guard makes this idempotent.
--
-- Bootstrap guard: vt_clinics is created by 050_pharmacy_forecast.sql in the
-- original migration sequence. With numeric sort (or on any fresh DB) 0022
-- runs before 050. Pre-create the table with its primary key so the ALTER
-- below succeeds regardless of run order. 050_pharmacy_forecast.sql uses
-- ADD COLUMN IF NOT EXISTS for its own columns so nothing is lost.

CREATE TABLE IF NOT EXISTS vt_clinics (
  id TEXT PRIMARY KEY
);

ALTER TABLE vt_clinics
  ADD COLUMN IF NOT EXISTS er_mode_state VARCHAR(20) NOT NULL DEFAULT 'disabled';
