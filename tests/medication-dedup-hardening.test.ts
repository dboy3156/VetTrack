import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

describe("Medication de-duplication hardening", () => {
  it("054 migration defines partial unique index on open medication tasks", () => {
    const migration = fs.readFileSync(path.join(root, "migrations", "054_medication_tasks_open_dedup.sql"), "utf8");
    expect(
      migration.includes("vt_med_tasks_open_animal_drug_route_uq") &&
        migration.includes("WHERE status IN ('pending', 'in_progress')") &&
        migration.includes("(clinic_id, animal_id, drug_id, route)"),
    ).toBeTruthy();
  });

  it("medication-tasks service blocks duplicate open tasks", () => {
    const medService = fs.readFileSync(path.join(root, "server", "services", "medication-tasks.service.ts"), "utf8");
    expect(
      medService.includes("findOpenMedicationTaskDuplicate") &&
        medService.includes("DUPLICATE_ACTIVE_MEDICATION_TASK") &&
        medService.includes("isPostgresUniqueViolation"),
    ).toBeTruthy();
  });

  it("appointments service blocks duplicate active medication tasks", () => {
    const apptService = fs.readFileSync(path.join(root, "server", "services", "appointments.service.ts"), "utf8");
    expect(
      apptService.includes("findOpenDuplicateMedicationAppointment") &&
        apptService.includes("DUPLICATE_ACTIVE_MEDICATION_TASK") &&
        apptService.includes("resolveMedicationDedupFingerprint"),
    ).toBeTruthy();
  });

  it("medication-tasks route returns error details", () => {
    const medRoute = fs.readFileSync(path.join(root, "server", "routes", "medication-tasks.ts"), "utf8");
    expect(medRoute.includes("details: err.details")).toBeTruthy();
  });
});
