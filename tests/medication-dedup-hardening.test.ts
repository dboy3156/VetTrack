import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

async function run(): Promise<void> {
  console.log("\n-- medication de-duplication hardening");

  const migration = fs.readFileSync(path.join(root, "migrations", "054_medication_tasks_open_dedup.sql"), "utf8");
  assert.ok(
    migration.includes("vt_med_tasks_open_animal_drug_route_uq") &&
      migration.includes("WHERE status IN ('pending', 'in_progress')") &&
      migration.includes("(clinic_id, animal_id, drug_id, route)"),
    "054 migration defines partial unique index on open medication tasks",
  );

  const medService = fs.readFileSync(path.join(root, "server", "services", "medication-tasks.service.ts"), "utf8");
  assert.ok(
    medService.includes("findOpenMedicationTaskDuplicate") &&
      medService.includes("DUPLICATE_ACTIVE_MEDICATION_TASK") &&
      medService.includes("isPostgresUniqueViolation"),
    "medication-tasks service blocks duplicate open tasks",
  );

  const apptService = fs.readFileSync(path.join(root, "server", "services", "appointments.service.ts"), "utf8");
  assert.ok(
    apptService.includes("findOpenDuplicateMedicationAppointment") &&
      apptService.includes("DUPLICATE_ACTIVE_MEDICATION_TASK") &&
      apptService.includes("resolveMedicationDedupFingerprint"),
    "appointments service blocks duplicate active medication tasks",
  );

  const medRoute = fs.readFileSync(path.join(root, "server", "routes", "medication-tasks.ts"), "utf8");
  assert.ok(medRoute.includes("details: err.details"), "medication-tasks route returns error details");

  console.log("medication-dedup-hardening.test.ts passed");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
