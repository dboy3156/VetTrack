/**
 * Dev-only adapter — registered only when NODE_ENV=development (plan §16 optional A).
 */

import type { IntegrationAdapter } from "./base.js";
import type { AdapterCapabilities, ExternalPatient, IntegrationCredentials, SyncParams } from "../types.js";

export const localSandboxAdapter: IntegrationAdapter = {
  id: "local-sandbox-v1",
  name: "Local sandbox (development)",
  version: "0.1.0",
  capabilities: {
    canImportPatients: true,
    canExportPatients: false,
    canImportInventory: false,
    canImportAppointments: false,
    canExportAppointments: false,
    canExportBilling: false,
  } satisfies AdapterCapabilities,

  requiredCredentials: ["sandbox_token"],

  async validateCredentials(credentials: IntegrationCredentials) {
    if (credentials.sandbox_token === "local-dev-token") {
      return { valid: true };
    }
    return { valid: false, error: 'Set sandbox_token to "local-dev-token" for the local sandbox adapter.' };
  },

  async fetchPatients(credentials: IntegrationCredentials, _params: SyncParams): Promise<ExternalPatient[]> {
    if (credentials.sandbox_token !== "local-dev-token") {
      throw new Error('Set sandbox_token to "local-dev-token" for the local sandbox adapter.');
    }
    return [];
  },
};
