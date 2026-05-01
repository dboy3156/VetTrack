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

/** ER endpoints implemented (others may 501). */
export const ER_API_IMPLEMENTED_ROUTES = [
  "/api/er/mode",
  "/api/er/board",
  "/api/er/assignees",
  "/api/er/intake",
  "/api/er/handoffs",
  "/api/er/handoffs/eligible-hospitalizations",
  "/api/er/impact",
] as const;

export class ErApiNotImplementedError extends Error {
  readonly url: string;

  constructor(url: string) {
    super(`ER API not implemented yet: ${url}`);
    this.name = "ErApiNotImplementedError";
    this.url = url;
  }
}

async function fetchErJson<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, { credentials: "include", ...init });
  if (res.status === 501) {
    throw new ErApiNotImplementedError(input);
  }
  if (!res.ok) {
    throw new Error(`${input} failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function getErMode(): Promise<ErModeResponse> {
  return fetchErJson<ErModeResponse>("/api/er/mode");
}

export async function getErBoard(): Promise<ErBoardResponse> {
  return fetchErJson<ErBoardResponse>("/api/er/board");
}

export async function createErIntake(body: CreateErIntakeRequest): Promise<ErIntakeResponse> {
  return fetchErJson<ErIntakeResponse>("/api/er/intake", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function assignErIntake(
  id: string,
  body: AssignErIntakeRequest,
): Promise<AssignErIntakeResponse> {
  return fetchErJson<AssignErIntakeResponse>(`/api/er/intake/${id}/assign`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getErAssignees(): Promise<ErAssigneesResponse> {
  return fetchErJson<ErAssigneesResponse>("/api/er/assignees");
}

export async function getErEligibleHospitalizations(): Promise<ErEligibleHospitalizationsResponse> {
  return fetchErJson<ErEligibleHospitalizationsResponse>(
    "/api/er/handoffs/eligible-hospitalizations",
  );
}

export async function createErHandoff(body: CreateErHandoffRequest): Promise<CreateErHandoffResponse> {
  return fetchErJson<CreateErHandoffResponse>("/api/er/handoffs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function ackErHandoff(
  id: string,
  body: AckErHandoffRequest,
): Promise<AckErHandoffResponse> {
  return fetchErJson<AckErHandoffResponse>(`/api/er/handoffs/${id}/ack`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function getErImpact(windowDays: ErKpiWindowDays = 14): Promise<ErImpactResponse> {
  return fetchErJson<ErImpactResponse>(`/api/er/impact?window=${windowDays}`);
}
