/**
 * When ER Mode is **enforced**, staff-visible routes must match `ER_WORKFLOW_ALLOWLIST`
 * UI paths in `shared/er-allowlist.ts` (paired with API prefixes server-side).
 */
import { lazy, Suspense, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useErMode } from "@/hooks/use-er-mode";
import { isErAllowedUiPath } from "../../../../shared/er-allowlist";

const NotFoundPage = lazy(() => import("@/pages/not-found"));

function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/landing" ||
    pathname.startsWith("/signin") ||
    pathname.startsWith("/signup") ||
    pathname === "/home"
  );
}

export function ErModeGuard({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();
  const { state, isLoaded } = useErMode();

  if (!isLoaded) return <>{children}</>;
  if (state !== "enforced") return <>{children}</>;
  if (isPublicPath(pathname) || isErAllowedUiPath(pathname)) {
    return <>{children}</>;
  }

  return (
    <Suspense fallback={null}>
      <NotFoundPage />
    </Suspense>
  );
}
