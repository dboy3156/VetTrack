import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { computeAlerts } from "@/lib/utils";
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
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { formatRelativeTime } from "@/lib/utils";

export default function HomePage() {
  const { name } = useAuth();

  const { data: equipment, isLoading } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
  });

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
    <Layout>
      <div className="flex flex-col gap-6 pb-20 animate-fade-in">
        {/* Greeting */}
        <div className="pt-1">
          <h1 className="text-2xl font-bold text-foreground">
            Hello, {name?.split(" ")[0] || "there"} 👋
          </h1>
          <p className="text-muted-foreground mt-0.5">VetTrack Equipment Dashboard</p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="border-2" data-testid="stat-total">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Package className="w-4 h-4 text-primary" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Total
                </span>
              </div>
              {isLoading ? (
                <Skeleton className="h-9 w-16" />
              ) : (
                <p className="text-3xl font-bold text-foreground">{totalCount}</p>
              )}
            </CardContent>
          </Card>

          <Link href="/alerts">
            <Card
              className={`border-2 cursor-pointer transition-colors ${alertCount > 0 ? "border-red-200 bg-red-50/50" : ""}`}
              data-testid="stat-alerts"
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-1">
                  <AlertTriangle
                    className={`w-4 h-4 ${alertCount > 0 ? "text-red-500" : "text-muted-foreground"}`}
                  />
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Alerts
                  </span>
                </div>
                {isLoading ? (
                  <Skeleton className="h-9 w-12" />
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

          <Card className="border-2" data-testid="stat-ok">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  OK
                </span>
              </div>
              {isLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                <p className="text-3xl font-bold text-emerald-600">{okCount}</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-2" data-testid="stat-issues">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Wrench className="w-4 h-4 text-amber-500" />
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Issues
                </span>
              </div>
              {isLoading ? (
                <Skeleton className="h-9 w-12" />
              ) : (
                <p className="text-3xl font-bold text-amber-600">{issueCount}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/equipment/new">
            <Button
              className="w-full h-14 gap-2 text-sm font-semibold"
              data-testid="btn-add-equipment"
            >
              <Plus className="w-5 h-5" />
              Add Equipment
            </Button>
          </Link>
          <Link href="/equipment">
            <Button
              variant="outline"
              className="w-full h-14 gap-2 text-sm font-semibold"
              data-testid="btn-view-all"
            >
              <Package className="w-5 h-5" />
              View All
            </Button>
          </Link>
          <Link href="/analytics">
            <Button
              variant="secondary"
              className="w-full h-14 gap-2 text-sm font-semibold"
              data-testid="btn-analytics"
            >
              <BarChart3 className="w-5 h-5" />
              Analytics
            </Button>
          </Link>
          <Link href="/print">
            <Button
              variant="secondary"
              className="w-full h-14 gap-2 text-sm font-semibold"
              data-testid="btn-qr-print"
            >
              <QrCode className="w-5 h-5" />
              QR Print
            </Button>
          </Link>
        </div>

        {/* Alerts preview */}
        {alertCount > 0 && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold flex items-center gap-2">
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
                  <Card className="border hover:border-primary/30 transition-colors cursor-pointer">
                    <CardContent className="p-3.5 flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-sm">{alert.equipmentName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{alert.detail}</p>
                      </div>
                      <Badge
                        variant={
                          alert.type === "issue"
                            ? "destructive"
                            : alert.type === "overdue"
                              ? "maintenance" as any
                              : "outline"
                        }
                        className="shrink-0 text-xs"
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
              <h2 className="text-base font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-primary" />
                Recent Activity
              </h2>
            </div>
            <div className="flex flex-col gap-2">
              {activityData.items.slice(0, 4).map((item) => (
                <Link key={item.id} href={`/equipment/${item.equipmentId}`}>
                  <Card className="border hover:border-primary/20 transition-colors cursor-pointer">
                    <CardContent className="p-3.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{item.equipmentName}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.type === "scan"
                              ? `Scanned as ${item.status}`
                              : `Moved to ${item.toFolder || "unfiled"}`}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {item.status && (
                            <Badge
                              variant={item.status as any}
                              className="text-[10px] mb-1"
                            >
                              {item.status}
                            </Badge>
                          )}
                          <p className="text-[10px] text-muted-foreground">
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
          <Card className="border-2 border-dashed">
            <CardContent className="p-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Zap className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-bold text-lg mb-1">Get Started</h3>
              <p className="text-muted-foreground text-sm mb-4">
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
    </Layout>
  );
}
