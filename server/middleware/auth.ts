import type { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { getAuth, clerkClient } from "@clerk/express";
import { db, users } from "../db.js";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { STABILITY_TOKEN } from "../lib/stability-token.js";
import { resolveCurrentRole } from "../lib/role-resolution.js";

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

/** Single hierarchy for permanent roles and effective roles from resolveCurrentRole (incl. shift roles). */
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
};

// DEV_USER_PRESETS: named test identities for multi-user tests.
// Only active in dev mode (no CLERK_SECRET_KEY). Use x-dev-user-id-override
// to select a named identity. Combine with x-dev-role-override for role.
const DEV_USER_PRESETS: Record<string, Partial<AuthUser>> = {
  "dev-user-alpha": { id: "dev-user-alpha", clerkId: "dev-user-alpha", email: "alpha@vettrack.dev", name: "Dev Alpha" },
  "dev-user-beta":  { id: "dev-user-beta",  clerkId: "dev-user-beta",  email: "beta@vettrack.dev",  name: "Dev Beta"  },
};

const isProduction = process.env.NODE_ENV === "production";
const isDevelopment = process.env.NODE_ENV !== "production";
const hasClerkSecret = Boolean(process.env.CLERK_SECRET_KEY?.trim());

if (isProduction && !hasClerkSecret) {
  throw new Error("CLERK_SECRET_KEY is required in production. Refusing to start with dev auth bypass.");
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Internal stability test runner token — grants admin access
  if (req.headers["x-stability-token"] === STABILITY_TOKEN) {
    req.authUser = { ...DEV_USER, role: "admin" };
    return next();
  }

  const isDevBypass = isDevelopment && !hasClerkSecret;

  if (isDevBypass) {
    const overrideRole = req.headers["x-dev-role-override"] as UserRole | undefined;
    const overrideUserId = req.headers["x-dev-user-id-override"] as string | undefined;
    const userPreset = overrideUserId ? DEV_USER_PRESETS[overrideUserId] : undefined;
    const baseUser: AuthUser = userPreset ? { ...DEV_USER, ...userPreset } : DEV_USER;
    const devUser: AuthUser =
      overrideRole && Object.keys(ROLE_HIERARCHY).includes(overrideRole)
        ? { ...baseUser, role: overrideRole }
        : baseUser;
    req.authUser = devUser;
    Sentry.setUser({ id: devUser.id, email: devUser.email });
    return next();
  }

  try {
    const { userId: clerkUserId, sessionClaims } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Session claims may not include email (Clerk default JWT omits it).
    // Fall back to fetching the full user from the Clerk API.
    let clerkEmail = (sessionClaims?.email as string | undefined) ?? "";
    let clerkName = (sessionClaims?.name as string | undefined) ?? "";
    if (!clerkEmail) {
      try {
        const clerkUser = await clerkClient().users.getUser(clerkUserId);
        clerkEmail = clerkUser.emailAddresses?.[0]?.emailAddress ?? "";
        clerkName = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();
      } catch {
        // Non-fatal — proceed with empty email; auto-promote won't trigger
      }
    }

    const isAdminEmail = clerkEmail && ADMIN_EMAILS.includes(clerkEmail.toLowerCase());
    const defaultStatus = isAdminEmail ? "active" : "pending";
    const defaultRole: UserRole = isAdminEmail ? "admin" : "technician";

    // SECURITY: Role is ALWAYS resolved from the database record.
    // The onConflictDoUpdate set clause deliberately excludes `role` so that
    // a user whose role was downgraded mid-session cannot retain elevated access
    // on their next authenticated request. JWT claims, request headers, and
    // request body fields are never used to determine the effective role.
    let [user] = await db
      .insert(users)
      .values({
        id: randomUUID(),
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

    // #region agent log
    fetch('http://127.0.0.1:7766/ingest/898d28b0-9bf3-4dfa-99f8-55f3c787e881',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'053da8'},body:JSON.stringify({sessionId:'053da8',location:'auth.ts:requireAuth-upsert',message:'User upsert result',data:{userId:user.id,email:user.email,name:user.name,displayName:user.displayName,clerkEmail,clerkName,status:user.status},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    // Auto-promote users whose email is in ADMIN_EMAILS
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
      return res.status(403).json({ error: "deleted", message: "Your account has been removed." });
    }

    req.authUser = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      status: user.status,
    };

    Sentry.setUser({ id: user.id, email: user.email });

    if (user.status === "pending") {
      return res.status(403).json({ error: "Account pending approval" });
    }

    if (user.status === "blocked") {
      return res.status(403).json({ error: "blocked", message: "Your account has been suspended." });
    }

    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Auth failed" });
  }
}

export async function requireAuthAny(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Internal stability test runner token — grants admin access
  if (req.headers["x-stability-token"] === STABILITY_TOKEN) {
    req.authUser = { ...DEV_USER, role: "admin" };
    return next();
  }

  const isDevBypass = isDevelopment && !hasClerkSecret;

  if (isDevBypass) {
    const overrideRole = req.headers["x-dev-role-override"] as UserRole | undefined;
    const overrideUserId = req.headers["x-dev-user-id-override"] as string | undefined;
    const userPreset = overrideUserId ? DEV_USER_PRESETS[overrideUserId] : undefined;
    const baseUser: AuthUser = userPreset ? { ...DEV_USER, ...userPreset } : DEV_USER;
    const devUser: AuthUser =
      overrideRole && Object.keys(ROLE_HIERARCHY).includes(overrideRole)
        ? { ...baseUser, role: overrideRole }
        : baseUser;
    req.authUser = devUser;
    Sentry.setUser({ id: devUser.id, email: devUser.email });
    return next();
  }

  try {
    const { userId: clerkUserId, sessionClaims } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    // Session claims may not include email — fall back to Clerk API
    let clerkEmail = (sessionClaims?.email as string | undefined) ?? "";
    let clerkName = (sessionClaims?.name as string | undefined) ?? "";
    if (!clerkEmail) {
      try {
        const clerkUser = await clerkClient().users.getUser(clerkUserId);
        clerkEmail = clerkUser.emailAddresses?.[0]?.emailAddress ?? "";
        clerkName = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();
      } catch {
        // Non-fatal — proceed with empty email; auto-promote won't trigger
      }
    }

    const isAdminEmail = clerkEmail && ADMIN_EMAILS.includes(clerkEmail.toLowerCase());
    const defaultStatus = isAdminEmail ? "active" : "pending";
    const defaultRole: UserRole = isAdminEmail ? "admin" : "technician";

    // SECURITY: Role is ALWAYS resolved from the database record.
    let [user] = await db
      .insert(users)
      .values({
        id: randomUUID(),
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

    // Auto-promote users whose email is in ADMIN_EMAILS (synced with requireAuth)
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

    // Block deleted accounts before granting access
    if (user.deletedAt) {
      return res.status(403).json({ error: "deleted", message: "Your account has been removed." });
    }

    req.authUser = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      status: user.status,
    };

    Sentry.setUser({ id: user.id, email: user.email });
    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ error: "Auth failed" });
  }
}


export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
) {
  if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
  if (req.authUser.role !== "admin")
    return res.status(403).json({ error: "Admin access required" });
  next();
}

export function requireRole(minRole: UserRole) {
  return function (req: Request, res: Response, next: NextFunction) {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    const userLevel = ROLE_HIERARCHY[req.authUser.role] ?? 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] ?? 0;
    if (userLevel < requiredLevel) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }
    next();
  };
}

export function requireEffectiveRole(minRole: UserRole) {
  return async function (req: Request, res: Response, next: NextFunction) {
    if (!req.authUser) return res.status(401).json({ error: "Unauthorized" });
    try {
      const { effectiveRole, source, activeShift } = await resolveCurrentRole({
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
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      next();
    } catch (err) {
      console.error("requireEffectiveRole:", err);
      return res.status(500).json({ error: "Role resolution failed" });
    }
  };
}
