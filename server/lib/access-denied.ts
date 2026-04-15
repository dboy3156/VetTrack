import type { Request } from "express";

export type AccessDeniedReason =
  | "MISSING_CLINIC_ID"
  | "TENANT_CONTEXT_MISSING"
  | "TENANT_MISMATCH"
  | "INSUFFICIENT_ROLE"
  | "ACCOUNT_PENDING_APPROVAL"
  | "ACCOUNT_BLOCKED"
  | "ACCOUNT_DELETED";

type AccessDeniedMetricMap = Record<AccessDeniedReason, number>;

const accessDeniedMetrics: AccessDeniedMetricMap = {
  MISSING_CLINIC_ID: 0,
  TENANT_CONTEXT_MISSING: 0,
  TENANT_MISMATCH: 0,
  INSUFFICIENT_ROLE: 0,
  ACCOUNT_PENDING_APPROVAL: 0,
  ACCOUNT_BLOCKED: 0,
  ACCOUNT_DELETED: 0,
};

export function buildAccessDeniedBody(reason: AccessDeniedReason, message: string): {
  error: "ACCESS_DENIED";
  reason: AccessDeniedReason;
  message: string;
} {
  return {
    error: "ACCESS_DENIED",
    reason,
    message,
  };
}

export function recordAccessDenied(params: {
  req: Request;
  reason: AccessDeniedReason;
  statusCode: number;
  source: string;
  message?: string;
  clinicId?: string | null;
  userId?: string | null;
}): void {
  accessDeniedMetrics[params.reason] += 1;

  const payload = {
    event: "access_denied",
    reason: params.reason,
    statusCode: params.statusCode,
    source: params.source,
    route: params.req.originalUrl || params.req.path,
    method: params.req.method,
    clinicId: params.clinicId ?? params.req.clinicId ?? null,
    userId: params.userId ?? params.req.authUser?.id ?? null,
    message: params.message ?? null,
    ts: new Date().toISOString(),
  };

  console.warn("[access-denied]", JSON.stringify(payload));
}

export function getAccessDeniedMetricsSnapshot(): AccessDeniedMetricMap {
  return { ...accessDeniedMetrics };
}
