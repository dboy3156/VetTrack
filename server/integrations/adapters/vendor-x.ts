/**
 * Vendor X production adapter (Phase C).
 *
 * Documented HTTP API (same contract in sandbox and production; base URL differs):
 *   GET /health — service health (Bearer auth)
 *   GET /v1/patients?since=<ISO8601>&page=<n> — paginated patients
 *
 * Auth: Authorization: Bearer <api_token>
 *
 * Environment base URLs (never hardcode hosts in source):
 *   VENDOR_X_SANDBOX_URL
 *   VENDOR_X_PRODUCTION_URL
 *
 * Credential keys:
 *   api_token — required
 *   environment — optional overlay; integration config metadata.environment preferred (merged by worker/API)
 */

import type { IntegrationAdapter } from "./base.js";
import type {
  AdapterCapabilities,
  ExternalAppointment,
  ExternalInventoryItem,
  ExternalPatient,
  IntegrationCredentials,
  SyncParams,
} from "../types.js";
import type { VendorXPatientApiRow } from "../mappers/vendor-x-to-canonical.js";
import { vendorXRowsToExternalPatients } from "../mappers/vendor-x-to-canonical.js";

export const VENDOR_X_ADAPTER_ID = "vendor-x-v1";

const VERSION = "1.0.0";
const VALIDATION_TIMEOUT_MS = 5000;

function truthyEnv(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function resolveVendorXBaseUrl(credentials: IntegrationCredentials): string | null {
  const env =
    (credentials.environment ?? credentials.metadata_environment ?? "sandbox").trim().toLowerCase() === "production"
      ? "production"
      : "sandbox";
  const raw =
    env === "production"
      ? process.env.VENDOR_X_PRODUCTION_URL?.trim()
      : process.env.VENDOR_X_SANDBOX_URL?.trim();
  return raw?.replace(/\/$/, "") ?? null;
}

function safeHttpMessage(status: number): string {
  return `vendor-x-v1: HTTP ${status}`;
}

async function vendorFetchJson(
  credentials: IntegrationCredentials,
  path: string,
  init: RequestInit & { timeoutMs?: number },
): Promise<{ json: unknown; vendorRequestId?: string }> {
  const baseUrl = resolveVendorXBaseUrl(credentials);
  const token = credentials.api_token?.trim();
  if (!baseUrl || !token) {
    throw new Error("vendor-x-v1: missing base URL or api_token");
  }

  const timeoutMs = init.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
    });

    const vendorRequestId = response.headers.get("x-request-id") ?? response.headers.get("x-vendor-request-id") ?? undefined;

    if (!response.ok) {
      await response.text().catch(() => "");
      throw new Error(safeHttpMessage(response.status));
    }

    const json = (await response.json()) as unknown;
    return { json, vendorRequestId };
  } finally {
    clearTimeout(timer);
  }
}

function extractPatientRows(payload: unknown): VendorXPatientApiRow[] {
  if (!payload || typeof payload !== "object") return [];
  const p = payload as Record<string, unknown>;
  const data = p.data ?? p.patients ?? p.results;
  if (!Array.isArray(data)) return [];
  return data.filter((row): row is VendorXPatientApiRow => row != null && typeof row === "object" && "id" in row) as VendorXPatientApiRow[];
}

function extractNextPage(payload: unknown): number | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.next_page === "number") return p.next_page;
  if (typeof p.nextPage === "number") return p.nextPage;
  if (p.pagination && typeof p.pagination === "object") {
    const pg = p.pagination as Record<string, unknown>;
    if (typeof pg.next_page === "number") return pg.next_page;
    if (typeof pg.nextPage === "number") return pg.nextPage;
  }
  return null;
}

export const vendorXAdapter: IntegrationAdapter = {
  id: VENDOR_X_ADAPTER_ID,
  name: "Vendor X (REST)",
  version: VERSION,

  capabilities: {
    canImportPatients: true,
    canExportPatients: false,
    canImportInventory: true,
    canImportAppointments: true,
    canExportAppointments: false,
    canExportBilling: false,
  } satisfies AdapterCapabilities,

  requiredCredentials: ["api_token"],

  async validateCredentials(credentials: IntegrationCredentials) {
    const token = credentials.api_token?.trim();
    if (!token) {
      return { valid: false, error: "vendor-x-v1: api_token is required" };
    }

    const baseUrl = resolveVendorXBaseUrl(credentials);
    if (!baseUrl) {
      const hint = truthyEnv("INTEGRATION_VENDOR_X_ENABLED")
        ? "Configure VENDOR_X_SANDBOX_URL / VENDOR_X_PRODUCTION_URL for the target environment."
        : "Vendor X adapter is disabled.";
      return { valid: false, error: `vendor-x-v1: base URL not configured (${hint})` };
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);
      try {
        let response = await fetch(`${baseUrl}/health`, {
          method: "GET",
          signal: controller.signal,
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        if (response.status === 404) {
          response = await fetch(`${baseUrl}/ping`, {
            method: "GET",
            signal: controller.signal,
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${token}`,
            },
          });
        }
        if (!response.ok) {
          return { valid: false, error: safeHttpMessage(response.status) };
        }
      } finally {
        clearTimeout(timer);
      }
      return { valid: true };
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "AbortError") {
        return { valid: false, error: "vendor-x-v1: validation timed out" };
      }
      return {
        valid: false,
        error: "vendor-x-v1: unable to reach health endpoint",
      };
    }
  },

  async fetchPatients(credentials: IntegrationCredentials, params: SyncParams): Promise<ExternalPatient[]> {
    const merged: IntegrationCredentials = { ...credentials, environment: credentials.environment ?? "sandbox" };
    const since = params.since ? new Date(params.since) : undefined;
    const sinceParam = since && !Number.isNaN(since.getTime()) ? since.toISOString() : "";

    const allRows: VendorXPatientApiRow[] = [];
    let page = 1;
    let pagesFetched = 0;

    for (;;) {
      pagesFetched++;
      if (pagesFetched > 500) break;

      const qs = new URLSearchParams();
      qs.set("page", String(page));
      if (sinceParam) qs.set("since", sinceParam);
      if (params.limit) qs.set("limit", String(params.limit));

      const { json } = await vendorFetchJson(merged, `/v1/patients?${qs.toString()}`, {
        method: "GET",
      });

      const rows = extractPatientRows(json);
      allRows.push(...rows);

      const next = extractNextPage(json);
      if (next != null && next > page) {
        page = next;
        continue;
      }
      break;
    }

    console.info(
      `[integration] ${JSON.stringify({
        adapterId: VENDOR_X_ADAPTER_ID,
        environment: merged.environment ?? "sandbox",
        patientPagesFetched: pagesFetched,
        ...(params.clinicId ? { clinicId: params.clinicId } : {}),
      })}`,
    );

    return vendorXRowsToExternalPatients(allRows);
  },

  async fetchAppointments(): Promise<ExternalAppointment[]> {
    return [];
  },

  async fetchInventory(): Promise<ExternalInventoryItem[]> {
    return [];
  },
};
