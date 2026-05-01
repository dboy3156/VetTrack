import { lazy, Suspense, type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ER_MODE_QUERY_KEY, getErMode } from "@/lib/er-api";
import { isErSpaPathAllowlisted } from "../../../../shared/er-mode-access";
import { useAuth } from "@/hooks/use-auth";

const NotFoundPage = lazy(() => import("@/pages/not-found"));

/**
 * When the clinic is in ER Mode (`enforced`), non-allowlisted staff routes are concealed (404)
 * to match server Concealment 404 — no 403, no feature leakage.
 */
export function ErModeGuard({ children }: { children: ReactNode }) {
  const [pathname] = useLocation();
  const { isSignedIn, isLoaded } = useAuth();
  const { data: erMode, isLoading } = useQuery({
    queryKey: ER_MODE_QUERY_KEY,
    queryFn: getErMode,
    enabled: isLoaded && isSignedIn === true,
    staleTime: 60_000,
  });

  if (!isLoaded) {
    return children;
  }

  const enforced = erMode?.state === "enforced";
  const concealmentPending = Boolean(isSignedIn && isLoading);

  if (concealmentPending) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
      </div>
    );
  }

  if (!enforced) {
    return children;
  }

  if (isErSpaPathAllowlisted(pathname)) {
    return children;
  }

  if (isSignedIn && pathname === "/home") {
    return <Redirect to="/er" />;
  }

  return (
    <Suspense fallback={null}>
      <NotFoundPage />
    </Suspense>
  );
}
