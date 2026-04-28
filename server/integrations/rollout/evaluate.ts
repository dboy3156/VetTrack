import type { IntegrationConfig } from "../types.js";
import { getPolicy } from "./index.js";

export function evaluateIntegrationRollout(config: IntegrationConfig) {
  const policy = getPolicy(config.adapterId);

  if (!policy) {
    return {
      allowed: false,
      reason: "NO_POLICY",
      message: `No rollout policy registered for ${config.adapterId}`,
    };
  }

  return policy.evaluate(config);
}