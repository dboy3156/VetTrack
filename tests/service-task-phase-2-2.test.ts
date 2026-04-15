import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { toAppointment, toServiceTask } from "../server/domain/service-task.adapter.js";
import { isServiceTaskModeForUser, serviceTaskModeBucket } from "../server/lib/feature-flags.js";

async function run(): Promise<void> {
  console.log("\n-- Phase 2.2 service-task adapter + flags");

  const sample = {
    id: "a1",
    clinicId: "c1",
    animalId: "animal-x",
    ownerId: "owner-y",
    vetId: "vet-z",
    startTime: "2026-04-16T10:00:00.000Z",
    endTime: "2026-04-16T11:00:00.000Z",
    status: "scheduled" as const,
    conflictOverride: false,
    overrideReason: null,
    notes: null,
    priority: "normal" as const,
    taskType: "inspection" as const,
    createdAt: "2026-04-16T09:00:00.000Z",
    updatedAt: "2026-04-16T09:00:00.000Z",
  };

  const st = toServiceTask(sample);
  assert.equal(st.assetId, "animal-x");
  assert.equal(st.locationId, "owner-y");
  assert.equal(st.technicianId, "vet-z");
  assert.equal(st.priority, "normal");
  assert.equal(st.taskType, "inspection");

  const back = toAppointment(st);
  assert.equal(back.animalId, sample.animalId);
  assert.equal(back.ownerId, sample.ownerId);
  assert.equal(back.vetId, sample.vetId);

  const prev = { ...process.env };
  process.env.ENABLE_SERVICE_TASK_MODE = "false";
  process.env.SERVICE_TASK_MODE_PERCENT = "100";
  assert.equal(isServiceTaskModeForUser("u1"), false);

  process.env.ENABLE_SERVICE_TASK_MODE = "true";
  process.env.SERVICE_TASK_MODE_PERCENT = "0";
  assert.equal(isServiceTaskModeForUser("u1"), false);

  process.env.SERVICE_TASK_MODE_PERCENT = "100";
  assert.equal(isServiceTaskModeForUser("u1"), true);

  process.env.SERVICE_TASK_MODE_PERCENT = "50";
  const stable = (id: string) => serviceTaskModeBucket(id);
  assert.equal(stable("user-abc"), stable("user-abc"));
  assert.notEqual(stable("user-aaa"), stable("user-bbb"));

  const digest = createHash("sha256").update("user-abc", "utf8").digest();
  assert.equal(digest[0]! % 100, serviceTaskModeBucket("user-abc"));

  process.env = prev;

  console.log("  PASS: phase 2.2 adapter + rollout helpers");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
