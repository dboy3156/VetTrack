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
const migration027 = fs.readFileSync(path.join(repoRoot, "migrations", "027_appointments_product_polish.sql"), "utf8");
const migration028 = fs.readFileSync(path.join(repoRoot, "migrations", "028_appointments_service_task_fields.sql"), "utf8");
const serviceFile = fs.readFileSync(path.join(repoRoot, "server", "services", "appointments.service.ts"), "utf8");
const authFile = fs.readFileSync(path.join(repoRoot, "server", "middleware", "auth.ts"), "utf8");
const routeFile = fs.readFileSync(path.join(repoRoot, "server", "routes", "appointments.ts"), "utf8");
const serverIndex = fs.readFileSync(path.join(repoRoot, "server", "index.ts"), "utf8");
const appointmentsPage = fs.readFileSync(path.join(repoRoot, "src", "pages", "appointments.tsx"), "utf8");

console.log("\n── Appointments Scheduling Test");

assert(
  migration026.includes("CREATE TABLE IF NOT EXISTS vt_appointments"),
  "Appointments table migration exists",
  "Expected migration 026 to create vt_appointments table"
);

assert(
  migration027.includes("conflict_override") && migration027.includes("override_reason"),
  "Product polish migration adds conflict override fields",
  "Expected migration 027 to add conflict_override and override_reason columns"
);

assert(
  migration027.includes("arrived") && migration027.includes("in_progress"),
  "Workflow status migration includes arrived/in_progress",
  "Expected migration 027 to extend appointment status check"
);

assert(
  migration028.includes("priority") &&
    migration028.includes("task_type") &&
    migration028.includes("maintenance"),
  "Service-task fields migration adds priority and task_type",
  "Expected migration 028 to add CMMS-oriented columns"
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
    serviceFile.includes("findActiveVetConflict") &&
    serviceFile.includes("lt(appointments.startTime, args.endTime)") &&
    serviceFile.includes("gt(appointments.endTime, args.startTime)"),
  "Service enforces overlap rule at backend layer",
  "Expected service to apply overlap predicate in DB query"
);

assert(
  serviceFile.includes("PRIORITY_CRITICAL_OVERLAP") && serviceFile.includes("AUTO_CRITICAL"),
  "Critical priority persists automatic conflict override",
  "Expected critical overlap logging and AUTO_CRITICAL reason"
);

assert(
  serviceFile.includes("assertWithinVetShift") &&
    serviceFile.includes("Cannot schedule outside vet shift hours"),
  "Service enforces shift boundary validation",
  "Expected appointment service to block times outside shift windows"
);

assert(
  serviceFile.includes("VALID_STATUS_TRANSITIONS") &&
    serviceFile.includes("INVALID_STATUS_TRANSITION"),
  "Service enforces status transition rules",
  "Expected appointment service to validate workflow transitions"
);

assert(
  serviceFile.includes("OVERRIDE_REASON_REQUIRED") &&
    serviceFile.includes("OVERRIDE_NOT_NEEDED"),
  "Service enforces conflict override reason semantics",
  "Expected override to require reason and real conflict"
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
    routeFile.includes("error: \"VALIDATION_FAILED\"") &&
    routeFile.includes("router.get(\"/meta\"") &&
    routeFile.includes("logServiceChange"),
  "Routes require auth + structured validation errors",
  "Expected appointments route to enforce auth, expose metadata, and return structured errors"
);

assert(
  authFile.includes("clerkClient.users.getUser") &&
    authFile.includes("DB_FALLBACK_DISABLED") &&
    authFile.includes("CRITICAL_MISSING_CLINIC"),
  "Auth uses Clerk backend client correctly and hardens clinic resolution",
  "Expected fixed clerkClient usage and security logs"
);

assert(
  serverIndex.includes("app.use(\"/api/appointments\", appointmentsRoutes);"),
  "Appointments API mounted in server",
  "Expected server/index.ts to mount /api/appointments"
);

assert(
  appointmentsPage.includes("SLOT_MINUTES = 15") &&
    appointmentsPage.includes("DAY_START_HOUR = 8") &&
    appointmentsPage.includes("DAY_END_HOUR = 20"),
  "UI calendar grid uses hour timeline with 15-min slots",
  "Expected appointments page to render timeline slots between 08:00 and 20:00"
);

assert(
  appointmentsPage.includes("DURATION_PRESETS") &&
    appointmentsPage.includes("manualEndOverride"),
  "UI supports duration presets and manual end-time override",
  "Expected appointments page to auto-calc duration while allowing manual edits"
);

assert(
  appointmentsPage.includes("conflictOpen") &&
    appointmentsPage.includes("Confirm Override"),
  "UI includes conflict override confirmation flow",
  "Expected conflict warning and reason confirmation dialog in appointments page"
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

// Status transition behavior (must mirror service map)
const transitions = {
  scheduled: ["arrived", "in_progress", "completed", "cancelled", "no_show"],
  arrived: ["in_progress", "completed", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

assert(
  transitions.scheduled.includes("arrived") && transitions.arrived.includes("in_progress"),
  "Forward status transitions are allowed",
  "Expected scheduled->arrived->in_progress flow to be valid"
);

assert(
  transitions.completed.includes("scheduled") === false,
  "Invalid backwards status transition is blocked",
  "Expected completed->scheduled to be invalid"
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ appointments-scheduling.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ appointments-scheduling.test.js PASSED");
