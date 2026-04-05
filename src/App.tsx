import { Switch, Route } from "wouter";
import { Suspense, lazy } from "react";
import * as Sentry from "@sentry/react";
import { Loader2, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { UpdateBanner } from "@/components/update-banner";

const HomePage = lazy(() => import("@/pages/home"));
const LandingPage = lazy(() => import("@/pages/landing"));
const SignInPage = lazy(() => import("@/pages/signin"));
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
const VideoPage = lazy(() => import("@/pages/video"));
const SettingsPage = lazy(() => import("@/pages/settings"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

function ErrorFallback({ error, resetError }: { error: Error; resetError: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-8 h-8 text-destructive" />
        </div>
        <h1 className="text-xl font-bold mb-2">Something went wrong</h1>
        <p className="text-sm text-muted-foreground mb-2">
          An unexpected error occurred. Please try refreshing the page.
        </p>
        {error && (
          <p className="text-xs text-muted-foreground mb-6 font-mono bg-muted rounded px-2 py-1 truncate">
            {error.message}
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

function RootRoute() {
  const { isLoaded, isSignedIn } = useAuth();
  if (!isLoaded) return <PageLoader />;
  if (!isSignedIn) return <LandingPage />;
  return <HomePage />;
}

export default function App() {
  return (
    <Sentry.ErrorBoundary fallback={(props) => <ErrorFallback {...props} />}>
      <UpdateBanner />
      <Suspense fallback={<PageLoader />}>
        <Switch>
          <Route path="/" component={RootRoute} />
          <Route path="/landing" component={LandingPage} />
          <Route path="/signin" component={SignInPage} />
          <Route path="/equipment" component={EquipmentListPage} />
          <Route path="/equipment/new" component={NewEquipmentPage} />
          <Route path="/equipment/:id" component={EquipmentDetailPage} />
          <Route path="/analytics" component={AnalyticsPage} />
          <Route path="/alerts" component={AlertsPage} />
          <Route path="/print" component={QrPrintPage} />
          <Route path="/admin" component={AdminPage} />
          <Route path="/my-equipment" component={MyEquipmentPage} />
          <Route path="/demo-guide" component={DemoGuidePage} />
          <Route path="/dashboard" component={ManagementDashboardPage} />
          <Route path="/video" component={VideoPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route component={NotFoundPage} />
        </Switch>
      </Suspense>
    </Sentry.ErrorBoundary>
  );
}
