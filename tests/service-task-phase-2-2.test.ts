import { describe, it, expect, afterAll } from "vitest";
import { createHash } from "node:crypto";
import { toAppointment, toServiceTask } from "../server/domain/service-task.adapter.js";
import { isServiceTaskModeForUser, serviceTaskModeBucket } from "../server/lib/feature-flags.js";

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

const prev = { ...process.env };

afterAll(() => {
  process.env = prev;
});

describe("Phase 2.2 service-task adapter + flags", () => {
  it("toServiceTask maps assetId from animalId", () => {
    const st = toServiceTask(sample);
    expect(st.assetId).toBe("animal-x");
  });

  it("toServiceTask maps locationId from ownerId", () => {
    const st = toServiceTask(sample);
    expect(st.locationId).toBe("owner-y");
  });

  it("toServiceTask maps technicianId from vetId", () => {
    const st = toServiceTask(sample);
    expect(st.technicianId).toBe("vet-z");
  });

  it("toServiceTask maps scheduled status to assigned", () => {
    const st = toServiceTask(sample);
    expect(st.status).toBe("assigned");
  });

  it("toServiceTask preserves priority", () => {
    const st = toServiceTask(sample);
    expect(st.priority).toBe("normal");
  });

  it("toServiceTask preserves taskType", () => {
    const st = toServiceTask(sample);
    expect(st.taskType).toBe("inspection");
  });

  it("toAppointment round-trips animalId", () => {
    const st = toServiceTask(sample);
    const back = toAppointment(st);
    expect(back.animalId).toBe(sample.animalId);
  });

  it("toAppointment round-trips ownerId", () => {
    const st = toServiceTask(sample);
    const back = toAppointment(st);
    expect(back.ownerId).toBe(sample.ownerId);
  });

  it("toAppointment round-trips vetId", () => {
    const st = toServiceTask(sample);
    const back = toAppointment(st);
    expect(back.vetId).toBe(sample.vetId);
  });

  it("isServiceTaskModeForUser returns false when flag is disabled", () => {
    process.env.ENABLE_SERVICE_TASK_MODE = "false";
    process.env.SERVICE_TASK_MODE_PERCENT = "100";
    expect(isServiceTaskModeForUser("u1")).toBe(false);
  });

  it("isServiceTaskModeForUser returns false when percent is 0", () => {
    process.env.ENABLE_SERVICE_TASK_MODE = "true";
    process.env.SERVICE_TASK_MODE_PERCENT = "0";
    expect(isServiceTaskModeForUser("u1")).toBe(false);
  });

  it("isServiceTaskModeForUser returns true when flag enabled and percent 100", () => {
    process.env.ENABLE_SERVICE_TASK_MODE = "true";
    process.env.SERVICE_TASK_MODE_PERCENT = "100";
    expect(isServiceTaskModeForUser("u1")).toBe(true);
  });

  it("serviceTaskModeBucket is stable for same input", () => {
    process.env.SERVICE_TASK_MODE_PERCENT = "50";
    const stable = (id: string) => serviceTaskModeBucket(id);
    expect(stable("user-abc")).toBe(stable("user-abc"));
  });

  it("serviceTaskModeBucket differs for different inputs", () => {
    const stable = (id: string) => serviceTaskModeBucket(id);
    expect(stable("user-aaa")).not.toBe(stable("user-bbb"));
  });

  it("serviceTaskModeBucket matches sha256 digest algorithm", () => {
    const digest = createHash("sha256").update("user-abc", "utf8").digest();
    expect(digest[0]! % 100).toBe(serviceTaskModeBucket("user-abc"));
  });
});
