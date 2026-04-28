import type { IntegrationRolloutPolicy } from "./policy.js";
import type { IntegrationConfig } from "../types.js";
import { PRIZA_ADAPTER_ID } from "../adapters/priza.js";
import { isPrizaEnabled } from "../feature-flags.js";

function extractPrizaMeta(config: IntegrationConfig) {
  const m = config.metadata as Record<string, unknown> | null | undefined;
  const pm =
    m && typeof m === "object" && !Array.isArray(m)
      ? (m.priza as Record<string, unknown> | undefined)
      : undefined;

  return pm ?? {};
}

export const prizaPolicy: IntegrationRolloutPolicy = {
  adapterId: PRIZA_ADAPTER_ID,

  resolveLifecycleStage(config: IntegrationConfig) {
    const pm = extractPrizaMeta(config);
    const stage = pm.lifecycleStage;

    if (
      stage === "pre_integration" ||
      stage === "sandbox_ready" ||
      stage === "production_ready"
    ) {
      return stage;
    }

    return "pre_integration";
  },

  evaluate(config: IntegrationConfig) {
    if (!isPrizaEnabled()) {
      return {
        allowed: false,
        reason: "INTEGRATION_PRIZA_DISABLED",
        message: "Priza adapter is not enabled",
      };
    }

    const stage = this.resolveLifecycleStage(config);

    if (stage === "pre_integration") {
      return {
        allowed: false,
        reason: "PRIZA_PRE_INTEGRATION",
        message: "Blocked until sandbox_ready",
      };
    }

    const pm = extractPrizaMeta(config);

    const environment =
      typeof pm.environment === "string"
        ? pm.environment.trim().toLowerCase()
        : "sandbox";

    if (stage !== "production_ready" && environment === "production") {
      return {
        allowed: false,
        reason: "PRIZA_SANDBOX_ONLY",
        message: "Production access blocked until production_ready",
      };
    }

    return { allowed: true };
  },
};