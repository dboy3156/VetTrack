import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";

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
  const fromClerk = (() => {
    try {
      return getAuth(req).orgId ?? undefined;
    } catch {
      return undefined;
    }
  })();

  const clinicId = (fromAuthUser ?? fromClerk ?? fromDevHeader ?? fromDevDefault)?.trim();
  if (!clinicId) {
    res.status(403).json({ error: "Clinic context missing" });
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
