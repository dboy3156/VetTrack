import { useEffect, useState, type ReactNode } from "react";
import { Redirect, useLocation } from "wouter";
import { Loader2, ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AccessDeniedReason, useAuth } from "@/hooks/use-auth";
import { t } from "@/lib/i18n";

export function AuthGuard({ children }: { children: ReactNode }) {
  const [loadTimedOut, setLoadTimedOut] = useState(false);
  const [location, navigate] = useLocation();
  const { isLoaded, isSignedIn, status, accessDeniedReason, signOut, refreshAuth } = useAuth();

  const accessDeniedReasonText: Record<Exclude<AccessDeniedReason, null>, string> = {
    MISSING_CLINIC_ID: t.auth.guard.reasons.missingClinicId,
    DB_FALLBACK_DISABLED: t.auth.guard.reasons.dbFallbackDisabled,
    TENANT_CONTEXT_MISSING: t.auth.guard.reasons.missingClinicContext,
    TENANT_MISMATCH: t.auth.guard.reasons.tenantMismatch,
    INSUFFICIENT_ROLE: t.auth.guard.reasons.insufficientRole,
    ACCOUNT_DELETED: t.auth.guard.reasons.accountDeleted,
    ACCOUNT_BLOCKED: t.auth.guard.reasons.accountBlocked,
    ACCOUNT_PENDING_APPROVAL: t.auth.guard.reasons.accountPendingApproval,
  };

  useEffect(() => {
    if (isLoaded) {
      setLoadTimedOut(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setLoadTimedOut(true);
    }, 30000);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);

  if (!isLoaded) {
    if (!loadTimedOut) {
      return (
        <div className="flex h-screen items-center justify-center">
          <Loader2 className="animate-spin" />
        </div>
      );
    }
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center p-6">
        <ShieldAlert className="h-16 w-16 text-amber-500 mb-4" />
        <h1 className="text-2xl font-bold">{t.auth.guard.loadingApp}</h1>
        <p>{t.api.networkUnavailable}</p>
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setLoadTimedOut(false);
              refreshAuth();
            }}
          >
            {t.auth.guard.retry}
          </Button>
        </div>
      </div>
    );
  }

  if (!isSignedIn) return <Redirect to="/signin" />;

  if (status === "pending") return (
    <div className="flex h-screen flex-col items-center justify-center text-center p-6">
      <Clock className="h-16 w-16 text-amber-500 mb-4" />
      <h1 className="text-2xl font-bold">{t.auth.guard.pendingTitle}</h1>
      <Button className="mt-4" onClick={signOut}>{t.auth.guard.signOut}</Button>
    </div>
  );

  if (status === "blocked") return (
    <div className="flex h-screen flex-col items-center justify-center text-center p-6 bg-destructive/5">
      <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
      <h1 className="text-2xl font-bold text-destructive">{t.auth.guard.blockedTitle}</h1>
      <p>{t.auth.guard.blockedDescription}</p>
      <Button className="mt-4" onClick={signOut}>{t.auth.guard.signOut}</Button>
    </div>
  );

  if (accessDeniedReason) {
    return (
      <div className="flex h-screen flex-col items-center justify-center text-center p-6 bg-destructive/5">
        <ShieldAlert className="h-16 w-16 text-destructive mb-4" />
        <h1 className="text-2xl font-bold text-destructive">{t.auth.guard.accessDeniedTitle}</h1>
        <p>{accessDeniedReasonText[accessDeniedReason] ?? t.auth.guard.accessDeniedDescription}</p>
        <div className="mt-4 flex gap-3">
          <Button
            variant="outline"
            onClick={() => {
              setLoadTimedOut(false);
              refreshAuth();
              if (location === "/signin") {
                navigate("/", { replace: true });
              }
            }}
          >
            {t.auth.guard.retry}
          </Button>
          <Button onClick={signOut}>{t.auth.guard.signOut}</Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
