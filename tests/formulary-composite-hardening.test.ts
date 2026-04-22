import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

function readRel(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf-8");
}

describe("Formulary composite hardening", () => {
  it("055 migration adds generic_name column", () => {
    const m055 = readRel("migrations/055_formulary_composite_columns.sql");
    expect(m055).toMatch(/generic_name/i);
  });

  it("055 migration adds brand_names column", () => {
    const m055 = readRel("migrations/055_formulary_composite_columns.sql");
    expect(m055).toMatch(/brand_names/i);
  });

  it("056 migration defines composite unique index name", () => {
    const m056 = readRel("migrations/056_formulary_composite_unique.sql");
    expect(m056).toMatch(/vt_drug_formulary_clinic_generic_conc_uq/i);
  });

  it("056 migration indexes lower(trim(generic_name))", () => {
    const m056 = readRel("migrations/056_formulary_composite_unique.sql");
    expect(m056).toMatch(/lower\s*\(\s*trim\s*\(\s*generic_name\s*\)\s*\)/i);
  });

  it("056 partial unique index scopes to active rows", () => {
    const m056 = readRel("migrations/056_formulary_composite_unique.sql");
    expect(m056).toMatch(/WHERE\s+deleted_at\s+IS\s+NULL/i);
  });

  it("056 migration enforces generic_name NOT NULL", () => {
    const m056 = readRel("migrations/056_formulary_composite_unique.sql");
    expect(m056).toMatch(/ALTER\s+COLUMN\s+generic_name\s+SET\s+NOT\s+NULL/i);
  });

  it("formulary route exposes duplicate reason", () => {
    const formularyRoute = readRel("server/routes/formulary.ts");
    expect(formularyRoute).toMatch(/FORMULARY_DUPLICATE_GENERIC_CONCENTRATION/);
  });

  it("formulary Zod schema requires genericName as string", () => {
    const formularyRoute = readRel("server/routes/formulary.ts");
    expect(formularyRoute).toMatch(/genericName:\s*z\.string\(\)/);
  });
});
