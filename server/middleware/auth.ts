import type { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { getAuth, clerkClient } from "@clerk/express";
import { db, users } from "../db.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { STABILITY_TOKEN } from "../lib/stability-token.js";
import { resolveCurrentRole } from "../lib/role-resolution.js";
import { resolveRequestLocale } from "../../lib/i18n/middleware.js";
import { normalizeLocale } from "../../lib/i18n/loader.js";
import { buildAccessDeniedBody, recordAccessDenied } from "../lib/access-denied.js";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export type UserRole = "admin" | "vet" | "technician" | "viewer";

export interface AuthUser {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  clinicId: string;
  locale?: string;
}

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthUser;
      effectiveRole?: string;
      roleSource?: string;
      activeShift?: unknown;
    }
  }
}

const ROLE_HIERARCHY: Record<string, number> = {
  admin: 40,
  vet: 30,
  senior_technician: 25,
  technician: 20,
  viewer: 10,
};

const DEV_USER: AuthUser = {
  id: "dev-admin-001",
  clerkId: "dev-admin-001",
  email: "admin@vettrack.dev",
  name: "Dev Admin",
  role: "admin",
  status: "active",
  clinicId: "dev-clinic-default",
};

const DEV_USER_PRESETS: Record<string, Partial<AuthUser>> = {
  "dev-user-alpha": { id: "dev-user-alpha", clerkId: "dev-user-alpha", email: "alpha@vettrack.dev", name: "Dev Alpha" },
  "dev-user-beta":  { id: "dev-user-beta",  clerkId: "dev-user-beta",  email: "beta@vettrack.dev",  name: "Dev Beta"  },
};

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV !== "production";
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY?.trim());
const LEGACY_CLINIC_ID = "legacy-clinic";

/**
 * When Clerk omits org_id (common without Clerk Organizations), resolve clinic from the existing
 * DB user row. Enabled by default; set ALLOW_DB_CLINIC_FALLBACK=false to require org in the session.
 */
function allowDbClinicFallback(): boolean {
  return process.env.ALLOW_DB_CLINIC_FALLBACK?.trim().toLowerCase() !== "false";
}

function isForbiddenProductionClinicId(clinicId: string | null | undefined): boolean {
  const c = clinicId?.trim() ?? "";
  if (!c) return true;
  return c === LEGACY_CLINIC_ID;
}

if (isProduction && !hasClerkSecret) {
  throw new Error("CLERK_SECRET_KEY is required in production. Refusing to start with dev auth bypass.");
}

async function ensureDevUserRecord(devUser: AuthUser): Promise<AuthUser> {
  const [row] = await db
    .insert(users)
    .values({
      id: devUser.id,
      clinicId: devUser.clinicId,
      clerkId: devUser.clerkId,
      email: devUser.email,
      name: devUser.name,
      displayName: devUser.name || devUser.email,
      role: devUser.role,
      status: devUser.status,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        clinicId: devUser.clinicId,
        email: devUser.email,
        name: devUser.name,
        displayName: devUser.name || devUser.email,
        role: devUser.role,
        status: devUser.status,
      },
    })
    .returning();

  return {
    id: row.id,
    clerkId: row.clerkId,
    email: row.email,
    name: row.name,
    role: row.role as UserRole,
    status: row.status,
    clinicId: devUser.clinicId,
  };
}

export type ResolveResult =
  | { ok: true; user: AuthUser }
  | { ok: false; status: number; body: Record<string, string> };

export type AuthResolver = (req: Request) => Promise<ResolveResult>;

function isLikelyInvalidTokenError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("token") || msg.includes("jwt") || msg.includes("session");
}

export async function resolveAuthUser(req: Request): Promise<ResolveResult> {
  if (req.headers["x-stability-token"] === STABILITY_TOKEN) {
    return { ok: true, user: { ...DEV_USER, role: "admin" } };
  }

  const isDevBypass = isDevelopment && !hasClerkSecret;

  if (isDevBypass) {
    const overrideRole = req.headers["x-dev-role-override"] as UserRole | undefined;
    const overrideUserId = req.headers["x-dev-user-id-override"] as string | undefined;
    const overrideClinicId = req.headers["x-dev-clinic-id-override"] as string | undefined;
    const userPreset = overrideUserId ? DEV_USER_PRESETS[overrideUserId] : undefined;
    const baseUser: AuthUser = userPreset ? { ...DEV_USER, ...userPreset } : DEV_USER;
    const clinicId = (overrideClinicId ?? process.env.DEV_DEFAULT_CLINIC_ID ?? DEV_USER.clinicId).trim();
    const tenantUser: AuthUser = { ...baseUser, clinicId };
    const devUser: AuthUser =
      overrideRole && Object.keys(ROLE_HIERARCHY).includes(overrideRole)
        ? { ...tenantUser, role: overrideRole }
        : tenantUser;
    const resolved = await ensureDevUserRecord(devUser);
    return { ok: true, user: resolved };
  }

  let clerkUserId: string | null | undefined;
  let clerkOrgId: string | null | undefined;
  let sessionClaims: Record<string, unknown> | undefined;
  try {
    const auth = getAuth(req);
    clerkUserId = auth.userId;
    clerkOrgId = auth.orgId;
    sessionClaims = auth.sessionClaims as Record<string, unknown> | undefined;
  } catch (err) {
    console.error("[auth] Failed to read auth session", err);
    return { ok: false, status: 401, body: { error: "UNAUTHORIZED", reason: "INVALID_AUTH_TOKEN", message: "Invalid authentication token" } };
  }

  if (!clerkUserId) {
    return { ok: false, status: 401, body: { error: "UNAUTHORIZED", reason: "MISSING_AUTH_USER", message: "Unauthorized" } };
  }
  if (!clerkOrgId) {
    if (!allowDbClinicFallback()) {
      console.error(
        JSON.stringify({
          event: "DB_FALLBACK_DISABLED",
          clerkUserId,
          production: isProduction,
        }),
      );
      return {
        ok: false,
        status: 403,
        body: buildAccessDeniedBody(
          "DB_FALLBACK_DISABLED",
          "Clinic context is required; database clinic fallback is not enabled for this environment",
        ),
      };
    }

    const [existingUser] = await db
      .select({
        clinicId: users.clinicId,
        id: users.id,
      })
      .from(users)
      .where(and(eq(users.clerkId, clerkUserId), isNull(users.deletedAt)))
      .limit(1);

    if (existingUser?.clinicId) {
      clerkOrgId = existingUser.clinicId;
      console.warn("[auth] Clerk org missing; using clinic from existing DB user", {
        clerkUserId,
        dbUserId: existingUser.id,
        clinicId: clerkOrgId,
      });
    } else {
      return {
        ok: false,
        status: 403,
        body: buildAccessDeniedBody("MISSING_CLINIC_ID", "User is not assigned to a clinic"),
      };
    }
  }

  if (isProduction && isForbiddenProductionClinicId(clerkOrgId)) {
    console.error(
      JSON.stringify({
        event: "CRITICAL_MISSING_CLINIC",
        clerkUserId,
        resolvedClinicId: clerkOrgId ?? null,
        reason: "legacy_or_empty",
      }),
    );
    return {
      ok: false,
      status: 403,
      body: buildAccessDeniedBody("MISSING_CLINIC_ID", "User is not assigned to a valid clinic"),
    };
  }

  let clerkEmail = (sessionClaims?.email as string | undefined) ?? "";
  let clerkName = (sessionClaims?.name as string | undefined) ?? "";
  const clerkLocaleClaim =
    (sessionClaims?.locale as string | undefined) ??
    (sessionClaims?.["https://clerk.dev/locale"] as string | undefined);
  const clerkLocale = normalizeLocale(clerkLocaleClaim);
  if (!clerkEmail) {
    try {
      const clerkUser = await clerkClient.users.getUser(clerkUserId);
      clerkEmail = clerkUser.emailAddresses?.[0]?.emailAddress ?? "";
      clerkName = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();
    } catch (err) {
      console.warn("[auth] Unable to enrich Clerk profile; continuing with session claims only", err);
    }
  }

  const isAdminEmail = clerkEmail && ADMIN_EMAILS.includes(clerkEmail.toLowerCase());
  const defaultStatus = isAdminEmail ? "active" : "pending";
  const defaultRole: UserRole = isAdminEmail ? "admin" : "technician";

  // SECURITY: Role is ALWAYS resolved from the database record.
  // The onConflictDoUpdate set clause deliberately excludes `role` so that
  // a user whose role was downgraded mid-session cannot retain elevated access
  // on their next authenticated request.
  let [user] = await db
    .insert(users)
    .values({
      id: randomUUID(),
      clinicId: clerkOrgId,
      clerkId: clerkUserId,
      email: clerkEmail,
      name: clerkName,
      displayName: clerkName || clerkEmail,
      role: defaultRole,
      status: defaultStatus,
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        email: sql`CASE WHEN EXCLUDED.email = '' THEN ${users.email} ELSE EXCLUDED.email END`,
        name: sql`CASE WHEN EXCLUDED.name = '' THEN ${users.name} ELSE EXCLUDED.name END`,
        displayName: sql`CASE WHEN ${users.displayName} = '' AND EXCLUDED.display_name != '' THEN EXCLUDED.display_name ELSE ${users.displayName} END`,
      },
    })
    .returning();

  if (ADMIN_EMAILS.length > 0 && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
    if (user.role !== "admin") {
      [user] = await db
        .update(users)
        .set({ role: "admin", status: "active" })
        .where(eq(users.id, user.id))
        .returning();
    } else if (user.status !== "active") {
      [user] = await db
        .update(users)
        .set({ status: "active" })
        .where(eq(users.id, user.id))
        .returning();
    }
  }

  if (user.deletedAt) {
    return { ok: false, status: 403, body: { error: "ACCESS_DENIED", reason: "ACCOUNT_DELETED", message: "Your account has been removed." } };
  }

  if (isProduction && isForbiddenProductionClinicId(user.clinicId)) {
    console.error(
      JSON.stringify({
        event: "CRITICAL_MISSING_CLINIC",
        clerkUserId,
        userId: user.id,
        resolvedClinicId: user.clinicId,
        reason: "legacy_or_empty_db_user",
      }),
    );
    return {
      ok: false,
      status: 403,
      body: buildAccessDeniedBody("MISSING_CLINIC_ID", "User is not assigned to a valid clinic"),
    };
  }

  if (user.clinicId !== clerkOrgId) {
    return {
      ok: false,
      status: 403,
      body: buildAccessDeniedBody("TENANT_MISMATCH", "Authenticated clinic does not match user clinic assignment"),
    };
  }

  return {
    ok: true,
    user: {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      status: user.status,
      clinicId: clerkOrgId,
      locale: clerkLocale,
    },
  };
}

export function createRequireAuth(resolver: AuthResolver = resolveAuthUser) {
  return async function requireAuthHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await resolver(req);
      if (!result.ok) {
        if (result.status === 403 && typeof result.body.reason === "string") {
          const reason = result.body.reason;
          if (
            reason === "MISSING_CLINIC_ID" ||
            reason === "DB_FALLBACK_DISABLED" ||
            reason === "TENANT_MISMATCH" ||
            reason === "ACCOUNT_PENDING_APPROVAL" ||
            reason === "ACCOUNT_BLOCKED" ||
            reason === "ACCOUNT_DELETED" ||
            reason === "TENANT_CONTEXT_MISSING" ||
            reason === "INSUFFICIENT_ROLE"
          ) {
            recordAccessDenied({
              req,
              source: "requireAuth",
              statusCode: result.status,
              reason,
              message: result.body.message,
            });
          }
        }
        return res.status(result.status).json(result.body);
      }

      req.authUser = result.user;
      req.clinicId = result.user.clinicId;
      req.locale = resolveRequestLocale(req, result.user.locale);
      Sentry.setUser({ id: result.user.id, email: result.user.email });

      if (result.user.status === "pending") {
        recordAccessDenied({
          req,
          source: "requireAuth",
          statusCode: 403,
          reason: "ACCOUNT_PENDING_APPROVAL",
          clinicId: result.user.clinicId,
          userId: result.user.id,
          message: "Account pending approval",
        });
        return res.status(403).json(
          buildAccessDeniedBody("ACCOUNT_PENDING_APPROVAL", "Account pending approval")
        );
      }

      if (result.user.status === "blocked") {
        recordAccessDenied({
          req,
          source: "requireAuth",
          statusCode: 403,
          reason: "ACCOUNT_BLOCKED",
          clinicId: result.user.clinicId,
          userId: result.user.id,
          message: "Your account has been suspended.",
        });
        return res.status(403).json(
          buildAccessDeniedBody("ACCOUNT_BLOCKED", "Your account has been suspended.")
        );
      }

      next();
    } catch (err) {
      const status = isLikelyInvalidTokenError(err) ? 401 : 500;
      const message = status === 401 ? "Invalid authentication token" : "Auth failed";
      console.error("[auth] requireAuth error", err);
      return res.status(status).json({ error: message });
    }
  };
}

export const requireAuth = createRequireAuth();

export function createRequireAuthAny(resolver: AuthResolver = resolveAuthUser) {
  return async function requireAuthAnyHandler(req: Request, res: Response, next: NextFunction) {
    try {
      const result = await resolver(req);
      if (!result.ok) {
        if (result.status === 403 && typeof result.body.reason === "string") {
          const reason = result.body.reason;
          if (
            reason === "MISSING_CLINIC_ID" ||
            reason === "DB_FALLBACK_DISABLED" ||
            reason === "TENANT_MISMATCH" ||
            reason === "ACCOUNT_PENDING_APPROVAL" ||
            reason === "ACCOUNT_BLOCKED" ||
            reason === "ACCOUNT_DELETED" ||
            reason === "TENANT_CONTEXT_MISSING" ||
            reason === "INSUFFICIENT_ROLE"
          ) {
            recordAccessDenied({
              req,
              source: "requireAuthAny",
              statusCode: result.status,
              reason,
              message: result.body.message,
            });
          }
        }
        return res.status(result.status).json(result.body);
      }

      req.authUser = result.user;
      req.clinicId = result.user.clinicId;
      req.locale = resolveRequestLocale(req, result.user.locale);
      Sentry.setUser({ id: result.user.id, email: result.user.email });
      next();
    } catch (err) {
      const status = isLikelyInvalidTokenError(err) ? 401 : 500;
      const message = status === 401 ? "Invalid authentication token" : "Auth failed";
      console.error("[auth] requireAuthAny error", err);
      return res.status(status).json({ error: message });
    }
  };
}

export const requireAuthAny = createRequireAuthAny();

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
  if (req.authUser.role !== "admin") {
    recordAccessDenied({
      req,
      source: "requireAdmin",
      statusCode: 403,
      reason: "INSUFFICIENT_ROLE",
      message: "Admin access required",
    });
    return res.status(403).json(
      buildAccessDeniedBody("INSUFFICIENT_ROLE", "Admin access required")
    );
  }
  next();
}

export function requireRole(minRole: UserRole) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    const userLevel = ROLE_HIERARCHY[req.authUser.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (userLevel < requiredLevel) {
      recordAccessDenied({
        req,
        source: "requireRole",
        statusCode: 403,
        reason: "INSUFFICIENT_ROLE",
        message: "Insufficient permissions",
      });
      return res.status(403).json(
        buildAccessDeniedBody("INSUFFICIENT_ROLE", "Insufficient permissions")
      );
    }
    next();
  };
}

export function requireEffectiveRole(minRole: UserRole) {
  return async function (req: Request, res: Response, next: NextFunction) {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { effectiveRole, source, activeShift } = await resolveCurrentRole({
        clinicId: req.clinicId!,
        userName: req.authUser.name,
        fallbackRole: req.authUser.role,
      });
      req.effectiveRole = effectiveRole;
      req.roleSource = source;
      req.activeShift = activeShift;

      if (process.env.NODE_ENV !== "production") {
        console.log("Role check:", {
          user: req.authUser.name,
          dbRole: req.authUser.role,
          effectiveRole,
          source,
        });
      }

      if (req.authUser.role === "admin") {
        return next();
      }

      const userLevel = ROLE_HIERARCHY[effectiveRole] ?? 0;
      const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
      if (userLevel < requiredLevel) {
        recordAccessDenied({
          req,
          source: "requireEffectiveRole",
          statusCode: 403,
          reason: "INSUFFICIENT_ROLE",
          message: "Insufficient permissions",
        });
        return res.status(403).json(
          buildAccessDeniedBody("INSUFFICIENT_ROLE", "Insufficient permissions")
        );
      }

      next();
    } catch (err) {
      console.error("requireEffectiveRole:", err);
      return res.status(500).json({ error: "Role resolution failed" });
    }
  };
}
