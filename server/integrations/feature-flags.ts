/**
 * Integration enqueue / worker gates — Phase A §11 + §13.
 * INTEGRATION_GLOBAL_KILL: emergency stop — no jobs enqueued, worker skips handlers.
 */

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** When set, integrations must not enqueue work or mutate external systems (worker skips after log). */
export function isIntegrationGloballyKilled(): boolean {
  return truthyEnv("INTEGRATION_GLOBAL_KILL");
}

/** When set, the Priza integration path is allowed in rollout policy (register adapter in the same deployment). */
export function isPrizaEnabled(): boolean {
  return truthyEnv("INTEGRATION_PRIZA_ENABLED");
}

export type IntegrationEnqueueBlockReason =
  | "integration_globally_killed"
  | "adapter_disabled"
  | "sync_flag_off";

export interface EvaluateEnqueueResult {
  allowed: boolean;
  reason?: IntegrationEnqueueBlockReason;
  message?: string;
}

/** Checked before BullMQ enqueue and at worker entry (belt-and-suspenders). */
export function evaluateIntegrationGloballyKill(): EvaluateEnqueueResult {
  if (isIntegrationGloballyKilled()) {
    return {
      allowed: false,
      reason: "integration_globally_killed",
      message: "INTEGRATION_GLOBAL_KILL is enabled — integration jobs are disabled",
    };
  }
  return { allowed: true };
}
