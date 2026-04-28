/**
 * Vendor X rollout gates — Phase C Sprint 5.
 */

import type { IntegrationCredentials } from "./types.js";
import { VENDOR_X_ADAPTER_ID } from "./adapters/vendor-x.js";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** True when the process has registered the Vendor X adapter (INTEGRATION_VENDOR_X_ENABLED). */
export function isVendorXIntegrationRegistered(): boolean {
  return truthyEnv("INTEGRATION_VENDOR_X_ENABLED");
}

export function getVendorXDeploymentEnvironment(metadata: unknown): "sandbox" | "production" {
  const m = metadata as Record<string, unknown> | null | undefined;
  const e = m?.environment;
  if (e === "production") return "production";
  return "sandbox";
}

export function mergeCredentialsWithVendorMetadata(
  credentials: IntegrationCredentials,
  metadata: unknown,
): IntegrationCredentials {
  const m = metadata as Record<string, unknown> | null | undefined;
  const env = m?.environment;
  if (typeof env === "string" && env.trim()) {
    return { ...credentials, environment: env.trim() };
  }
  return credentials;
}

export interface VendorXRolloutEvaluation {
  allowed: boolean;
  reason?: string;
  message?: string;
}

/**
 * Blocks sync when global env flag off, vendor flag disabled, or sandbox-only + production target.
 */
export function evaluateVendorXSyncRollout(metadata: unknown): VendorXRolloutEvaluation {
  if (!isVendorXIntegrationRegistered()) {
    return {
      allowed: false,
      reason: "INTEGRATION_VENDOR_X_DISABLED",
      message: "Vendor X adapter is not enabled for this deployment",
    };
  }

  const m = metadata as Record<string, unknown> | null | undefined;
  const flags = (m?.flags ?? {}) as Record<string, unknown>;

  if (flags.vendorXEnabled === false) {
    return {
      allowed: false,
      reason: "VENDOR_X_FLAG_DISABLED",
      message: "Vendor X is disabled in integration metadata.flags",
    };
  }

  if (flags.sandboxOnly === true && getVendorXDeploymentEnvironment(metadata) === "production") {
    return {
      allowed: false,
      reason: "SANDBOX_ONLY_BLOCKS_PRODUCTION",
      message: "sandboxOnly is true — inbound sync blocked for production environment",
    };
  }

  return { allowed: true };
}

export function isVendorXAdapter(adapterId: string): boolean {
  return adapterId === VENDOR_X_ADAPTER_ID;
}
