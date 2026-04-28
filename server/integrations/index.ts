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
import { vendorStubAdapters } from "./adapters/vendor-stubs.js";
import { localSandboxAdapter } from "./adapters/local-sandbox.js";
import { vendorXAdapter } from "./adapters/vendor-x.js";

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const entries: [string, IntegrationAdapter][] = [
  [genericPmsAdapter.id, genericPmsAdapter],
  ...vendorStubAdapters.map((a): [string, IntegrationAdapter] => [a.id, a]),
];

if (truthyEnv("INTEGRATION_VENDOR_X_ENABLED")) {
  entries.push([vendorXAdapter.id, vendorXAdapter]);
}

if (process.env.NODE_ENV === "development") {
  entries.push([localSandboxAdapter.id, localSandboxAdapter]);
}

const ADAPTERS = new Map<string, IntegrationAdapter>(entries);

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
