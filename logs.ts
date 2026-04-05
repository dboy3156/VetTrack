import { getAuth } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

declare global {
  namespace Express {
    interface Request {
      authUserId?: string;
      authUserRole?: "admin" | "technician";
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;

  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  req.authUserId = userId;

  let [user] = await db.select().from(usersTable).where(eq(usersTable.clerkId, userId));

  if (!user) {
    [user] = await db.insert(usersTable).values({ clerkId: userId, role: "technician" }).returning();
  }

  req.authUserRole = user.role;
  next();
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  await requireAuth(req, res, () => {
    if (req.authUserRole !== "admin") {
      res.status(403).json({ error: "Forbidden: admin role required" });
      return;
    }
    next();
  });
}
