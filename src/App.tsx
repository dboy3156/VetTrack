import { Switch, Route, Redirect } from "wouter";
import { Suspense, lazy, type ReactNode } from "react";
import * as Sentry from "@sentry/react";
import { Loader2, AlertTriangle, RefreshCw, Clock, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { SwUpdateBanner } from "@/components/sw-update-banner";

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

function PageLoader() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function ErrorFallback({ error, resetError }: { error: unknown; resetError: () => void }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-2">
          An unexpected error occurred. Please try refreshing the page.
        </p>
        {message && (
          <p className="text-xs text-muted-foreground mb-6 font-mono bg-muted rounded px-2 py-1 truncate">
            {message}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Button
            onClick={() => {
              resetError();
              window.location.reload();
            }}
            className="gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh Page
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const sentryId = Sentry.lastEventId();
              if (sentryId) {
                Sentry.showReportDialog({ eventId: sentryId });
              } else {
                window.open("mailto:support@vettrack.app?subject=Error+Report", "_blank");
              }
            }}
          >
            Report Issue
          </Button>
        </div>
      </div>
    </div>
  );
}

function PendingApprovalScreen({ signOut }: { signOut: () => Promise<void> }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-8 h-8 text-amber-600" />
        </div>
        <h1 className="text-xl font-bold mb-2">Awaiting Approval</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your account is pending review by an administrator. You will have access once your account is approved.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}

function BlockedScreen({ signOut }: { signOut: () => Promise<void> }) {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <Ban className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-xl font-bold mb-2">Account Suspended</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your account has been suspended. Please contact an administrator if you believe this is a mistake.
        </p>
        <Button variant="outline" onClick={signOut}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, status, isOfflineSession, signOut } = useAuth();
  if (!isLoaded && !isOfflineSession) return <PageLoader />;
  if (!isSignedIn) return <Redirect to="/signin" />;
  if (!isOfflineSession && status === "pending") return <PendingApprovalScreen signOut={signOut} />;
  if (!isOfflineSession && status === "blocked") return <BlockedScreen signOut={signOut} />;
  return <>{children}</>;
}

function RootRoute() {
  const { isLoaded, isSignedIn, status, isOfflineSession, signOut } = useAuth();
  if (!isLoaded && !isOfflineSession) return <PageLoader />;
  if (!isSignedIn) return <Redirect to="/signin" />;
  if (!isOfflineSession && status === "pending") return <PendingApprovalScreen signOut={signOut} />;
  if (!isOfflineSession && status === "blocked") return <BlockedScreen signOut={signOut} />;
  return <HomePage />;
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={(props) => <ErrorFallback {...props} />}>
      <SwUpdateBanner />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={RootRoute} />
          <Route path="/landing" component={LandingPage} />
          <Route path="/signin" component={SignInPage} />
          <Route path="/signup" component={SignUpPage} />
          <Route path="/equipment">
            <ProtectedRoute><EquipmentListPage /></ProtectedRoute>
          </Route>
          <Route path="/equipment/new">
            <ProtectedRoute><NewEquipmentPage /></ProtectedRoute>
          </Route>
          <Route path="/equipment/:id">
            <ProtectedRoute><EquipmentDetailPage /></ProtectedRoute>
          </Route>
          <Route path="/analytics">
            <ProtectedRoute><AnalyticsPage /></ProtectedRoute>
          </Route>
          <Route path="/alerts">
            <ProtectedRoute><AlertsPage /></ProtectedRoute>
          </Route>
          <Route path="/print">
            <ProtectedRoute><QrPrintPage /></ProtectedRoute>
          </Route>
          <Route path="/admin">
            <ProtectedRoute><AdminPage /></ProtectedRoute>
          </Route>
          <Route path="/my-equipment">
            <ProtectedRoute><MyEquipmentPage /></ProtectedRoute>
          </Route>
          <Route path="/demo-guide">
            <ProtectedRoute><DemoGuidePage /></ProtectedRoute>
          </Route>
          <Route path="/dashboard">
            <ProtectedRoute><ManagementDashboardPage /></ProtectedRoute>
          </Route>
          <Route path="/settings">
            <ProtectedRoute><SettingsPage /></ProtectedRoute>
          </Route>
          <Route path="/audit-log">
            <ProtectedRoute><AuditLogPage /></ProtectedRoute>
          </Route>
          <Route path="/stability">
            <ProtectedRoute><StabilityDashboardPage /></ProtectedRoute>
          </Route>
          <Route path="/rooms">
            <ProtectedRoute><RoomsListPage /></ProtectedRoute>
          </Route>
          <Route path="/rooms/:id">
            <ProtectedRoute><RoomRadarPage /></ProtectedRoute>
          </Route>
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </Sentry.ErrorBoundary>
  );
}
