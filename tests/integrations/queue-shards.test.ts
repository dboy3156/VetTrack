import { describe, it, expect, afterEach, vi } from "vitest";
import {
  clinicShardIndex,
  getIntegrationShardCount,
  integrationQueueNameForClinic,
  integrationQueueNameForShard,
  listIntegrationWorkerQueueNames,
  INTEGRATION_QUEUE_LEGACY_NAME,
} from "../../server/queues/integration-shards.js";

describe("integration queue sharding", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("defaults to single legacy queue when env unset", () => {
    delete process.env.INTEGRATION_QUEUE_SHARDS;
    expect(getIntegrationShardCount()).toBe(1);
    expect(listIntegrationWorkerQueueNames()).toEqual([INTEGRATION_QUEUE_LEGACY_NAME]);
    expect(integrationQueueNameForClinic("clinic-a")).toBe(INTEGRATION_QUEUE_LEGACY_NAME);
  });

  it("uses integration-sync-0..N-1 when INTEGRATION_QUEUE_SHARDS>1", () => {
    vi.stubEnv("INTEGRATION_QUEUE_SHARDS", "4");
    expect(getIntegrationShardCount()).toBe(4);
    expect(listIntegrationWorkerQueueNames()).toEqual([
      "integration-sync-0",
      "integration-sync-1",
      "integration-sync-2",
      "integration-sync-3",
    ]);
    expect(integrationQueueNameForShard(2)).toBe("integration-sync-2");
  });

  it("clinicShardIndex is stable for same clinicId", () => {
    vi.stubEnv("INTEGRATION_QUEUE_SHARDS", "8");
    const a = clinicShardIndex("same-clinic", 8);
    const b = clinicShardIndex("same-clinic", 8);
    expect(a).toBe(b);
    expect(a).toBeGreaterThanOrEqual(0);
    expect(a).toBeLessThan(8);
  });
});
