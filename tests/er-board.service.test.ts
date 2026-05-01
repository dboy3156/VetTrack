import { describe, it, expect } from "vitest";
import {
  ER_INTAKE_OVERDUE_MINUTES,
  assembleErBoardResponse,
  isIntakeOverdue,
  laneForIntake,
  parseErSeverity,
  handoffItemRowToBoardItem,
} from "../server/services/er-board.service.js";

describe("parseErSeverity", () => {
  it("maps known values", () => {
    expect(parseErSeverity("critical")).toBe("critical");
    expect(parseErSeverity("LOW")).toBe("low");
  });
  it("defaults unknown to medium", () => {
    expect(parseErSeverity("")).toBe("medium");
    expect(parseErSeverity("nope")).toBe("medium");
  });
});

describe("laneForIntake", () => {
  const base = new Date("2026-05-01T12:00:00.000Z");

  it("puts critical severity in criticalNow", () => {
    expect(
      laneForIntake({
        severity: "critical",
        waitingSince: base,
        now: base,
      }),
    ).toBe("criticalNow");
  });

  it("puts overdue intake in criticalNow", () => {
    const waitStart = new Date(base.getTime() - (ER_INTAKE_OVERDUE_MINUTES + 5) * 60_000);
    expect(
      laneForIntake({
        severity: "medium",
        waitingSince: waitStart,
        now: base,
      }),
    ).toBe("criticalNow");
  });

  it("puts fresh non-critical intake in next15m", () => {
    expect(
      laneForIntake({
        severity: "high",
        waitingSince: base,
        now: base,
      }),
    ).toBe("next15m");
  });
});

describe("isIntakeOverdue", () => {
  it("returns false before threshold", () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    const ws = new Date(now.getTime() - 10 * 60_000);
    expect(isIntakeOverdue(ws, now)).toBe(false);
  });
  it("returns true after threshold", () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    const ws = new Date(now.getTime() - (ER_INTAKE_OVERDUE_MINUTES + 1) * 60_000);
    expect(isIntakeOverdue(ws, now)).toBe(true);
  });
});

describe("assembleErBoardResponse", () => {
  const now = new Date("2026-05-01T12:00:00.000Z");

  it("sorts next15m by id when waitingSince ties", () => {
    const lane = assembleErBoardResponse(
      "clinic-1",
      [
        {
          id: "b",
          severityRaw: "medium",
          status: "waiting",
          waitingSince: now,
          assignedUserId: null,
          assignedDisplayName: null,
          species: "Canine",
          ownerName: "Sam",
          animalName: null,
          chiefComplaint: "Cough",
        },
        {
          id: "a",
          severityRaw: "medium",
          status: "waiting",
          waitingSince: now,
          assignedUserId: null,
          assignedDisplayName: null,
          species: "Feline",
          ownerName: "Lee",
          animalName: null,
          chiefComplaint: "CI",
        },
      ],
      [],
      now,
    );
    expect(lane.lanes.next15m.map((x) => x.id)).toEqual(["a", "b"]);
    expect(lane.lanes.next15m[0]?.nextActionCode).toBe("assign_vet");
  });
});

describe("handoffItemRowToBoardItem", () => {
  it("always lands in handoffRisk", () => {
    const now = new Date("2026-05-01T12:00:00.000Z");
    const item = handoffItemRowToBoardItem(
      {
        id: "hi-1",
        waitingSince: now,
        etaMinutes: 5,
        slaOverdue: false,
        assignedUserId: "u1",
        assignedDisplayName: "Alex",
        patientLabel: "Felix",
        hospitalizationStatus: "critical",
      },
      now,
    );
    expect(item.lane).toBe("handoffRisk");
    expect(item.type).toBe("hospitalization");
    expect(item.nextActionCode).toBe("acknowledge_handoff");
  });
});
