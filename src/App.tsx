import { Switch, Route } from "wouter";
import { Suspense, lazy } from "react";
import { Loader2 } from "lucide-react";

const HomePage = lazy(() => import("@/pages/home"));
const EquipmentListPage = lazy(() => import("@/pages/equipment-list"));
const EquipmentDetailPage = lazy(() => import("@/pages/equipment-detail"));
const NewEquipmentPage = lazy(() => import("@/pages/new-equipment"));
const AnalyticsPage = lazy(() => import("@/pages/analytics"));
const AlertsPage = lazy(() => import("@/pages/alerts"));
const QrPrintPage = lazy(() => import("@/pages/qr-print"));
const AdminPage = lazy(() => import("@/pages/admin"));
const MyEquipmentPage = lazy(() => import("@/pages/my-equipment"));
const NotFoundPage = lazy(() => import("@/pages/not-found"));

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        <Route path="/" component={HomePage} />
        <Route path="/equipment" component={EquipmentListPage} />
        <Route path="/equipment/new" component={NewEquipmentPage} />
        <Route path="/equipment/:id" component={EquipmentDetailPage} />
        <Route path="/analytics" component={AnalyticsPage} />
        <Route path="/alerts" component={AlertsPage} />
        <Route path="/print" component={QrPrintPage} />
        <Route path="/admin" component={AdminPage} />
        <Route path="/my-equipment" component={MyEquipmentPage} />
        <Route component={NotFoundPage} />
      </Switch>
    </Suspense>
  );
}
