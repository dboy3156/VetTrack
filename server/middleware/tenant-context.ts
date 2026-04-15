import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { buildAccessDeniedBody, recordAccessDenied } from "../lib/access-denied.js";

export interface AuthenticatedRequest extends Request {
  clinicId: string;
}

declare global {
  namespace Express {
    interface Request {
      clinicId?: string;
    }
  }
}

export function tenantContext(req: Request, res: Response, next: NextFunction): void {
  if (
    req.path === "/push/vapid-public-key" ||
    req.path === "/health/ready"
  ) {
    next();
    return;
  }

  const fromAuthUser = req.authUser?.clinicId;
  const fromDevHeader = typeof req.headers["x-dev-clinic-id-override"] === "string"
    ? req.headers["x-dev-clinic-id-override"]
    : undefined;
  const fromDevDefault = process.env.DEV_DEFAULT_CLINIC_ID;
  const fromImplicitDevDefault = process.env.NODE_ENV !== "production" ? "dev-clinic-default" : undefined;
  const fromClerk = (() => {
    try {
      return getAuth(req).orgId ?? undefined;
    } catch {
      return undefined;
    }
  })();

  const clinicId = (fromAuthUser ?? fromClerk ?? fromDevHeader ?? fromDevDefault ?? fromImplicitDevDefault)?.trim();
  if (!clinicId) {
    recordAccessDenied({
      req,
      source: "tenant-context",
      statusCode: 403,
      reason: "TENANT_CONTEXT_MISSING",
      message: "Clinic context missing",
    });
    res.status(403).json(
      buildAccessDeniedBody("TENANT_CONTEXT_MISSING", "Clinic context missing")
    );
    return;
  }

  req.clinicId = clinicId;
  next();
}

export function requireClinicId(req: Request): string {
  const clinicId = req.clinicId?.trim();
  if (!clinicId) {
    throw new Error("Missing clinicId in request context");
  }
  return clinicId;
}
