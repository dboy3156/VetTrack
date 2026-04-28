/**
 * Approved-vendor placeholders — no HTTP, no undocumented APIs (plan §F).
 * validateCredentials fails closed so production cannot mistake stubs for live vendors.
 */

import type { IntegrationAdapter } from "./base.js";
import type { AdapterCapabilities } from "../types.js";

function stubCapabilities(): AdapterCapabilities {
  return {
    canImportPatients: true,
    canExportPatients: false,
    canImportInventory: true,
    canImportAppointments: true,
    canExportAppointments: false,
    canExportBilling: false,
  };
}

export const chameleonStubAdapter: IntegrationAdapter = {
  id: "chameleon-stub-v1",
  name: "Chameleon PMS (stub — pending vendor approval)",
  version: "0.0.0-stub",
  capabilities: stubCapabilities(),
  requiredCredentials: [],
  async validateCredentials() {
    return {
      valid: false,
      error: "Stub adapter — Chameleon API not integrated; register after vendor approval.",
    };
  },
};

export const prizaStubAdapter: IntegrationAdapter = {
  id: "priza-stub-v1",
  name: "Priza (stub — pending vendor approval)",
  version: "0.0.0-stub",
  capabilities: stubCapabilities(),
  requiredCredentials: [],
  async validateCredentials() {
    return {
      valid: false,
      error: "Stub adapter — Priza API not integrated; register after vendor approval.",
    };
  },
};

export const smartflowStubAdapter: IntegrationAdapter = {
  id: "smartflow-stub-v1",
  name: "SmartFlow (stub — pending vendor approval)",
  version: "0.0.0-stub",
  capabilities: stubCapabilities(),
  requiredCredentials: [],
  async validateCredentials() {
    return {
      valid: false,
      error: "Stub adapter — SmartFlow API not integrated; register after vendor approval.",
    };
  },
};

export const vendorStubAdapters: IntegrationAdapter[] = [
  chameleonStubAdapter,
  prizaStubAdapter,
  smartflowStubAdapter,
];
