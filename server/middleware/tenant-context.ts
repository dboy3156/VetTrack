import type { NextFunction, Request, Response } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, isNull } from "drizzle-orm";
import { db, users } from "../db.js";
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

export async function tenantContext(req: Request, res: Response, next: NextFunction): Promise<void> {
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
  let clerkUserId: string | undefined;
  const fromClerk = (() => {
    try {
      const auth = getAuth(req);
      clerkUserId = auth.userId ?? undefined;
      return auth.orgId ?? undefined;
    } catch {
      return undefined;
    }
  })();

  let inferredFromDb: string | undefined;
  if (!fromAuthUser && !fromClerk && clerkUserId) {
    try {
      const [existingUser] = await db
        .select({ clinicId: users.clinicId })
        .from(users)
        .where(and(eq(users.clerkId, clerkUserId), isNull(users.deletedAt)))
        .limit(1);
      inferredFromDb = existingUser?.clinicId ?? undefined;
    } catch (error) {
      console.warn("[tenant-context] Failed to infer clinic from DB user", {
        clerkUserId,
        error,
      });
    }
  }

  const clinicId = (fromAuthUser ?? fromClerk ?? inferredFromDb ?? fromDevHeader ?? fromDevDefault ?? fromImplicitDevDefault)?.trim();
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
