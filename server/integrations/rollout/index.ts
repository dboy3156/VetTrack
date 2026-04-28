import type { IntegrationRolloutPolicy } from "./policy.js";
import { prizaPolicy } from "./priza-policy.js";

const policies = new Map<string, IntegrationRolloutPolicy>([
  [prizaPolicy.adapterId, prizaPolicy],
]);

export function getPolicy(adapterId: string): IntegrationRolloutPolicy | null {
  return policies.get(adapterId) ?? null;
}