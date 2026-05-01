/**
 * Single source for **ER Allowlist** (CONTEXT.md): which UI paths and API prefixes
 * stay reachable when ER Mode is preview/enforced. Infra-only API prefixes are
 * listed separately so UI does not need matching routes.
 */

/** One workflow surface: paired UI routes + `/api` prefix. */
export interface ErWorkflowAllowlistEntry {
  readonly apiPrefix: string;
  /** Exact pathname matches (leading slash, no trailing slash). */
  readonly uiExactPaths: readonly string[];
  /** Optional prefix for nested UI routes (must end with `/`). */
  readonly uiPathPrefix: string | null;
}

export const ER_WORKFLOW_ALLOWLIST: readonly ErWorkflowAllowlistEntry[] = [
  {
    apiPrefix: "/api/patients",
    uiExactPaths: ["/patients"],
    uiPathPrefix: "/patients/",
  },
  {
    apiPrefix: "/api/appointments",
    uiExactPaths: ["/appointments"],
    uiPathPrefix: "/appointments/",
  },
  {
    apiPrefix: "/api/tasks",
    uiExactPaths: ["/appointments", "/meds"],
    uiPathPrefix: "/patients/",
  },
  {
    apiPrefix: "/api/formulary",
    uiExactPaths: ["/appointments", "/meds"],
    uiPathPrefix: "/patients/",
  },
  {
    apiPrefix: "/api/display",
    uiExactPaths: ["/display"],
    uiPathPrefix: null,
  },
  {
    apiPrefix: "/api/containers",
    uiExactPaths: ["/meds", "/inventory"],
    uiPathPrefix: "/patients/",
  },
  /** Inventory page loads restock lines alongside containers; keep paired with `/inventory` UI only. */
  {
    apiPrefix: "/api/restock",
    uiExactPaths: ["/inventory"],
    uiPathPrefix: null,
  },
  /**
   * Bedside scan/checkout; UI limited by `isErEquipmentBedsideUiPath`
   * (not the full `/equipment` prefix tree).
   */
  {
    apiPrefix: "/api/equipment",
    uiExactPaths: [],
    uiPathPrefix: null,
  },
  {
    apiPrefix: "/api/shift-handover",
    uiExactPaths: ["/shift-handover"],
    uiPathPrefix: null,
  },
  {
    apiPrefix: "/api/code-blue",
    uiExactPaths: ["/code-blue"],
    uiPathPrefix: "/code-blue/",
  },
  {
    apiPrefix: "/api/er",
    uiExactPaths: ["/er"],
    uiPathPrefix: "/er/",
  },
];

/**
 * API prefixes allowed in ER Mode that are not tied to a staff SPA screen
 * (health, version, realtime, webhooks, etc.).
 */
export const ER_INFRA_API_PREFIXES: readonly string[] = [
  "/api/realtime",
  "/api/health",
  "/api/healthz",
  "/api/version",
  "/api/webhooks",
  "/api/integration-webhooks",
];

function flattenErAllowedApiPrefixes(): string[] {
  const workflows = ER_WORKFLOW_ALLOWLIST.map((w) => w.apiPrefix);
  return [...workflows, ...ER_INFRA_API_PREFIXES];
}

/** Sorted longest-first so `/api/foo/bar` matches before `/api/foo`. */
export function getErAllowedApiPrefixesSorted(): string[] {
  return [...flattenErAllowedApiPrefixes()].sort((a, b) => b.length - a.length);
}

/** Normalizes to pathname without query string (caller splits `?`). */
export function isErAllowedApiPath(normalizedPath: string): boolean {
  const path =
    normalizedPath.split("?")[0] ?? normalizedPath;
  return getErAllowedApiPrefixesSorted().some(
    (prefix) =>
      path === prefix ||
      path.startsWith(prefix + "/") ||
      path.startsWith(prefix + "?"),
  );
}

/**
 * ER pilot — bedside equipment only: `/my-equipment`, item detail `/equipment/:id`,
 * and `/equipment/:id/qr`. Blocks catalog `/equipment`, registration `/equipment/new`,
 * and `/equipment/:id/edit`. Other `/equipment/...` shapes stay blocked.
 */
export function isErEquipmentBedsideUiPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (path === "/my-equipment") return true;
  if (path === "/equipment") return false;

  if (/^\/equipment\/[^/]+\/edit(\/|$)/.test(path)) return false;

  const qr = /^\/equipment\/([^/]+)\/qr\/?$/.exec(path);
  if (qr) return qr[1] !== "new";

  const detail = /^\/equipment\/([^/]+)$/.exec(path);
  if (detail) return detail[1] !== "new";

  return false;
}

export function isErAllowedUiPath(pathname: string): boolean {
  const path = pathname.split("?")[0] ?? pathname;
  if (isErEquipmentBedsideUiPath(path)) return true;
  for (const entry of ER_WORKFLOW_ALLOWLIST) {
    if (entry.uiExactPaths.includes(path)) return true;
    if (entry.uiPathPrefix && path.startsWith(entry.uiPathPrefix)) return true;
  }
  return false;
}
