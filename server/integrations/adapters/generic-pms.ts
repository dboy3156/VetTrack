/**
 * Generic PMS Adapter — reference implementation of IntegrationAdapter.
 *
 * This adapter is NOT a fake. It is the canonical "vanilla HTTP" adapter
 * for any veterinary PMS that speaks a simple REST API with:
 *   - Bearer token authentication
 *   - JSON request/response
 *   - Standard pagination via ?page= and ?since= query params
 *
 * If a specific system speaks this shape, this adapter works for it as-is.
 * For systems with non-standard APIs, copy this file, change the id, and
 * override the methods that differ.
 *
 * Credential keys (all required unless marked optional):
 *   base_url    — e.g. "https://api.example-pms.com/v2"
 *   api_key     — Bearer token
 *   (optional) timeout_ms — Request timeout in ms, default 10000
 *
 * All outbound requests include:
 *   Authorization: Bearer <api_key>
 *   X-VetTrack-Source: vettrack/<version>
 *   X-VetTrack-Clinic: <clinicId>
 *   X-VetTrack-Signature: sha256=<hmac>  (HMAC-SHA256 of body, keyed on api_key)
 */

import { createHmac } from "crypto";
import type { IntegrationAdapter } from "./base.js";
import type {
  AdapterCapabilities,
  ExternalAppointment,
  ExternalInventoryItem,
  ExternalPatient,
  ExternalSyncResult,
  IntegrationCredentials,
  SyncParams,
  VetTrackAppointment,
  VetTrackBillingEntry,
  VetTrackPatient,
} from "../types.js";

const ADAPTER_VERSION = "1.0.0";

function hmacSign(body: string, key: string): string {
  return "sha256=" + createHmac("sha256", key).update(body).digest("hex");
}

async function apiFetch(
  credentials: IntegrationCredentials,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    clinicId?: string;
  } = {},
): Promise<unknown> {
  const baseUrl = credentials.base_url?.replace(/\/$/, "");
  const apiKey = credentials.api_key;
  const timeout = parseInt(credentials.timeout_ms ?? "10000", 10);

  if (!baseUrl || !apiKey) {
    throw new Error("generic-pms: base_url and api_key are required");
  }

  const method = options.method ?? (options.body ? "POST" : "GET");
  const bodyString = options.body ? JSON.stringify(options.body) : undefined;
  const signature = bodyString ? hmacSign(bodyString, apiKey) : undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "X-VetTrack-Source": `vettrack/${ADAPTER_VERSION}`,
        ...(options.clinicId ? { "X-VetTrack-Clinic": options.clinicId } : {}),
        ...(signature ? { "X-VetTrack-Signature": signature } : {}),
      },
      body: bodyString,
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`generic-pms: HTTP ${response.status} — ${text.slice(0, 200)}`);
    }

    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

export const genericPmsAdapter: IntegrationAdapter = {
  id: "generic-pms-v1",
  name: "Generic PMS (REST/JSON)",
  version: ADAPTER_VERSION,

  capabilities: {
    canImportPatients: true,
    canExportPatients: true,
    canImportInventory: true,
    canImportAppointments: true,
    canExportAppointments: true,
    canExportBilling: true,
  } satisfies AdapterCapabilities,

  requiredCredentials: ["base_url", "api_key"],

  async validateCredentials(credentials) {
    try {
      // Lightweight connectivity check — GET /health or /ping
      await apiFetch(credentials, "/health");
      return { valid: true };
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : "Connection failed",
      };
    }
  },

  async fetchPatients(credentials, params: SyncParams): Promise<ExternalPatient[]> {
    const qs = new URLSearchParams();
    if (params.since) qs.set("since", params.since);
    if (params.limit) qs.set("limit", String(params.limit));

    const data = (await apiFetch(credentials, `/patients?${qs}`, { clinicId: params.clinicId })) as {
      data?: ExternalPatient[];
    };
    return data?.data ?? [];
  },

  async pushPatient(credentials, patient: VetTrackPatient): Promise<ExternalSyncResult> {
    const data = (await apiFetch(credentials, "/patients", {
      method: patient.externalId ? "PUT" : "POST",
      body: patient,
      clinicId: undefined,
    })) as { id?: string };

    return { status: "success", externalId: data?.id };
  },

  async fetchInventory(credentials, params: SyncParams): Promise<ExternalInventoryItem[]> {
    const qs = new URLSearchParams();
    if (params.since) qs.set("since", params.since);
    if (params.limit) qs.set("limit", String(params.limit));

    const data = (await apiFetch(credentials, `/inventory?${qs}`, { clinicId: params.clinicId })) as {
      data?: ExternalInventoryItem[];
    };
    return data?.data ?? [];
  },

  async fetchAppointments(credentials, params: SyncParams): Promise<ExternalAppointment[]> {
    const qs = new URLSearchParams();
    if (params.since) qs.set("since", params.since);
    if (params.limit) qs.set("limit", String(params.limit));

    const data = (await apiFetch(credentials, `/appointments?${qs}`, { clinicId: params.clinicId })) as {
      data?: ExternalAppointment[];
    };
    return data?.data ?? [];
  },

  async pushAppointment(credentials, appointment: VetTrackAppointment): Promise<ExternalSyncResult> {
    const data = (await apiFetch(credentials, "/appointments", {
      method: appointment.externalId ? "PUT" : "POST",
      body: appointment,
    })) as { id?: string };

    return { status: "success", externalId: data?.id };
  },

  async exportBillingEntry(credentials, entry: VetTrackBillingEntry): Promise<ExternalSyncResult> {
    // Idempotency: include the VetTrack idempotency key so the external system
    // can deduplicate retries.
    const data = (await apiFetch(credentials, "/billing", {
      method: "POST",
      body: { ...entry, idempotencyKey: entry.idempotencyKey },
    })) as { id?: string };

    return { status: "success", externalId: data?.id };
  },
};
