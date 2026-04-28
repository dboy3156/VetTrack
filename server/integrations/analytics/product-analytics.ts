/**
 * Product analytics — Phase A §17 stub (zeros + stub:true until Phase D aggregates).
 */

export interface IntegrationProductAnalyticsV1 {
  schemaVersion: 1;
  /** Present until real aggregates ship — callers must not treat as authoritative. */
  stub: true;
  clinicsConnectedByAdapter: Record<string, number>;
  tierDistribution: Record<string, number>;
  meteringEligibleClinics: number;
}

export function buildProductAnalyticsStub(): IntegrationProductAnalyticsV1 {
  return {
    schemaVersion: 1,
    stub: true,
    clinicsConnectedByAdapter: {},
    tierDistribution: {},
    meteringEligibleClinics: 0,
  };
}
