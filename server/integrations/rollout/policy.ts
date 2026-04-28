import type { IntegrationConfig } from "../types.js";

export interface IntegrationRolloutPolicy {
  adapterId: string;

  resolveLifecycleStage(config: IntegrationConfig): string;

  evaluate(config: IntegrationConfig): {
    allowed: boolean;
    reason?: string;
    message?: string;
  };
}