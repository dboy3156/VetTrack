/**
 * Integration registry.
 *
 * All available adapters are registered here. Adding a new integration:
 *   1. Create the adapter in adapters/<vendor-id>.ts
 *   2. Import and add it to the ADAPTERS map below
 *   3. Done — no other file needs to change
 */

import type { IntegrationAdapter } from "./adapters/base.js";
import { genericPmsAdapter } from "./adapters/generic-pms.js";

const ADAPTERS = new Map<string, IntegrationAdapter>([
  [genericPmsAdapter.id, genericPmsAdapter],
]);

/** Returns the adapter with the given id, or null if not registered. */
export function getAdapter(adapterId: string): IntegrationAdapter | null {
  return ADAPTERS.get(adapterId) ?? null;
}

/** Returns all registered adapters. */
export function listAdapters(): IntegrationAdapter[] {
  return Array.from(ADAPTERS.values());
}

/** Returns true if the given adapterId is registered. */
export function isKnownAdapter(adapterId: string): boolean {
  return ADAPTERS.has(adapterId);
}
