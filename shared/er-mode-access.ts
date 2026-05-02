/**
 * ER Wedge operational access — Concealment 404 policy (spec: ER Allowlist).
 * Covers intake events, Command Center, clinical handoffs (all delivered via `/api/er/*`),
 * plus session, realtime, and push endpoints required for the ER shell.
 */

/**
 * Path segments after `/api` allowed when ER concealment is enforced for a clinic.
 *
 * Auth-critical paths are explicitly listed to prevent circular authentication
 * failures when enforcement is active:
 *   - `/users`  → covers `/users/me` (session identity) and user management
 *   - `/session` → reserved for future session/token refresh endpoints
 */
export const ER_MODE_API_PATH_PREFIX_ALLOWLIST: readonly string[] = [
  "/er",
  "/users",
  "/session",
  "/realtime",
  "/push",
];

/**
 * Normalize `req.originalUrl` / `req.url` to the path after `/api`.
 * Tolerates missing `originalUrl` (avoids throwing on undefined).
 */
export function normalizeApiPathAfterPrefix(originalUrl: string | undefined): string {
  const raw = typeof originalUrl === "string" ? originalUrl : "";
  const q = raw.split("?")[0] ?? "";
  if (!q.startsWith("/api")) return "";
  const rest = q.slice("/api".length);
  if (rest === "") return "/";
  return rest.startsWith("/") ? rest : `/${rest}`;
}

export function isErApiPathAllowlisted(apiSubPath: string): boolean {
  const path = apiSubPath.startsWith("/") ? apiSubPath : `/${apiSubPath}`;
  return ER_MODE_API_PATH_PREFIX_ALLOWLIST.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/**
 * SPA routes permitted under concealment (404 all other paths).
 * Staff clinical URLs are under `/er`; auth and marketing shells stay reachable.
 */
export function isErSpaPathAllowlisted(pathname: string): boolean {
  const normalized =
    pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  if (normalized === "/" || normalized === "/landing") return true;
  if (normalized.startsWith("/signin") || normalized.startsWith("/signup")) return true;
  if (normalized.startsWith("/er")) return true;
  return false;
}
