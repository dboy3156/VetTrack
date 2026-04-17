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

const repoRoot = path.resolve(__dirname, "..");
const appointments = fs.readFileSync(path.join(repoRoot, "server", "routes", "appointments.ts"), "utf8");
const tasks = fs.readFileSync(path.join(repoRoot, "server", "routes", "tasks.ts"), "utf8");
const users = fs.readFileSync(path.join(repoRoot, "server", "routes", "users.ts"), "utf8");
const metrics = fs.readFileSync(path.join(repoRoot, "server", "routes", "metrics.ts"), "utf8");
const queue = fs.readFileSync(path.join(repoRoot, "server", "routes", "queue.ts"), "utf8");
const realtime = fs.readFileSync(path.join(repoRoot, "server", "routes", "realtime.ts"), "utf8");
const health = fs.readFileSync(path.join(repoRoot, "server", "routes", "health.ts"), "utf8");
const shifts = fs.readFileSync(path.join(repoRoot, "server", "routes", "shifts.ts"), "utf8");
const support = fs.readFileSync(path.join(repoRoot, "server", "routes", "support.ts"), "utf8");
const rooms = fs.readFileSync(path.join(repoRoot, "server", "routes", "rooms.ts"), "utf8");
const folders = fs.readFileSync(path.join(repoRoot, "server", "routes", "folders.ts"), "utf8");
const whatsapp = fs.readFileSync(path.join(repoRoot, "server", "routes", "whatsapp.ts"), "utf8");
const analytics = fs.readFileSync(path.join(repoRoot, "server", "routes", "analytics.ts"), "utf8");
const auditLogs = fs.readFileSync(path.join(repoRoot, "server", "routes", "audit-logs.ts"), "utf8");
const activity = fs.readFileSync(path.join(repoRoot, "server", "routes", "activity.ts"), "utf8");
const alertAcks = fs.readFileSync(path.join(repoRoot, "server", "routes", "alert-acks.ts"), "utf8");
const stability = fs.readFileSync(path.join(repoRoot, "server", "routes", "stability.ts"), "utf8");
const testRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "test.ts"), "utf8");
const storage = fs.readFileSync(path.join(repoRoot, "server", "routes", "storage.ts"), "utf8");
const push = fs.readFileSync(path.join(repoRoot, "server", "routes", "push.ts"), "utf8");
const equipment = fs.readFileSync(path.join(repoRoot, "server", "routes", "equipment.ts"), "utf8");

console.log("\n── Phase 5 route error contract checks (static)");

assert(
  appointments.includes("resolveRequestId") &&
    appointments.includes("requestId") &&
    appointments.includes("code: \"VALIDATION_FAILED\"") &&
    appointments.includes("error: \"VALIDATION_FAILED\""),
  "Appointments route emits requestId and structured validation errors",
  "Expected appointments route errors to include code/error/reason/message/requestId",
);

assert(
  appointments.includes("sendServiceError(res, err, requestId)") &&
    appointments.includes("reason: err.code"),
  "Appointments service errors are mapped to contract",
  "Expected AppointmentServiceError path to include reason and requestId",
);

assert(
  tasks.includes("resolveRequestId") &&
    tasks.includes("apiError(") &&
    tasks.includes("code: \"UNAUTHORIZED\"") &&
    tasks.includes("code: \"INTERNAL_ERROR\""),
  "Tasks route emits structured unauthorized and internal errors",
  "Expected tasks route to use standardized API error helper",
);

assert(
  tasks.includes("sendServiceError(res, err, requestId)") &&
    tasks.includes("reason: \"TASK_START_FAILED\"") &&
    tasks.includes("reason: \"TASK_COMPLETE_FAILED\""),
  "Tasks service failures include explicit reasons and requestId",
  "Expected task mutation failure reasons in contract payloads",
);

assert(
  users.includes("resolveRequestId") &&
    users.includes("requestId") &&
    users.includes("code: \"UNAUTHORIZED\"") &&
    users.includes("code: \"FORBIDDEN\"") &&
    users.includes("code: \"NOT_FOUND\"") &&
    users.includes("code: \"INTERNAL_ERROR\""),
  "Users route emits standardized error schema with requestId",
  "Expected users route errors to include code/error/reason/message/requestId",
);

assert(
  metrics.includes("resolveRequestId") &&
    metrics.includes("reason: \"METRICS_FETCH_FAILED\""),
  "Metrics route emits standardized internal errors",
  "Expected metrics route internal error contract with requestId",
);

assert(
  queue.includes("resolveRequestId") &&
    queue.includes("reason: \"QUEUE_DLQ_FETCH_FAILED\""),
  "Queue route emits standardized internal errors",
  "Expected queue DLQ error contract with requestId",
);

assert(
  realtime.includes("resolveRequestId") &&
    realtime.includes("code: \"MISSING_CLINIC_ID\"") &&
    realtime.includes("reason: \"REALTIME_SUBSCRIBE_FAILED\""),
  "Realtime route emits standardized validation and internal errors",
  "Expected realtime route contract with requestId",
);

assert(
  health.includes("resolveRequestId") &&
    health.includes("reason: \"INVALID_HEALTH_TOKEN\"") &&
    health.includes("reason: \"DATA_INTEGRITY_HEALTH_FAILED\""),
  "Health data-integrity route emits standardized auth/internal errors",
  "Expected health route contract fields with requestId",
);

assert(
  shifts.includes("resolveRequestId") &&
    shifts.includes("reason: \"INVALID_CSV_UPLOAD\"") &&
    shifts.includes("reason: \"SHIFT_CSV_PREVIEW_FAILED\"") &&
    shifts.includes("reason: \"SHIFT_CSV_IMPORT_FAILED\"") &&
    shifts.includes("reason: \"SHIFTS_FETCH_FAILED\""),
  "Shifts route emits standardized upload/import/list errors",
  "Expected shifts route contract with requestId across error paths",
);

assert(
  support.includes("resolveRequestId") &&
    support.includes("reason: \"SUPPORT_TICKET_CREATE_FAILED\"") &&
    support.includes("reason: \"SUPPORT_TICKETS_LIST_FAILED\"") &&
    support.includes("reason: \"SUPPORT_TICKETS_COUNT_FAILED\"") &&
    support.includes("reason: \"SUPPORT_TICKET_NOT_FOUND\""),
  "Support route emits standardized ticket error contract",
  "Expected support route errors to include code/error/reason/message/requestId",
);

assert(
  rooms.includes("resolveRequestId") &&
    rooms.includes("reason: \"ROOM_NOT_FOUND\"") &&
    rooms.includes("reason: \"ROOM_NAME_CONFLICT\"") &&
    rooms.includes("reason: \"ROOM_NOT_EMPTY\"") &&
    rooms.includes("reason: \"ROOM_DELETE_FAILED\""),
  "Rooms route emits standardized room error contract",
  "Expected rooms route errors to include code/error/reason/message/requestId",
);

assert(
  folders.includes("resolveRequestId") &&
    folders.includes("reason: \"FOLDERS_LIST_FAILED\"") &&
    folders.includes("reason: \"FOLDER_NAME_REQUIRED\"") &&
    folders.includes("reason: \"FOLDER_NOT_FOUND\"") &&
    folders.includes("reason: \"FOLDER_DELETE_FAILED\""),
  "Folders route emits standardized folder error contract",
  "Expected folders route errors to include code/error/reason/message/requestId",
);

assert(
  whatsapp.includes("resolveRequestId") &&
    whatsapp.includes("reason: \"EQUIPMENT_NOT_FOUND\"") &&
    whatsapp.includes("reason: \"WHATSAPP_ALERT_CREATE_FAILED\""),
  "WhatsApp route emits standardized alert error contract",
  "Expected whatsapp route errors to include code/error/reason/message/requestId",
);

assert(
  analytics.includes("resolveRequestId") &&
    analytics.includes("reason: \"ANALYTICS_FETCH_FAILED\""),
  "Analytics route emits standardized analytics error contract",
  "Expected analytics route errors to include requestId and reason",
);

assert(
  auditLogs.includes("resolveRequestId") &&
    auditLogs.includes("reason: \"AUDIT_LOGS_FETCH_FAILED\""),
  "Audit logs route emits standardized audit error contract",
  "Expected audit-logs route errors to include requestId and reason",
);

assert(
  activity.includes("resolveRequestId") &&
    activity.includes("reason: \"INVALID_CURSOR\"") &&
    activity.includes("reason: \"ACTIVITY_FEED_FETCH_FAILED\"") &&
    activity.includes("reason: \"MY_SCAN_COUNT_FETCH_FAILED\""),
  "Activity route emits standardized validation and internal errors",
  "Expected activity route errors to include requestId and reason",
);

assert(
  alertAcks.includes("resolveRequestId") &&
    alertAcks.includes("reason: \"ALERT_ACKS_LIST_FAILED\"") &&
    alertAcks.includes("reason: \"MISSING_ALERT_ACK_FIELDS\"") &&
    alertAcks.includes("reason: \"ALERT_ACK_DELETE_FAILED\""),
  "Alert-acks route emits standardized acknowledgment errors",
  "Expected alert-acks route errors to include requestId and reason",
);

assert(
  stability.includes("resolveRequestId") &&
    stability.includes("reason: \"NOT_AVAILABLE_IN_PRODUCTION\"") &&
    stability.includes("reason: \"TEST_RUN_ALREADY_IN_PROGRESS\"") &&
    stability.includes("reason: \"INVALID_TEST_MODE_ENABLED\""),
  "Stability route emits standardized guard and validation errors",
  "Expected stability route errors to include requestId and reason",
);

assert(
  testRoute.includes("resolveRequestId") &&
    testRoute.includes("reason: \"TEST_MODE_DISABLED\"") &&
    testRoute.includes("reason: \"EQUIPMENT_NOT_CHECKED_OUT_BY_USER\""),
  "Test route emits standardized test-mode and scenario errors",
  "Expected test route errors to include requestId and reason",
);

assert(
  storage.includes("resolveRequestId") &&
    storage.includes("reason: \"OBJECT_STORAGE_NOT_CONFIGURED\"") &&
    storage.includes("reason: \"SIGNED_UPLOAD_URL_NOT_IMPLEMENTED\""),
  "Storage route emits standardized not-implemented errors",
  "Expected storage route errors to include requestId and reason",
);

assert(
  push.includes("resolveRequestId") &&
    push.includes("reason: \"PUSH_NOT_CONFIGURED\"") &&
    push.includes("reason: \"ENDPOINT_REQUIRED\"") &&
    push.includes("reason: \"PUSH_SUBSCRIBE_SAVE_FAILED\"") &&
    push.includes("reason: \"PUSH_SUBSCRIPTION_NOT_FOUND\"") &&
    push.includes("reason: \"PUSH_TEST_FAILED\""),
  "Push route emits standardized subscription and test errors",
  "Expected push route errors to include code/error/reason/message/requestId",
);

assert(
  equipment.includes("resolveRequestId") &&
    equipment.includes("reason: \"MY_EQUIPMENT_FETCH_FAILED\"") &&
    equipment.includes("reason: \"EQUIPMENT_LIST_FAILED\"") &&
    equipment.includes("reason: \"EQUIPMENT_NOT_FOUND\"") &&
    equipment.includes("reason: \"EXPECTED_RETURN_MINUTES_ADMIN_ONLY\"") &&
    equipment.includes("reason: \"EQUIPMENT_RESTORE_FAILED\"") &&
    equipment.includes("reason: \"EQUIPMENT_CHECKOUT_FAILED\"") &&
    equipment.includes("reason: \"EQUIPMENT_RETURN_FAILED\"") &&
    equipment.includes("reason: \"EQUIPMENT_SCAN_FAILED\"") &&
    equipment.includes("reason: \"UNDO_TOKEN_INVALID_OR_EXPIRED\"") &&
    equipment.includes("reason: \"EQUIPMENT_IMPORT_FAILED\"") &&
    equipment.includes("reason: \"EQUIPMENT_BULK_MOVE_FAILED\"") &&
    equipment.includes("reason: \"EQUIPMENT_BULK_VERIFY_FAILED\""),
  "Equipment route first slice emits standardized error contract",
  "Expected equipment CRUD/list/restore errors to include requestId and reason",
);

console.log(`\n${"─".repeat(48)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error(`\n❌ phase-5-route-error-contract.test.js FAILED (${failed} assertion(s) failed)`);
  process.exit(1);
}
console.log("\n✅ phase-5-route-error-contract.test.js PASSED");
