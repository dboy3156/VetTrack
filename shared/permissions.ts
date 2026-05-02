/** Minimal principal shape for permission checks (keep shared free of server-only imports). */
export interface ErModeManagerPrincipal {
  role: string;
  email: string;
}

/**
 * Who may change clinic-wide ER operational lock (`enforced` vs off).
 * When `adminEmailAllowlist` is non-empty (from `ADMIN_EMAILS` on the server), only those
 * emails may toggle — product-owner style gate. When empty (typical local dev), any `admin`
 * role may toggle.
 */
export function canManageErMode(
  user: ErModeManagerPrincipal,
  adminEmailAllowlist: readonly string[],
): boolean {
  const email = user.email.trim().toLowerCase();
  if (adminEmailAllowlist.length > 0) {
    return adminEmailAllowlist.includes(email);
  }
  return user.role === "admin";
}
