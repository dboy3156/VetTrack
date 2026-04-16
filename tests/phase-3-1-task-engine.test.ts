import assert from "node:assert/strict";
import {
  dbStatusToServiceStatus,
  isTaskActive,
  toServiceTask,
  type AppointmentLike,
} from "../server/domain/service-task.adapter.js";

async function run(): Promise<void> {
  console.log("\n-- Phase 3.1 Smart Task Engine (adapter + lifecycle helpers)");

  assert.equal(dbStatusToServiceStatus("pending"), "pending");
  assert.equal(dbStatusToServiceStatus("assigned"), "assigned");
  assert.equal(dbStatusToServiceStatus("scheduled"), "assigned");
  assert.equal(dbStatusToServiceStatus("arrived"), "assigned");
  assert.equal(dbStatusToServiceStatus("in_progress"), "in_progress");
  assert.equal(dbStatusToServiceStatus("completed"), "completed");
  assert.equal(dbStatusToServiceStatus("cancelled"), "cancelled");
  assert.equal(dbStatusToServiceStatus("no_show"), "cancelled");

  assert.equal(isTaskActive("pending"), true);
  assert.equal(isTaskActive("assigned"), true);
  assert.equal(isTaskActive("in_progress"), true);
  assert.equal(isTaskActive("completed"), false);
  assert.equal(isTaskActive("cancelled"), false);

  const pendingLike: AppointmentLike = {
    id: "t1",
    clinicId: "c1",
    animalId: null,
    ownerId: null,
    vetId: null,
    startTime: "2026-04-16T10:00:00.000Z",
    endTime: "2026-04-16T11:00:00.000Z",
    status: "pending",
    conflictOverride: false,
    overrideReason: null,
    notes: null,
    priority: "high",
    taskType: "repair",
    createdAt: "2026-04-16T09:00:00.000Z",
    updatedAt: "2026-04-16T09:00:00.000Z",
  };
  const stPending = toServiceTask(pendingLike);
  assert.equal(stPending.technicianId, null);
  assert.equal(stPending.status, "pending");

  console.log("  PASS: phase 3.1 task engine adapter");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
