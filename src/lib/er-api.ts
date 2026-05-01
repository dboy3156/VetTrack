import type {
  AckErHandoffRequest,
  AckErHandoffResponse,
  AssignErIntakeRequest,
  AssignErIntakeResponse,
  CreateErHandoffRequest,
  CreateErHandoffResponse,
  CreateErIntakeRequest,
  ErAssigneesResponse,
  ErBoardResponse,
  ErEligibleHospitalizationsResponse,
  ErImpactResponse,
  ErIntakeResponse,
  ErKpiWindowDays,
  ErModeResponse,
} from "../../shared/er-types.js";

export class ErApiNotImplementedError extends Error {
  constructor(message = "ER API route not implemented") {
    super(message);
    this.name = "ErApiNotImplementedError";
  }
}

/** Implemented REST paths for diagnostics / admin tooling. */
export const ER_API_IMPLEMENTED_ROUTES = [
  "GET /api/er/mode",
  "PATCH /api/er/mode",
  "GET /api/er/board",
  "GET /api/er/assignees",
  "POST /api/er/intake",
  "PATCH /api/er/intake/:id/assign",
  "GET /api/er/handoffs/eligible-hospitalizations",
  "POST /api/er/handoffs",
  "POST /api/er/handoffs/:id/ack",
  "GET /api/er/impact",
  "GET /api/er/queue",
] as const;

type RequestFn = typeof import("./api").request;

let cachedRequest: RequestFn | undefined;

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  if (!cachedRequest) {
    const mod = await import("./api");
    cachedRequest = mod.request;
  }
  return cachedRequest<T>(url, init);
}

export async function getErMode(): Promise<ErModeResponse> {
  return apiRequest<ErModeResponse>("/api/er/mode");
}

export async function getErBoard(): Promise<ErBoardResponse> {
  return apiRequest<ErBoardResponse>("/api/er/board");
}

export async function getErAssignees(): Promise<ErAssigneesResponse> {
  return apiRequest<ErAssigneesResponse>("/api/er/assignees");
}

export async function getErEligibleHospitalizations(): Promise<ErEligibleHospitalizationsResponse> {
  return apiRequest<ErEligibleHospitalizationsResponse>("/api/er/handoffs/eligible-hospitalizations");
}

export async function createErIntake(body: CreateErIntakeRequest): Promise<ErIntakeResponse> {
  return apiRequest<ErIntakeResponse>("/api/er/intake", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function assignErIntake(id: string, body: AssignErIntakeRequest): Promise<AssignErIntakeResponse> {
  return apiRequest<AssignErIntakeResponse>(`/api/er/intake/${encodeURIComponent(id)}/assign`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function createErHandoff(body: CreateErHandoffRequest): Promise<CreateErHandoffResponse> {
  return apiRequest<CreateErHandoffResponse>("/api/er/handoffs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function ackErHandoff(itemId: string, body?: AckErHandoffRequest): Promise<AckErHandoffResponse> {
  return apiRequest<AckErHandoffResponse>(`/api/er/handoffs/${encodeURIComponent(itemId)}/ack`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

export async function getErImpact(params?: { window?: ErKpiWindowDays }): Promise<ErImpactResponse> {
  const windowDays = params?.window ?? 14;
  return apiRequest<ErImpactResponse>(`/api/er/impact?window=${encodeURIComponent(String(windowDays))}`);
}
