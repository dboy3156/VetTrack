import type { Request, Response, NextFunction } from "express";
import * as Sentry from "@sentry/node";
import { getAuth } from "@clerk/express";
import { db, users } from "../db.js";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

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
    }
  }
}

const ROLE_HIERARCHY: Record<UserRole, number> = {
  admin: 40,
  vet: 30,
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

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const isDev = !process.env.CLERK_SECRET_KEY;

  if (isDev) {
    const overrideRole = req.headers["x-dev-role-override"] as UserRole | undefined;
    const devUser: AuthUser =
      overrideRole && Object.keys(ROLE_HIERARCHY).includes(overrideRole)
        ? { ...DEV_USER, role: overrideRole }
        : DEV_USER;
    req.authUser = devUser;
    Sentry.setUser({ id: devUser.id, email: devUser.email });
    return next();
  }

  try {
    const { userId: clerkUserId, sessionClaims } = getAuth(req);

    if (!clerkUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const clerkEmail = (sessionClaims?.email as string | undefined) ?? "";
    const clerkName = (sessionClaims?.name as string | undefined) ?? "";

    let [user] = await db
      .insert(users)
      .values({
        id: randomUUID(),
        clerkId: clerkUserId,
        email: clerkEmail,
        name: clerkName,
        role: "technician",
        status: "active",
      })
      .onConflictDoUpdate({
        target: users.clerkId,
        set: {
          email: sql`CASE WHEN EXCLUDED.email = '' THEN ${users.email} ELSE EXCLUDED.email END`,
          name: sql`CASE WHEN EXCLUDED.name = '' THEN ${users.name} ELSE EXCLUDED.name END`,
        },
      })
      .returning();

    // Auto-promote users whose email is in ADMIN_EMAILS
    const adminEmails = (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    if (adminEmails.length > 0 && adminEmails.includes(user.email.toLowerCase())) {
      if (user.role !== "admin") {
        [user] = await db
          .update(users)
          .set({ role: "admin" })
          .where(eq(users.id, user.id))
          .returning();
      }
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
