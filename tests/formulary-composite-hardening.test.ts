import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function readRel(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

async function run(): Promise<void> {
  console.log("\n-- formulary-composite-hardening");

  const m055 = readRel("migrations/055_formulary_composite_columns.sql");
  assert.match(m055, /generic_name/i, "055 should add generic_name");
  assert.match(m055, /brand_names/i, "055 should add brand_names");

  const m056 = readRel("migrations/056_formulary_composite_unique.sql");
  assert.match(m056, /vt_drug_formulary_clinic_generic_conc_uq/i, "056 should define composite unique index name");
  assert.match(m056, /lower\s*\(\s*trim\s*\(\s*generic_name\s*\)\s*\)/i, "056 should index lower(trim(generic_name))");
  assert.match(m056, /WHERE\s+deleted_at\s+IS\s+NULL/i, "056 partial unique should scope to active rows");
  assert.match(m056, /ALTER\s+COLUMN\s+generic_name\s+SET\s+NOT\s+NULL/i, "056 should enforce generic_name NOT NULL");

  const formularyRoute = readRel("server/routes/formulary.ts");
  assert.match(formularyRoute, /FORMULARY_DUPLICATE_GENERIC_CONCENTRATION/, "formulary route should expose duplicate reason");
  assert.match(formularyRoute, /genericName:\s*z\.string\(\)/, "formulary Zod should require genericName string");

  console.log("  PASS: formulary-composite-hardening");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
