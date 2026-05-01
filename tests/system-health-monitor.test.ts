import { describe, it, expect } from "vitest";
import {
  evaluateClinicCritical,
  evaluateClinicHealthReasons,
  GAP_RESYNC_DELTA_INFO,
  GAP_RESYNC_DELTA_WARNING,
  PUBLISH_LAG_MS_CRITICAL,
  PUBLISH_LAG_MS_WARNING,
} from "../server/services/system-health-monitor.js";
import type { OutboxHealthEvaluation } from "../server/lib/outbox-health.js";

function baseEv(over: Partial<OutboxHealthEvaluation>): OutboxHealthEvaluation {
  return {
    clinicId: "clinic_test",
    publish_lag_ms: null,
    outbox_size: 0,
    events_per_sec: 0,
    duplicate_drops_count: 0,
    gap_resync_count: 0,
    failed_publish_attempts: 0,
    dead_letter_count: 0,
    dlq_permanent_count: 0,
    dlq_transient_count: 0,
    dlq_unclassified_count: 0,
    ...over,
  };
}

describe("system health monitor — clinic severity tiers", () => {
  it("flags dead letter as CRITICAL", () => {
    const r = evaluateClinicHealthReasons(baseEv({ dead_letter_count: 2 }));
    expect(r.some((x) => x.code === "DEAD_LETTER" && x.severity === "CRITICAL")).toBe(true);
  });

  it("flags publish lag above critical threshold as CRITICAL", () => {
    const r = evaluateClinicHealthReasons(baseEv({ publish_lag_ms: PUBLISH_LAG_MS_CRITICAL + 1 }));
    expect(r.some((x) => x.code === "PUBLISH_LAG" && x.severity === "CRITICAL")).toBe(true);
  });

  it("flags lag between warning and critical as WARNING only", () => {
    const lag = PUBLISH_LAG_MS_WARNING + 1;
    expect(lag <= PUBLISH_LAG_MS_CRITICAL).toBe(true);
    const r = evaluateClinicHealthReasons(baseEv({ publish_lag_ms: lag }));
    expect(r.some((x) => x.code === "PUBLISH_LAG" && x.severity === "WARNING")).toBe(true);
    expect(r.some((x) => x.code === "PUBLISH_LAG" && x.severity === "CRITICAL")).toBe(false);
  });

  it("does not flag lag at or under warning threshold", () => {
    const r = evaluateClinicHealthReasons(baseEv({ publish_lag_ms: PUBLISH_LAG_MS_WARNING }));
    expect(r.some((x) => x.code === "PUBLISH_LAG")).toBe(false);
  });

  it("does not flag critical-tier lag at critical boundary (exclusive)", () => {
    const r = evaluateClinicHealthReasons(baseEv({ publish_lag_ms: PUBLISH_LAG_MS_CRITICAL }));
    expect(r.some((x) => x.code === "PUBLISH_LAG" && x.severity === "CRITICAL")).toBe(false);
    expect(r.some((x) => x.code === "PUBLISH_LAG" && x.severity === "WARNING")).toBe(true);
  });

  it("treats null lag as healthy", () => {
    const r = evaluateClinicHealthReasons(baseEv({ publish_lag_ms: null }));
    expect(r).toHaveLength(0);
  });
});

describe("system health monitor — legacy evaluateClinicCritical filter", () => {
  it("returns only CRITICAL reasons", () => {
    const criticalOnly = evaluateClinicCritical(
      baseEv({ publish_lag_ms: PUBLISH_LAG_MS_WARNING + 500, dead_letter_count: 0 }),
    );
    expect(criticalOnly.some((x) => x.code === "PUBLISH_LAG")).toBe(false);
  });

  it("includes DEAD_LETTER in legacy critical list", () => {
    const criticalOnly = evaluateClinicCritical(baseEv({ dead_letter_count: 1 }));
    expect(criticalOnly.some((x) => x.code === "DEAD_LETTER")).toBe(true);
  });
});

describe("gap resync spike thresholds (documentation)", () => {
  it("uses INFO < WARNING delta ordering", () => {
    expect(GAP_RESYNC_DELTA_INFO).toBeGreaterThan(0);
    expect(GAP_RESYNC_DELTA_WARNING).toBeGreaterThanOrEqual(GAP_RESYNC_DELTA_INFO);
  });
});
