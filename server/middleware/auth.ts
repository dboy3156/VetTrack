import type { Request, Response, NextFunction } from "express";
import { db, users } from "../db.js";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";

export type UserRole = "admin" | "vet" | "technician" | "viewer";

export interface AuthUser {
  id: string;
  clerkId: string;
  email: string;
  name: string;
  role: UserRole;
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
};

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const isDev = !process.env.CLERK_SECRET_KEY;

  if (isDev) {
    req.authUser = DEV_USER;
    return next();
  }

  try {
    const clerkUserId = req.headers["x-clerk-user-id"] as string;
    const clerkEmail = req.headers["x-clerk-email"] as string;
    const clerkName = req.headers["x-clerk-name"] as string;

    if (!clerkUserId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    let [user] = await db
      .select()
      .from(users)
      .where(eq(users.clerkId, clerkUserId))
      .limit(1);

    if (!user) {
      const newUser = {
        id: randomUUID(),
        clerkId: clerkUserId,
        email: clerkEmail || "",
        name: clerkName || "",
        role: "technician" as const,
      };
      try {
        [user] = await db.insert(users).values(newUser).returning();
      } catch (insertErr: unknown) {
        const pgErr = insertErr as { code?: string };
        if (pgErr?.code === "23505") {
          [user] = await db
            .select()
            .from(users)
            .where(eq(users.clerkId, clerkUserId))
            .limit(1);
        } else {
          throw insertErr;
        }
      }
    } else if (clerkEmail && user.email !== clerkEmail) {
      [user] = await db
        .update(users)
        .set({ email: clerkEmail, name: clerkName || user.name })
        .where(eq(users.id, user.id))
        .returning();
    }

    req.authUser = {
      id: user.id,
      clerkId: user.clerkId,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
    };

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
