import { t } from "@/lib/i18n";
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
import {
  Package,
  AlertTriangle,
  CheckCircle2,
  Wrench,
  Plus,
  Zap,
  Scan,
  ClipboardCheck,
  Activity,
  User,
  Droplets,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatRelativeTime } from "@/lib/utils";
import { statusToBadgeVariant } from "@/lib/design-tokens";
import { QrScanner } from "@/components/qr-scanner";

const STATUS_ICON_MAP: Record<string, React.ElementType> = {
  ok: CheckCircle2,
  issue: AlertTriangle,
  maintenance: Wrench,
  sterilized: Droplets,
};

const STATUS_COLOR_MAP: Record<string, string> = {
  ok: "text-primary",
  issue: "text-destructive",
  maintenance: "text-muted-foreground",
  sterilized: "text-foreground",
};

export default function HomePage() {
  const { name } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
  const [shiftSummaryOpen, setShiftSummaryOpen] = useState(false);
  const [, navigate] = useLocation();
  const searchStr = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    if (params.get("scan") === "1") {
      setScannerOpen(true);
    }
  }, [searchStr]);

  const { data: equipment, isLoading, isError: equipmentError, refetch } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
  });

  const { data: activityData } = useQuery({
    queryKey: ["/api/activity"],
    queryFn: () => api.activity.feed(),
  });

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
      <div className="flex flex-col gap-6 pb-20 animate-fade-in">

        {/* 1. Greeting header */}
        <div className="flex items-start justify-between pt-1 gap-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight text-foreground">
              {t.homePage.greeting(name?.split(" ")[0] || t.homePage.fallbackName)}
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">{ t.home.equipmentOverview }</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs shrink-0 mt-1 min-h-[40px] bg-card border-border/60 text-muted-foreground hover:text-foreground"
            onClick={() => setShiftSummaryOpen(true)}
            data-testid="btn-shift-summary"
          >
            <ClipboardCheck className="w-3.5 h-3.5" />
            {t.home.shiftSummary}
          </Button>
        </div>

        {equipmentError && (
          <ErrorCard
            message={t.equipmentList.errors.loadFailed}
            onRetry={() => refetch()}
          />
        )}

        {/* 2. Primary action — Scan QR Code */}
        <Button
          size="lg"
          className="w-full gap-3 text-base font-semibold shadow-sm min-h-[52px] rounded-2xl active:scale-[0.98] transition-transform"
          onClick={() => setScannerOpen(true)}
          data-testid="btn-scan-qr"
        >
          <Scan className="w-5 h-5" />
          Scan QR Code
        </Button>

        {/* 3. Status overview — 4 stat tiles */}
        <div className="grid grid-cols-4 gap-2">
          <Link href="/equipment">
            <div className="flex flex-col items-center p-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer min-h-[70px] justify-center" data-testid="stat-total">
              <Package className="w-4 h-4 text-muted-foreground mb-1.5" />
              {isLoading ? (
                <Skeleton className="h-5 w-6" />
              ) : (
                <p className="text-lg font-bold text-foreground leading-none">{totalCount}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">{t.homePage.total}</p>
            </div>
          </Link>

          <Link href="/equipment?status=ok">
            <div className="flex flex-col items-center p-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer min-h-[70px] justify-center" data-testid="stat-ok">
              <CheckCircle2 className="w-4 h-4 text-primary mb-1.5" />
              {isLoading ? (
                <Skeleton className="h-5 w-6" />
              ) : (
                <p className="text-lg font-bold text-foreground leading-none">{okCount}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">OK</p>
            </div>
          </Link>

          <Link href="/equipment?status=issue">
            <div className="flex flex-col items-center p-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer min-h-[70px] justify-center" data-testid="stat-issues">
              <AlertTriangle className={`w-4 h-4 mb-1.5 ${issueCount > 0 ? "text-destructive" : "text-muted-foreground"}`} />
              {isLoading ? (
                <Skeleton className="h-5 w-6" />
              ) : (
                <p className={`text-lg font-bold leading-none ${issueCount > 0 ? "text-destructive" : "text-foreground"}`}>{issueCount}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">{t.status.issue}</p>
            </div>
          </Link>

          <Link href="/equipment?status=maintenance">
            <div className="flex flex-col items-center p-3 rounded-2xl bg-card border border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer min-h-[70px] justify-center" data-testid="stat-maintenance">
              <Wrench className={`w-4 h-4 mb-1.5 ${maintenanceCount > 0 ? "text-foreground" : "text-muted-foreground"}`} />
              {isLoading ? (
                <Skeleton className="h-5 w-6" />
              ) : (
                <p className="text-lg font-bold leading-none text-foreground">{maintenanceCount}</p>
              )}
              <p className="text-[10px] text-muted-foreground mt-1">{t.status.maintenance}</p>
            </div>
          </Link>
        </div>

        {/* 4. Active alerts — only shown when relevant */}
        {alertCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                {t.homePage.activeAlerts}
              </h2>
              <Link href="/alerts">
                <Button variant="ghost" size="sm" className="text-muted-foreground text-xs h-7 px-2 hover:text-foreground">
                  {t.homePage.showAll}
                </Button>
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {alerts.slice(0, 3).map((alert) => (
                <Link key={`${alert.type}-${alert.equipmentId}`} href={`/equipment/${alert.equipmentId}`}>
                  <Card className="bg-card border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                    <CardContent className="p-3.5 flex items-center justify-between gap-3 min-h-[56px]">
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
                        className="shrink-0 text-[10px] px-2 py-0.5"
                      >
                        {alert.type === "sterilization_due"
                          ? t.common.sterilization
                          : alert.type.charAt(0).toUpperCase() + alert.type.slice(1)}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
              {alertCount > 3 && (
                <Link href="/alerts">
                  <p className="text-xs text-center text-muted-foreground py-1 hover:text-foreground transition-colors">
                    +{alertCount - 3} more alert{alertCount - 3 !== 1 ? "s" : ""}
                  </p>
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Recent activity — compact, max 4 items */}
        {activityData?.items && activityData.items.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5 mb-3">
              <Activity className="w-4 h-4 text-muted-foreground" />
              {t.homePage.recentActivity}
            </h2>
            <div className="flex flex-col gap-1.5">
              {activityData.items.slice(0, 4).map((item) => {
                const StatusIcon = STATUS_ICON_MAP[item.status ?? "ok"] ?? Activity;
                const statusColor = STATUS_COLOR_MAP[item.status ?? "ok"] ?? "text-muted-foreground";
                const actionText = item.type === "scan"
                  ? (item.note ?? `Updated status to ${item.status}`)
                  : (item.note ?? `Moved to ${item.toFolder || "unfiled"}`);

                return (
                  <Link key={item.id} href={`/equipment/${item.equipmentId}`}>
                    <Card className="bg-card border-border/60 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                      <CardContent className="p-3 flex items-center gap-3 min-h-[52px]">
                        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          <StatusIcon className={`w-3.5 h-3.5 ${statusColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <p className="font-medium text-sm truncate leading-snug">{item.equipmentName}</p>
                            <p className="text-[11px] text-muted-foreground shrink-0 whitespace-nowrap">
                              {formatRelativeTime(item.timestamp)}
                            </p>
                          </div>
                          <p className="text-xs text-muted-foreground truncate">{actionText}</p>
                        </div>
                        {item.status && (
                          <Badge
                            variant={statusToBadgeVariant(item.status)}
                            className="shrink-0 text-[10px] px-1.5 py-0.5"
                          >
                            {item.status}
                          </Badge>
                        )}
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty state — first-time experience */}
        {!isLoading && totalCount === 0 && (
          <Card className="border-border/60 bg-card shadow-sm">
            <CardContent className="p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
                <Zap className="w-7 h-7 text-muted-foreground" />
              </div>
              <h3 className="font-bold text-lg mb-1">{t.homePage.getStarted}</h3>
              <p className="text-sm text-muted-foreground mb-5">
                {t.homePage.getStartedDescription}
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
