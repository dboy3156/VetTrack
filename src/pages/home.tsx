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
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatRelativeTime } from "@/lib/utils";
import { QrScanner } from "@/components/qr-scanner";

const RESUME_KEY = "vettrack_last_equipment_id";

export default function HomePage() {
  const { name, userId } = useAuth();
  const [scannerOpen, setScannerOpen] = useState(false);
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

  const { data: equipment, isLoading, isError: equipmentError } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
  });

  const resumeEquipment = equipment?.find(
    (e) => e.id === resumeEquipmentId && !!e.checkedOutById && e.checkedOutById === userId
  ) ?? null;

  const { data: analytics } = useQuery({
    queryKey: ["/api/analytics"],
    queryFn: api.analytics.summary,
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

  return (
    <Layout onScan={() => setScannerOpen(true)}>
      <Helmet>
        <title>Dashboard — VetTrack</title>
        <meta name="description" content="Real-time veterinary equipment dashboard. View status at a glance, scan QR codes, triage active alerts, and track checked-out equipment across your clinic." />
        <link rel="canonical" href="https://vettrack.replit.app/" />
      </Helmet>
      <div className="flex flex-col gap-6 pb-20 animate-fade-in">
        {/* Greeting */}
        <div className="pt-1">
          <h1 className="text-2xl font-bold leading-tight text-foreground">
            Hello, {name?.split(" ")[0] || "there"} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-1">VetTrack Equipment Dashboard</p>
        </div>

        {equipmentError && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Failed to load equipment data. Please refresh to try again.</p>
            </CardContent>
          </Card>
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
                  className="bg-blue-600 hover:bg-blue-700 text-white h-8 px-3"
                  onClick={() => navigate(`/equipment/${resumeEquipment.id}`)}
                  data-testid="btn-resume-equipment"
                >
                  Continue
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2 text-blue-600 hover:text-blue-800"
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

        {/* Scan CTA */}
        <Button
          size="lg"
          className="w-full gap-3 text-base font-bold shadow-sm"
          onClick={() => setScannerOpen(true)}
          data-testid="btn-scan-qr"
        >
          <Scan className="w-5 h-5" />
          Scan QR Code
        </Button>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card data-testid="stat-total">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <Package className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total
                </span>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <p className="text-3xl font-bold text-foreground">{totalCount}</p>
              )}
            </CardContent>
          </Card>

          <Link href="/alerts">
            <Card
              className={`cursor-pointer transition-colors ${alertCount > 0 ? "border-red-200 bg-red-50/50" : ""}`}
              data-testid="stat-alerts"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle
                    className={`w-4 h-4 ${alertCount > 0 ? "text-red-500" : "text-muted-foreground"}`}
                  />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Alerts
                  </span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p
                    className={`text-3xl font-bold ${alertCount > 0 ? "text-red-600" : "text-foreground"}`}
                  >
                    {alertCount}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link href="/equipment?status=ok">
            <Card className="cursor-pointer transition-colors hover:border-emerald-200" data-testid="stat-ok">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    OK
                  </span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-3xl font-bold text-emerald-600">{okCount}</p>
                )}
              </CardContent>
            </Card>
          </Link>

          <Link href="/equipment?status=issue">
            <Card className="cursor-pointer transition-colors hover:border-amber-200" data-testid="stat-issues">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Wrench className="w-4 h-4 text-amber-500" />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Issues
                  </span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-8 w-12" />
                ) : (
                  <p className="text-3xl font-bold text-amber-600">{issueCount}</p>
                )}
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/equipment/new">
            <Button
              className="w-full h-12 gap-2"
              data-testid="btn-add-equipment"
            >
              <Plus className="w-4 h-4" />
              Add Equipment
            </Button>
          </Link>
          <Link href="/equipment">
            <Button
              variant="outline"
              className="w-full h-12 gap-2"
              data-testid="btn-view-all"
            >
              <Package className="w-4 h-4" />
              View All
            </Button>
          </Link>
          <Link href="/analytics">
            <Button
              variant="secondary"
              className="w-full h-12 gap-2"
              data-testid="btn-analytics"
            >
              <BarChart3 className="w-4 h-4" />
              Analytics
            </Button>
          </Link>
          <Link href="/print">
            <Button
              variant="secondary"
              className="w-full h-12 gap-2"
              data-testid="btn-qr-print"
            >
              <QrCode className="w-4 h-4" />
              QR Print
            </Button>
          </Link>
        </div>

        {/* Alerts preview */}
        {alertCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                Active Alerts
              </h2>
              <Link href="/alerts">
                <Button variant="ghost" size="sm" className="text-primary text-xs">
                  View all
                </Button>
              </Link>
            </div>
            <div className="flex flex-col gap-2">
              {alerts.slice(0, 3).map((alert) => (
                <Link key={`${alert.type}-${alert.equipmentId}`} href={`/equipment/${alert.equipmentId}`}>
                  <Card className="hover:border-primary/30 transition-colors cursor-pointer">
                    <CardContent className="p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{alert.equipmentName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
                      </div>
                      <Badge
                        variant={
                          alert.type === "issue"
                            ? "issue"
                            : alert.type === "overdue"
                              ? "maintenance"
                              : alert.type === "sterilization_due"
                                ? "sterilized"
                                : "secondary"
                        }
                        className="shrink-0"
                      >
                        {alert.type === "sterilization_due"
                          ? "Sterilization Due"
                          : alert.type.charAt(0).toUpperCase() + alert.type.slice(1)}
                      </Badge>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Recent activity */}
        {activityData?.items && activityData.items.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Recent Activity
              </h2>
            </div>
            <div className="flex flex-col gap-2">
              {activityData.items.slice(0, 4).map((item) => (
                <Link key={item.id} href={`/equipment/${item.equipmentId}`}>
                  <Card className="hover:border-primary/20 transition-colors cursor-pointer">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.equipmentName}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.type === "scan"
                              ? `Scanned as ${item.status}`
                              : `Moved to ${item.toFolder || "unfiled"}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {item.status && (
                            <Badge
                              variant={statusToBadgeVariant(item.status)}
                              className="mb-1"
                            >
                              {item.status}
                            </Badge>
                          )}
                          <p className="text-xs text-muted-foreground">
                            {formatRelativeTime(item.timestamp)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

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
    </Layout>
  );
}
