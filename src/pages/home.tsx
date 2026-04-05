import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ui/error-card";
import { ShiftSummarySheet } from "@/components/shift-summary-sheet";
import { computeAlerts } from "@/lib/utils";
import { statusToBadgeVariant } from "@/lib/design-tokens";
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Plus,
  QrCode,
  BarChart3,
  Activity,
  Zap,
  Scan,
  ClipboardCheck,
  User,
  Droplets,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatRelativeTime } from "@/lib/utils";
import { QrScanner } from "@/components/qr-scanner";
import { OnboardingWalkthrough } from "@/components/onboarding-walkthrough";

const RESUME_KEY = "vettrack_last_equipment_id";

const STATUS_ICON_MAP: Record<string, React.ElementType> = {
  ok: CheckCircle2,
  issue: AlertTriangle,
  maintenance: Wrench,
  sterilized: Droplets,
};

const STATUS_COLOR_MAP: Record<string, string> = {
  ok: "text-emerald-500",
  issue: "text-red-500",
  maintenance: "text-amber-500",
  sterilized: "text-teal-500",
};

export default function HomePage() {
  const { name, userId } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [shiftSummaryOpen, setShiftSummaryOpen] = useState(false);
  const [resumeEquipmentId, setResumeEquipmentId] = useState<string | null>(null);
  const [resumeDismissed, setResumeDismissed] = useState(false);
  const [, navigate] = useLocation();
  const searchStr = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    if (params.get("scan") === "1") {
      setScannerOpen(true);
    }
  }, [searchStr]);

  useEffect(() => {
    const storedId = localStorage.getItem(RESUME_KEY);
    if (storedId) {
      setResumeEquipmentId(storedId);
    }
  }, []);

  const { data: equipment, isLoading, isError: equipmentError, refetch } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
  });

  const resumeEquipment = equipment?.find(
    (e) => e.id === resumeEquipmentId && !!e.checkedOutById && e.checkedOutById === userId
  ) ?? null;

  const { data: activityData } = useQuery({
    queryKey: ["/api/activity"],
    queryFn: () => api.activity.feed(),
  });

  const { data: scanCountData } = useQuery({
    queryKey: ["/api/activity/my-scan-count"],
    queryFn: api.activity.myScanCount,
  });

  const hasScanned = scanCountData !== undefined ? scanCountData.count > 0 : true;

  const alerts = equipment ? computeAlerts(equipment) : [];
  const alertCount = alerts.length;
  const totalCount = equipment?.length ?? 0;
  const okCount = equipment?.filter((e) => e.status === "ok").length ?? 0;
  const issueCount = equipment?.filter((e) => e.status === "issue").length ?? 0;
  const maintenanceCount = equipment?.filter((e) => e.status === "maintenance").length ?? 0;

  return (
    <Layout onScan={() => setScannerOpen(true)}>
      <Helmet>
        <title>Dashboard — VetTrack</title>
        <meta name="description" content="Real-time veterinary equipment dashboard. View status at a glance, scan QR codes, triage active alerts, and track checked-out equipment across your clinic." />
        <link rel="canonical" href="https://vettrack.replit.app/" />
      </Helmet>
      <div className="flex flex-col gap-4 pb-20 animate-fade-in">
        {/* Greeting */}
        <div className="flex items-start justify-between pt-1 gap-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight text-foreground">
              Hello, {name?.split(" ")[0] || "there"} 👋
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">VetTrack Equipment Dashboard</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs shrink-0 mt-1 min-h-[44px]"
            onClick={() => setShiftSummaryOpen(true)}
            data-testid="btn-shift-summary"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            Shift Summary
          </Button>
        </div>

        {equipmentError && (
          <ErrorCard
            message="Failed to load equipment data. Please try again."
            onRetry={() => refetch()}
          />
        )}

        {/* Resume banner */}
        {resumeEquipment && !resumeDismissed && (
          <Card className="border-2 border-blue-200 bg-blue-50">
            <CardContent className="p-3.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs text-blue-600 font-medium">Continue where you left off</p>
                <p className="font-semibold text-sm text-blue-900 truncate">{resumeEquipment.name}</p>
              </div>
              <div className="flex gap-2 shrink-0">
                <Button
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 text-white h-9 px-3"
                  onClick={() => navigate(`/equipment/${resumeEquipment.id}`)}
                  data-testid="btn-resume-equipment"
                >
                  Continue
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9 px-2 text-blue-600 hover:text-blue-800"
                  onClick={() => {
                    setResumeDismissed(true);
                    localStorage.removeItem(RESUME_KEY);
                  }}
                  data-testid="btn-resume-dismiss"
                >
                  ✕
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Onboarding walkthrough — shown once for new users with no scan history */}
        {!isLoading && scanCountData !== undefined && (
          <OnboardingWalkthrough show={!hasScanned} />
        )}

        {/* Scan CTA — prominent, always accessible */}
        <Button
          size="lg"
          className="w-full gap-3 text-base font-bold shadow-sm min-h-[52px] active:scale-[0.98] transition-transform"
          onClick={() => setScannerOpen(true)}
          data-testid="btn-scan-qr"
        >
          <Scan className="w-5 h-5" />
          Scan QR Code
        </Button>

        {/* Condensed stat strip — strict color semantics: Red=Issue, Amber=Maintenance */}
        <div className="grid grid-cols-4 gap-2">
          <Link href="/equipment">
            <div className="flex flex-col items-center p-2.5 rounded-xl border bg-card hover:border-primary/30 transition-colors cursor-pointer min-h-[64px] justify-center" data-testid="stat-total">
              <Package className="w-4 h-4 text-primary mb-1" />
              {isLoading ? (
                <Skeleton className="h-5 w-6" />
              ) : (
                <p className="text-lg font-bold text-foreground leading-none">{totalCount}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">Total</p>
            </div>
          </Link>

          <Link href="/equipment?status=ok">
            <div className="flex flex-col items-center p-2.5 rounded-xl border bg-card hover:border-emerald-200 transition-colors cursor-pointer min-h-[64px] justify-center" data-testid="stat-ok">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mb-1" />
              {isLoading ? (
                <Skeleton className="h-5 w-6" />
              ) : (
                <p className="text-lg font-bold text-emerald-600 leading-none">{okCount}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">OK</p>
            </div>
          </Link>

          {/* Issues — red (critical/safety signal) */}
          <Link href="/equipment?status=issue">
            <div className={`flex flex-col items-center p-2.5 rounded-xl border transition-colors cursor-pointer min-h-[64px] justify-center ${issueCount > 0 ? "border-red-200 bg-red-50/50" : "bg-card hover:border-red-200"}`} data-testid="stat-issues">
              <AlertTriangle className={`w-4 h-4 mb-1 ${issueCount > 0 ? "text-red-500" : "text-muted-foreground"}`} />
              {isLoading ? (
                <Skeleton className="h-5 w-6" />
              ) : (
                <p className={`text-lg font-bold leading-none ${issueCount > 0 ? "text-red-600" : "text-foreground"}`}>{issueCount}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">Issues</p>
            </div>
          </Link>

          {/* Maintenance — amber (scheduled, non-critical) */}
          <Link href="/equipment?status=maintenance">
            <div className={`flex flex-col items-center p-2.5 rounded-xl border transition-colors cursor-pointer min-h-[64px] justify-center ${maintenanceCount > 0 ? "border-amber-200 bg-amber-50/50" : "bg-card hover:border-amber-200"}`} data-testid="stat-maintenance">
              <Wrench className={`w-4 h-4 mb-1 ${maintenanceCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              {isLoading ? (
                <Skeleton className="h-5 w-6" />
              ) : (
                <p className={`text-lg font-bold leading-none ${maintenanceCount > 0 ? "text-amber-600" : "text-foreground"}`}>{maintenanceCount}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-0.5">Maint.</p>
            </div>
          </Link>
        </div>

        {/* Quick actions row */}
        <div className="grid grid-cols-2 gap-2">
          <Link href="/equipment/new">
            <Button
              className="w-full h-11 gap-2"
              data-testid="btn-add-equipment"
            >
              <Plus className="w-4 h-4" />
              Add Equipment
            </Button>
          </Link>
          <Link href="/equipment">
            <Button
              variant="outline"
              className="w-full h-11 gap-2"
              data-testid="btn-view-all"
            >
              <Package className="w-4 h-4" />
              View All
            </Button>
          </Link>
        </div>

        {/* Alerts preview strip — only if active */}
        {alertCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold flex items-center gap-1.5 text-red-600">
                <AlertTriangle className="w-4 h-4" />
                Active Alerts
              </h2>
              <Link href="/alerts">
                <Button variant="ghost" size="sm" className="text-primary text-xs h-7 px-2">
                  View all
                </Button>
              </Link>
            </div>
            <div className="flex flex-col gap-1.5">
              {alerts.slice(0, 2).map((alert) => (
                <Link key={`${alert.type}-${alert.equipmentId}`} href={`/equipment/${alert.equipmentId}`}>
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl border border-red-100 bg-red-50/50 hover:border-red-200 transition-colors cursor-pointer min-h-[52px]">
                    <div className="min-w-0">
                      <p className="font-semibold text-sm truncate">{alert.equipmentName}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{alert.detail}</p>
                    </div>
                    <Badge
                      variant={
                        alert.type === "issue"
                          ? "issue"
                          : alert.type === "overdue"
                            ? "maintenance"
                            : "sterilized"
                      }
                      className="shrink-0"
                    >
                      {alert.type === "sterilization_due"
                        ? "Sterilization Due"
                        : alert.type.charAt(0).toUpperCase() + alert.type.slice(1)}
                    </Badge>
                  </div>
                </Link>
              ))}
              {alertCount > 2 && (
                <Link href="/alerts">
                  <p className="text-xs text-center text-red-600 font-medium py-1 hover:underline">
                    +{alertCount - 2} more alert{alertCount - 2 !== 1 ? "s" : ""}
                  </p>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* WhatsApp-style Activity Feed — primary content */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold flex items-center gap-1.5 text-foreground">
              <Activity className="w-4 h-4 text-primary" />
              Recent Activity
            </h2>
          </div>

          {activityData?.items && activityData.items.length > 0 ? (
            <div className="flex flex-col gap-1">
              {activityData.items.slice(0, 8).map((item) => {
                const StatusIcon = STATUS_ICON_MAP[item.status ?? "ok"] ?? Activity;
                const statusColor = STATUS_COLOR_MAP[item.status ?? "ok"] ?? "text-muted-foreground";
                const actionText = item.type === "scan"
                  ? (item.note ?? `Updated status to ${item.status}`)
                  : (item.note ?? `Moved to ${item.toFolder || "unfiled"}`);

                return (
                  <Link key={item.id} href={`/equipment/${item.equipmentId}`}>
                    <div className="flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-muted/40 transition-colors cursor-pointer min-h-[52px]">
                      {/* Status avatar */}
                      <div className={`w-8 h-8 rounded-full bg-muted/60 flex items-center justify-center shrink-0 mt-0.5`}>
                        <StatusIcon className={`w-4 h-4 ${statusColor}`} />
                      </div>
                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-sm truncate leading-snug">{item.equipmentName}</p>
                          <p className="text-[11px] text-muted-foreground shrink-0 mt-0.5 whitespace-nowrap">
                            {formatRelativeTime(item.timestamp)}
                          </p>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {actionText}
                        </p>
                        {item.userEmail && (
                          <p className="text-[11px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {item.userEmail.split("@")[0]}
                          </p>
                        )}
                      </div>
                      {/* Status badge on right */}
                      {item.status && (
                        <Badge
                          variant={statusToBadgeVariant(item.status)}
                          className="shrink-0 self-start mt-0.5"
                        >
                          {item.status}
                        </Badge>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : activityData?.items?.length === 0 ? (
            <div className="flex flex-col items-center py-8 gap-2 text-center">
              <Activity className="w-8 h-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
              <p className="text-xs text-muted-foreground">Scan equipment to see activity here.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-xl" />
              ))}
            </div>
          )}
        </div>

        {/* Empty state */}
        {!isLoading && totalCount === 0 && (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-1">Get Started</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Add your first piece of equipment to start tracking.
              </p>
              <Link href="/equipment/new">
                <Button data-testid="btn-get-started">
                  <Plus className="w-4 h-4 mr-2" />
                  Add Equipment
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {scannerOpen && (
        <QrScanner onClose={() => setScannerOpen(false)} />
      )}

      <ShiftSummarySheet
        open={shiftSummaryOpen}
        onClose={() => setShiftSummaryOpen(false)}
      />
    </Layout>
  );
}
