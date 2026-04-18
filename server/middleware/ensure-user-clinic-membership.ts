import type { NextFunction, Request, Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, users } from "../db.js";

/**
 * Ensures the authenticated user's DB row is active in the current request clinic.
 * Defense in depth on top of `requireAuth` tenant resolution.
 */
export async function ensureUserClinicMembership(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.authUser?.id;
    const clinicId = req.clinicId?.trim();
    if (!userId || !clinicId) {
      res.status(400).json({
        code: "MISSING_CONTEXT",
        error: "MISSING_CONTEXT",
        reason: "MISSING_CONTEXT",
        message: "Missing user or clinic context",
      });
      return;
    }

    const [row] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, userId), eq(users.clinicId, clinicId), isNull(users.deletedAt)))
      .limit(1);

    if (!row) {
      res.status(403).json({
        code: "CLINIC_MEMBERSHIP_DENIED",
        error: "CLINIC_MEMBERSHIP_DENIED",
        reason: "CLINIC_MEMBERSHIP_DENIED",
        message: "User does not belong to this clinic",
      });
      return;
    }

    next();
  } catch (err) {
    console.error("[ensureUserClinicMembership]", err);
    res.status(500).json({
      code: "INTERNAL_ERROR",
      error: "INTERNAL_ERROR",
      reason: "CLINIC_CHECK_FAILED",
      message: "Authorization check failed",
    });
  }
}
