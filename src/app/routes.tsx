import { Route } from "wouter";
import { lazy } from "react";
import { AuthGuard } from "@/features/auth/components/AuthGuard";

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
const AppointmentsPage = lazy(() => import("@/pages/appointments"));
const WhatsNewPage = lazy(() => import("@/pages/whats-new"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

export function AppRoutes() {
  return (
    <>
      <Route path="/landing" component={LandingPage} />
      {/* `/*?` so Clerk path-routed sign-in/up substeps (e.g. /signin/factor-one) still match */}
      <Route path="/signin/*?" component={SignInPage} />
      <Route path="/signup/*?" component={SignUpPage} />

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
      <Route path="/appointments"><AuthGuard><AppointmentsPage /></AuthGuard></Route>
      <Route path="/stability"><AuthGuard><StabilityDashboardPage /></AuthGuard></Route>
      <Route path="/settings"><AuthGuard><SettingsPage /></AuthGuard></Route>
      <Route path="/help"><AuthGuard><HelpPage /></AuthGuard></Route>
      <Route path="/audit-log"><AuthGuard><AuditLogPage /></AuthGuard></Route>
      <Route path="/whats-new"><AuthGuard><WhatsNewPage /></AuthGuard></Route>
      <Route component={NotFoundPage} />
    </>
  );
}
