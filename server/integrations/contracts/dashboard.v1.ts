/**
 * HTTP JSON contract — GET /api/integrations/dashboard — Phase A §7 (API-only UI).
 */

export type IntegrationGlobalStatus =
  | "healthy"
  | "degraded"
  | "queue_unavailable";

export interface IntegrationDashboardProviderV1 {
  adapterId: string;
  displayName: string;
  enabled: boolean;
  lastSyncAt: string | null;
}

export interface IntegrationDashboardV1 {
  schemaVersion: 1;
  stub?: boolean;
  /** Phase C — Vendor X env flag (adapter registered), non-PHI */
  vendorX?: { adapterRegistered: boolean };
  clinicId: string;
  /** Phase B+: full readiness matrix; Phase A returns minimal placeholders. */
  readiness: {
    inboundPatients: boolean;
    inboundInventory: boolean;
    inboundAppointments: boolean;
    outboundBilling: boolean;
  };
  freshness: Record<string, string | null>;
  /** `openCount` and `openConflictsCount` are the same (alias for client migration). */
  conflicts: { openCount: number; openConflictsCount: number };
  breaker: { open: boolean };
  failures: { last24h: number };
  mappingConfidence: number | null;
  providers: IntegrationDashboardProviderV1[];
  globalStatus: IntegrationGlobalStatus;
}
