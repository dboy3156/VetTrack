import { Suspense, useEffect } from "react";
import { AppRoutes } from "@/app/routes";
import { useAutoSelectOrg } from "@/features/auth/hooks/useAutoSelectOrg";
import { startLeaderHeartbeat } from "@/lib/leader";
import { t } from "@/lib/i18n";
import { PageErrorBoundary } from "@/components/ui/page-error-boundary";

function AutoSelectOrg() {
  useAutoSelectOrg();

  return null;
}

export default function App() {
  useEffect(() => {
    startLeaderHeartbeat();
  }, []);

  return (
    <>
      <AutoSelectOrg />
      <Suspense fallback={<div className="p-10 text-center">{t.auth.guard.loadingApp}</div>}>
        <PageErrorBoundary fallbackLabel={t.errorCard.defaultMessage}>
          <AppRoutes />
        </PageErrorBoundary>
      </Suspense>
    </>
  );
}
