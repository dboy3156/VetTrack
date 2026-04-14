import { Switch, Route, Redirect } from "wouter";
import { Suspense, lazy, useEffect, useState, type ReactNode } from "react";
import { Loader2, ShieldAlert, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { t } from "@/lib/i18n";

const HomePage = lazy(() => import("@/pages/home"));
const LandingPage = lazy(() => import("@/pages/landing"));
const SignUpPage = lazy(() => import("@/pages/signup"));
const SignInPage = lazy(() => import("@/pages/signin"));
const EquipmentPage = lazy(() => import("@/pages/equipment-list"));
const EquipmentDetailPage = lazy(() => import("@/pages/equipment-detail"));
const NewEquipmentPage = lazy(() => import("@/pages/new-equipment"));
const AlertsPage = lazy(() => import("@/pages/alerts"));
const MyEquipmentPage = lazy(() => import("@/pages/my-equipment"));
const RoomsListPage = lazy(() => import("@/pages/rooms-list"));
const RoomRadarPage = lazy(() => import("@/pages/room-radar"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const ManagementDashboardPage = lazy(() => import("@/pages/management-dashboard"));
const QrPrintPage = lazy(() => import("@/pages/qr-print"));
const EquipmentQrPrintPage = lazy(() => import("@/pages/equipment-qr-print"));
const AdminPage = lazy(() => import("@/pages/admin"));
const StabilityDashboardPage = lazy(() => import("@/pages/stability-dashboard"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const HelpPage = lazy(() => import("@/pages/help"));
const AuditLogPage = lazy(() => import("@/pages/audit-log"));
const AdminShiftsPage = lazy(() => import("@/pages/admin-shifts"));
const DemoGuidePage = lazy(() => import("@/pages/demo-guide"));
const WhatsNewPage = lazy(() => import("@/pages/whats-new"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

function AuthGuard({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const { isLoaded, isSignedIn, status, signOut } = useAuth();

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !isLoaded) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="animate-spin" />
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

  return <>{children}</>;
}

export default function App() {
  return (
    <Suspense fallback={<div className="p-10 text-center">{t.auth.guard.loadingApp}</div>}>
      <Switch>
        <Route path="/landing" component={LandingPage} />
        <Route path="/signin" component={SignInPage} />
        <Route path="/signup" component={SignUpPage} />
        <Route path="/demo-guide" component={DemoGuidePage} />

        <Route path="/"><AuthGuard><HomePage /></AuthGuard></Route>
        <Route path="/equipment"><AuthGuard><EquipmentPage /></AuthGuard></Route>
        <Route path="/equipment/new"><AuthGuard><NewEquipmentPage /></AuthGuard></Route>
        <Route path="/equipment/:id/edit"><AuthGuard><NewEquipmentPage /></AuthGuard></Route>
        <Route path="/equipment/:id/qr"><AuthGuard><EquipmentQrPrintPage /></AuthGuard></Route>
        <Route path="/equipment/:id"><AuthGuard><EquipmentDetailPage /></AuthGuard></Route>
        <Route path="/alerts"><AuthGuard><AlertsPage /></AuthGuard></Route>
        <Route path="/my-equipment"><AuthGuard><MyEquipmentPage /></AuthGuard></Route>
        <Route path="/rooms"><AuthGuard><RoomsListPage /></AuthGuard></Route>
        <Route path="/rooms/:id"><AuthGuard><RoomRadarPage /></AuthGuard></Route>
        <Route path="/analytics"><AuthGuard><AnalyticsPage /></AuthGuard></Route>
        <Route path="/dashboard"><AuthGuard><ManagementDashboardPage /></AuthGuard></Route>
        <Route path="/print"><AuthGuard><QrPrintPage /></AuthGuard></Route>
        <Route path="/admin"><AuthGuard><AdminPage /></AuthGuard></Route>
        <Route path="/admin/shifts"><AuthGuard><AdminShiftsPage /></AuthGuard></Route>
        <Route path="/stability"><AuthGuard><StabilityDashboardPage /></AuthGuard></Route>
        <Route path="/settings"><AuthGuard><SettingsPage /></AuthGuard></Route>
        <Route path="/help"><AuthGuard><HelpPage /></AuthGuard></Route>
        <Route path="/audit-log"><AuthGuard><AuditLogPage /></AuthGuard></Route>
        <Route path="/whats-new"><AuthGuard><WhatsNewPage /></AuthGuard></Route>
        <Route component={NotFoundPage} />
      </Switch>
    </Suspense>
  );
}
