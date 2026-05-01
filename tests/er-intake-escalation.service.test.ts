import { describe, it, expect } from "vitest";
import {
  computeInitialEscalatesAt,
  DEFAULT_ER_INTAKE_ESCALATE_LOW_MINUTES,
  DEFAULT_ER_INTAKE_ESCALATE_MEDIUM_MINUTES,
} from "../server/services/er-intake-escalation.service.js";

describe("computeInitialEscalatesAt", () => {
  const now = new Date("2026-05-01T12:00:00.000Z");

  it("schedules low tier using clinic low window", () => {
    const at = computeInitialEscalatesAt({
      severity: "low",
      now,
      escalateLowMinutes: 10,
      escalateMediumMinutes: 99,
    });
    expect(at?.toISOString()).toBe(new Date(now.getTime() + 10 * 60_000).toISOString());
  });

  it("schedules medium tier using clinic medium window", () => {
    const at = computeInitialEscalatesAt({
      severity: "medium",
      now,
      escalateLowMinutes: 99,
      escalateMediumMinutes: 12,
    });
    expect(at?.toISOString()).toBe(new Date(now.getTime() + 12 * 60_000).toISOString());
  });

  it("returns null for high and critical", () => {
    expect(
      computeInitialEscalatesAt({
        severity: "high",
        now,
        escalateLowMinutes: DEFAULT_ER_INTAKE_ESCALATE_LOW_MINUTES,
        escalateMediumMinutes: DEFAULT_ER_INTAKE_ESCALATE_MEDIUM_MINUTES,
      }),
    ).toBeNull();
    expect(
      computeInitialEscalatesAt({
        severity: "critical",
        now,
        escalateLowMinutes: DEFAULT_ER_INTAKE_ESCALATE_LOW_MINUTES,
        escalateMediumMinutes: DEFAULT_ER_INTAKE_ESCALATE_MEDIUM_MINUTES,
      }),
    ).toBeNull();
  });
});
