import { Route, Switch, Redirect } from "wouter";
import { lazy } from "react";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { GuestGuard } from "@/features/auth/components/GuestGuard";
import { PageErrorBoundary } from "@/components/ui/page-error-boundary";
import { useAuth } from "@/hooks/use-auth";

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
const ShiftHandoverPage = lazy(() => import("@/pages/shift-handover-page"));
const InventoryPage = lazy(() => import("@/pages/inventory-page"));
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
const AppointmentsPage = lazy(() => import("@/pages/appointments"));
const MedicationHubPage = lazy(() => import("@/pages/meds"));
const PharmacyForecastPage = lazy(() => import("@/pages/pharmacy-forecast"));
const CodeBluePage = lazy(() => import("@/pages/code-blue"));
const AppTourPage = lazy(() => import("@/pages/app-tour"));
const WhatsNewPage = lazy(() => import("@/pages/whats-new"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));
const BillingLedgerPage = lazy(() => import("@/pages/billing-ledger"));
const PatientDetailPage = lazy(() => import("@/pages/patient-detail"));
const InventoryItemsPage = lazy(() => import("@/pages/inventory-items"));
const ProcurementPage = lazy(() => import("@/pages/procurement"));

// Guards the root path: renders nothing while auth resolves (prevents flicker),
// redirects authenticated users to /home, shows LandingPage otherwise.
function RootRoute() {
  const { isLoaded, isSignedIn, isOfflineSession } = useAuth();
  const authKnown = isLoaded || isOfflineSession;
  if (!authKnown) return null;
  if (isSignedIn) return <Redirect to="/home" replace />;
  return <LandingPage />;
}

export function AppRoutes() {
  return (
    <PageErrorBoundary fallbackLabel="Page rendering failed">
      <Switch>
        <Route path="/" component={RootRoute} />
        <Route path="/landing" component={LandingPage} />
        {/* `/*?` so Clerk path-routed sign-in/up substeps (e.g. /signin/factor-one) still match */}
        <Route path="/signin/*?"><GuestGuard><SignInPage /></GuestGuard></Route>
        <Route path="/signup/*?"><GuestGuard><SignUpPage /></GuestGuard></Route>

        <Route path="/home"><AuthGuard><HomePage /></AuthGuard></Route>
        <Route path="/equipment"><AuthGuard><EquipmentPage /></AuthGuard></Route>
        <Route path="/equipment/new"><AuthGuard><NewEquipmentPage /></AuthGuard></Route>
        <Route path="/equipment/:id/edit"><AuthGuard><NewEquipmentPage /></AuthGuard></Route>
        <Route path="/equipment/:id/qr"><AuthGuard><EquipmentQrPrintPage /></AuthGuard></Route>
        <Route path="/equipment/:id"><AuthGuard><EquipmentDetailPage /></AuthGuard></Route>
        <Route path="/alerts"><AuthGuard><AlertsPage /></AuthGuard></Route>
        <Route path="/my-equipment"><AuthGuard><MyEquipmentPage /></AuthGuard></Route>
        <Route path="/rooms"><AuthGuard><RoomsListPage /></AuthGuard></Route>
        <Route path="/rooms/:id"><AuthGuard><RoomRadarPage /></AuthGuard></Route>
        <Route path="/shift-handover"><AuthGuard><ShiftHandoverPage /></AuthGuard></Route>
        <Route path="/inventory"><AuthGuard><InventoryPage /></AuthGuard></Route>
        <Route path="/analytics"><AuthGuard><AnalyticsPage /></AuthGuard></Route>
        <Route path="/dashboard"><AuthGuard><ManagementDashboardPage /></AuthGuard></Route>
        <Route path="/print"><AuthGuard><QrPrintPage /></AuthGuard></Route>
        <Route path="/admin"><AuthGuard><AdminPage /></AuthGuard></Route>
        <Route path="/admin/shifts"><AuthGuard><AdminShiftsPage /></AuthGuard></Route>
        <Route path="/appointments"><AuthGuard><AppointmentsPage /></AuthGuard></Route>
        <Route path="/meds"><AuthGuard><MedicationHubPage /></AuthGuard></Route>
        <Route path="/pharmacy-forecast"><AuthGuard><PharmacyForecastPage /></AuthGuard></Route>
        <Route path="/code-blue"><AuthGuard><CodeBluePage /></AuthGuard></Route>
        <Route path="/app-tour"><AuthGuard><AppTourPage /></AuthGuard></Route>
        <Route path="/stability"><AuthGuard><StabilityDashboardPage /></AuthGuard></Route>
        <Route path="/settings"><AuthGuard><SettingsPage /></AuthGuard></Route>
        <Route path="/help"><AuthGuard><HelpPage /></AuthGuard></Route>
        <Route path="/audit-log"><AuthGuard><AuditLogPage /></AuthGuard></Route>
        <Route path="/whats-new"><AuthGuard><WhatsNewPage /></AuthGuard></Route>
        <Route path="/billing"><AuthGuard><BillingLedgerPage /></AuthGuard></Route>
        <Route path="/patients/:id"><AuthGuard><PatientDetailPage /></AuthGuard></Route>
        <Route path="/inventory-items"><AuthGuard><InventoryItemsPage /></AuthGuard></Route>
        <Route path="/procurement"><AuthGuard><ProcurementPage /></AuthGuard></Route>
        <Route component={NotFoundPage} />
      </Switch>
    </PageErrorBoundary>
  );
}
