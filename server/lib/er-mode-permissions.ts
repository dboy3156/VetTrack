import { canManageErMode } from "../../shared/permissions.js";
import type { AuthUser } from "../middleware/auth.js";

/** Same parsing as `ADMIN_EMAILS` in `server/middleware/auth.ts`. */
export function parseAdminEmailAllowlist(): readonly string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** Clinic-wide ER lock toggle — owner allowlist when `ADMIN_EMAILS` is set; else any admin (dev). */
export function canManageErModeForUser(user: Pick<AuthUser, "role" | "email">): boolean {
  return canManageErMode(
    { role: user.role, email: user.email ?? "" },
    parseAdminEmailAllowlist(),
  );
}
