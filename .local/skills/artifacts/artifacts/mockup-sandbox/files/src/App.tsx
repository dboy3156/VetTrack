import { Switch, Route, Redirect } from "wouter";
import { Suspense, lazy, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { Loader2, AlertTriangle, RefreshCw, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { SwUpdateBanner } from "@/components/sw-update-banner";

// Lazy imports
const HomePage = lazy(() => import("@/pages/home"));
const LandingPage = lazy(() => import("@/pages/landing"));
const SignInPage = lazy(() => import("@/pages/signin"));
const SignUpPage = lazy(() => import("@/pages/signup"));
const EquipmentListPage = lazy(() => import("@/pages/equipment-list"));
const EquipmentDetailPage = lazy(() => import("@/pages/equipment-detail"));
const NewEquipmentPage = lazy(() => import("@/pages/new-equipment"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const AlertsPage = lazy(() => import("@/pages/alerts"));
const QrPrintPage = lazy(() => import("@/pages/qr-print"));
const AdminPage = lazy(() => import("@/pages/admin"));
const MyEquipmentPage = lazy(() => import("@/pages/my-equipment"));
const DemoGuidePage = lazy(() => import("@/pages/demo-guide"));
const ManagementDashboardPage = lazy(() => import("@/pages/management-dashboard"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const AuditLogPage = lazy(() => import("@/pages/audit-log"));
const StabilityDashboardPage = lazy(() => import("@/pages/stability-dashboard"));
const RoomsListPage = lazy(() => import("@/pages/rooms-list"));
const RoomRadarPage = lazy(() => import("@/pages/room-radar"));
const HelpPage = lazy(() => import("@/pages/help"));

function PageLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function AuthGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, status, isOfflineSession, signOut } = useAuth();
  
  if (!isLoaded && !isOfflineSession) return <PageLoader />;
  if (!isSignedIn) return <Redirect to="/signin" />;
  
  if (!isOfflineSession) {
    if (status === "pending") return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center">
        <Clock className="w-12 h-12 text-amber-500 mb-4" />
        <h1 className="text-xl font-bold">Awaiting Approval</h1>
        <p className="text-muted-foreground mb-4">Your account is pending admin review.</p>
        <Button variant="outline" onClick={signOut}>Sign Out</Button>
      </div>
    );
    if (status === "blocked") return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-6 text-center">
        <Ban className="w-12 h-12 text-destructive mb-4" />
        <h1 className="text-xl font-bold">Account Blocked</h1>
        <Button variant="outline" onClick={signOut}>Sign Out</Button>
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={({ error, resetError }) => (
      <div className="p-6 text-center">
        <AlertTriangle className="w-12 h-12 text-destructive mx-auto" />
        <p className="mt-2 font-bold">Something went wrong</p>
        <Button onClick={() => { resetError(); window.location.reload(); }} className="mt-4">Refresh</Button>
      </div>
    )}>
      <SwUpdateBanner />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/landing" component={LandingPage} />
          <Route path="/signin" component={SignInPage} />
          <Route path="/signup" component={SignUpPage} />
          
          <Route path="/"><AuthGuard><HomePage /></AuthGuard></Route>
          <Route path="/equipment"><AuthGuard><EquipmentListPage /></AuthGuard></Route>
          <Route path="/equipment/new"><AuthGuard><NewEquipmentPage /></AuthGuard></Route>
          <Route path="/equipment/:id/edit"><AuthGuard><NewEquipmentPage /></AuthGuard></Route>
          <Route path="/equipment/:id"><AuthGuard><EquipmentDetailPage /></AuthGuard></Route>
          <Route path="/analytics"><AuthGuard><AnalyticsPage /></AuthGuard></Route>
          <Route path="/alerts"><AuthGuard><AlertsPage /></AuthGuard></Route>
          <Route path="/print"><AuthGuard><QrPrintPage /></AuthGuard></Route>
          <Route path="/admin"><AuthGuard><AdminPage /></AuthGuard></Route>
          <Route path="/my-equipment"><AuthGuard><MyEquipmentPage /></AuthGuard></Route>
          <Route path="/dashboard"><AuthGuard><ManagementDashboardPage /></AuthGuard></Route>
          <Route path="/settings"><AuthGuard><SettingsPage /></AuthGuard></Route>
          <Route path="/rooms"><AuthGuard><RoomsListPage /></AuthGuard></Route>
          <Route path="/rooms/:id"><AuthGuard><RoomRadarPage /></AuthGuard></Route>
          <Route path="/help"><AuthGuard><HelpPage /></AuthGuard></Route>
          
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </Sentry.ErrorBoundary>
  );
}
