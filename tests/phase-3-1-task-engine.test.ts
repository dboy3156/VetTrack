import { describe, it, expect } from "vitest";
import {
  dbStatusToServiceStatus,
  isTaskActive,
  toServiceTask,
  type AppointmentLike,
} from "../server/domain/service-task.adapter.js";

describe("Phase 3.1 Smart Task Engine (adapter + lifecycle helpers)", () => {
  it("dbStatusToServiceStatus maps pending", () => {
    expect(dbStatusToServiceStatus("pending")).toBe("pending");
  });

  it("dbStatusToServiceStatus maps assigned", () => {
    expect(dbStatusToServiceStatus("assigned")).toBe("assigned");
  });

  it("dbStatusToServiceStatus maps scheduled to assigned", () => {
    expect(dbStatusToServiceStatus("scheduled")).toBe("assigned");
  });

  it("dbStatusToServiceStatus maps arrived to assigned", () => {
    expect(dbStatusToServiceStatus("arrived")).toBe("assigned");
  });

  it("dbStatusToServiceStatus maps in_progress", () => {
    expect(dbStatusToServiceStatus("in_progress")).toBe("in_progress");
  });

  it("dbStatusToServiceStatus maps completed", () => {
    expect(dbStatusToServiceStatus("completed")).toBe("completed");
  });

  it("dbStatusToServiceStatus maps cancelled", () => {
    expect(dbStatusToServiceStatus("cancelled")).toBe("cancelled");
  });

  it("dbStatusToServiceStatus maps no_show to cancelled", () => {
    expect(dbStatusToServiceStatus("no_show")).toBe("cancelled");
  });

  it("isTaskActive returns true for pending", () => {
    expect(isTaskActive("pending")).toBe(true);
  });

  it("isTaskActive returns true for assigned", () => {
    expect(isTaskActive("assigned")).toBe(true);
  });

  it("isTaskActive returns true for in_progress", () => {
    expect(isTaskActive("in_progress")).toBe(true);
  });

  it("isTaskActive returns false for completed", () => {
    expect(isTaskActive("completed")).toBe(false);
  });

  it("isTaskActive returns false for cancelled", () => {
    expect(isTaskActive("cancelled")).toBe(false);
  });

  it("toServiceTask with pending status maps technicianId to null", () => {
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
    expect(stPending.technicianId).toBe(null);
  });

  it("toServiceTask with pending status preserves pending", () => {
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
    expect(stPending.status).toBe("pending");
  });
});
