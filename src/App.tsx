import { Switch } from "wouter";
import { Suspense } from "react";
import { AppRoutes } from "@/app/routes";
import { useAutoSelectOrg } from "@/features/auth/hooks/useAutoSelectOrg";
import { t } from "@/lib/i18n";

function AutoSelectOrg() {
  useAutoSelectOrg();

  return null;
}

export default function App() {
  return (
    <>
      <AutoSelectOrg />
      <Suspense fallback={<div className="p-10 text-center">{t.auth.guard.loadingApp}</div>}>
        <Switch>
          <AppRoutes />
        </Switch>
      </Suspense>
    </>
  );
}
