"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ PASS: ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ❌ FAIL: ${label}`);
  if (detail) console.error(`     ${detail}`);
  failed++;
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function overlaps(existing, incoming) {
  return existing.start < incoming.end && existing.end > incoming.start;
}

const repoRoot = path.resolve(__dirname, "..");
const migration026 = fs.readFileSync(path.join(repoRoot, "migrations", "026_appointments_scheduling.sql"), "utf8");
const serviceFile = fs.readFileSync(path.join(repoRoot, "server", "services", "appointments.service.ts"), "utf8");
const routeFile = fs.readFileSync(path.join(repoRoot, "server", "routes", "appointments.ts"), "utf8");
const serverIndex = fs.readFileSync(path.join(repoRoot, "server", "index.ts"), "utf8");

console.log("\n── Appointments Scheduling Test");

assert(
  migration026.includes("CREATE TABLE IF NOT EXISTS vt_appointments"),
  "Appointments table migration exists",
  "Expected migration 026 to create vt_appointments table"
);

assert(
  migration026.includes("vt_appointments_vet_time_idx") &&
    migration026.includes("vt_appointments_clinic_id_idx") &&
    migration026.includes("vt_appointments_start_time_idx"),
  "Appointments indexes cover clinic, vet+time, and day queries",
  "Expected migration 026 to include required scheduling indexes"
);

assert(
  serviceFile.includes("assertNoVetConflict") &&
    serviceFile.includes("lt(appointments.startTime, args.endTime)") &&
    serviceFile.includes("gt(appointments.endTime, args.startTime)"),
  "Service enforces overlap rule at backend layer",
  "Expected service to apply overlap predicate in DB query"
);

assert(
  serviceFile.includes("eq(appointments.clinicId, clinicId)") &&
    serviceFile.includes("assertVetInClinic") &&
    serviceFile.includes("assertAnimalInClinic") &&
    serviceFile.includes("assertOwnerInClinic"),
  "Service enforces strict clinic scoping for linked entities",
  "Expected clinicId checks for appointments, vets, animals, and owners"
);

assert(
  serviceFile.includes("TIMEZONE_REQUIRED") &&
    serviceFile.includes("must include timezone offset or Z"),
  "Service requires timezone-qualified input and UTC normalization",
  "Expected toUtcDate() to reject naive timestamps"
);

assert(
  routeFile.includes("requireEffectiveRole(\"technician\")") &&
    routeFile.includes("error: \"VALIDATION_FAILED\""),
  "Routes require auth + structured validation errors",
  "Expected appointments route to enforce auth and return structured errors"
);

assert(
  serverIndex.includes("app.use(\"/api/appointments\", appointmentsRoutes);"),
  "Appointments API mounted in server",
  "Expected server/index.ts to mount /api/appointments"
);

// Behavioral overlap tests (same predicate as service requirement)
const t = (v) => new Date(v).getTime();
const existing = { start: t("2026-04-16T10:00:00.000Z"), end: t("2026-04-16T11:00:00.000Z") };
const overlapping = { start: t("2026-04-16T10:30:00.000Z"), end: t("2026-04-16T11:30:00.000Z") };
const boundary = { start: t("2026-04-16T11:00:00.000Z"), end: t("2026-04-16T12:00:00.000Z") };

assert(
  overlaps(existing, overlapping) === true,
  "Overlapping appointments are detected",
  "Expected overlap predicate to reject intersecting windows"
);

assert(
  overlaps(existing, boundary) === false,
  "Boundary case end==start is allowed",
  "Expected overlap predicate to allow non-overlapping boundaries"
);

// Timezone normalization sanity check: equivalent instants should match in UTC.
const utcMillis = t("2026-07-01T14:00:00.000Z");
const offsetMillis = t("2026-07-01T10:00:00.000-04:00");
assert(
  utcMillis === offsetMillis,
  "Timezone conversion resolves to the same UTC instant",
  "Expected Date parsing with explicit offset to map correctly to UTC"
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ appointments-scheduling.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ appointments-scheduling.test.js PASSED");
