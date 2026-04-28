import { describe, it, expect, vi } from "vitest";

const { cacheGet, cacheSet, cacheDel } = vi.hoisted(() => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
  cacheDel: vi.fn(),
}));

vi.mock("../../server/lib/redis.js", () => ({
  cacheGet,
  cacheSet,
  cacheDel,
}));

import {
  getCachedIntegrationDashboard,
  invalidateIntegrationDashboardCache,
  integrationDashboardCacheKey,
} from "../../server/integrations/dashboard/dashboard-cache.js";
import type { IntegrationDashboardV1 } from "../../server/integrations/contracts/dashboard.v1.js";

function minimalDashboard(clinicId: string): IntegrationDashboardV1 {
  return {
    schemaVersion: 1,
    clinicId,
    readiness: {
      inboundPatients: false,
      inboundInventory: false,
      inboundAppointments: false,
      outboundBilling: false,
    },
    freshness: {},
    conflicts: { openCount: 0, openConflictsCount: 0 },
    breaker: { open: false },
    failures: { last24h: 0 },
    mappingConfidence: null,
    providers: [],
    globalStatus: "healthy",
  };
}

describe("integration dashboard cache", () => {
  it("uses redis key integration:dashboard:{clinicId}", () => {
    expect(integrationDashboardCacheKey("c1")).toBe("integration:dashboard:c1");
  });

  it("on miss: builds once and cacheSet with TTL 30", async () => {
    cacheGet.mockResolvedValueOnce(null);
    cacheSet.mockResolvedValueOnce(true);

    let builds = 0;
    await getCachedIntegrationDashboard("clinic-a", async () => {
      builds++;
      return minimalDashboard("clinic-a");
    });

    expect(builds).toBe(1);
    expect(cacheSet).toHaveBeenCalledWith(
      "integration:dashboard:clinic-a",
      expect.objectContaining({ schemaVersion: 1, clinicId: "clinic-a" }),
      30,
    );
  });

  it("on hit: returns cached payload without calling builder", async () => {
    const cached = minimalDashboard("clinic-b");
    cacheGet.mockResolvedValueOnce(cached);

    let builds = 0;
    const out = await getCachedIntegrationDashboard("clinic-b", async () => {
      builds++;
      return minimalDashboard("clinic-b");
    });

    expect(builds).toBe(0);
    expect(out.clinicId).toBe("clinic-b");
  });

  it("invalidateIntegrationDashboardCache deletes key", async () => {
    cacheDel.mockResolvedValueOnce(undefined);
    await invalidateIntegrationDashboardCache("clinic-z");
    expect(cacheDel).toHaveBeenCalledWith("integration:dashboard:clinic-z");
  });
});
