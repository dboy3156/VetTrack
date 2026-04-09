import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorCard } from "@/components/ui/error-card";
import { EmptyState } from "@/components/ui/empty-state";
import { computeDashboardData } from "@/lib/dashboard-utils";
import { generateMonthlyReport } from "@/lib/generate-report";
import {
  LayoutDashboard,
  CheckCircle2,
  Wrench,
  AlertTriangle,
  PackageX,
  Users,
  MapPin,
  FileDown,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Activity,
  Server,
  Clock,
  MemoryStick,
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { statusToBadgeVariant } from "@/lib/design-tokens";

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function ManagementDashboardPage() {
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const { data: equipment, isLoading, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
    refetchInterval: 30_000,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["/api/metrics"],
    queryFn: api.metrics.get,
    refetchInterval: 60_000,
    retry: false,
  });

  const dashData = equipment ? computeDashboardData(equipment) : null;
  const counts = dashData?.counts ?? { available: 0, inUse: 0, issues: 0, missing: 0 };
  const criticalItems = dashData?.criticalItems ?? [];
  const userGroups = dashData?.userGroups ?? [];
  const locationGroups = dashData?.locationGroups ?? [];

  const lastUpdated = dataUpdatedAt
    ? format(new Date(dataUpdatedAt), "h:mm:ss a")
    : null;

  function toggleUser(userId: string) {
    setExpandedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function handleGenerateReport() {
    if (!equipment) return;
    generateMonthlyReport(equipment);
  }

  return (
    <Layout>
      <Helmet>
        <title>Management Dashboard — VetTrack</title>
        <meta name="description" content="Live management dashboard for veterinary hospital equipment. Track who has what, monitor locations, review critical alerts, and generate monthly PDF reports." />
        <link rel="canonical" href="https://vettrack.replit.app/dashboard" />
      </Helmet>
      <div className="flex flex-col gap-5 pb-24 animate-fade-in">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold leading-tight">Dashboard</h1>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Updated {lastUpdated}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs bg-card border-border/60 text-muted-foreground hover:text-foreground"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              className="gap-1.5 text-xs"
              onClick={handleGenerateReport}
              disabled={!equipment || equipment.length === 0}
              data-testid="btn-generate-report"
            >
              <FileDown className="w-3.5 h-3.5" />
              Report
            </Button>
          </div>
        </div>

        {isError && (
          <ErrorCard
            message="Failed to load equipment data. Please try again."
            onRetry={() => refetch()}
          />
        )}

        {/* Summary Counts */}
        <div>
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Overview
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {isLoading ? (
              <>
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
                <Skeleton className="h-20 rounded-2xl" />
              </>
            ) : (
              <>
                <Card className="bg-card border-border/60 shadow-sm" data-testid="count-available">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-muted-foreground font-medium">Available</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{counts.available}</p>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border/60 shadow-sm" data-testid="count-in-use">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Users className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground font-medium">In Use</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{counts.inUse}</p>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border/60 shadow-sm" data-testid="count-issues">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Wrench className="w-4 h-4 text-red-400" />
                      <span className="text-xs text-muted-foreground font-medium">Issues</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{counts.issues}</p>
                  </CardContent>
                </Card>

                <Card className="bg-card border-border/60 shadow-sm" data-testid="count-missing">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <PackageX className="w-4 h-4 text-amber-500" />
                      <span className="text-xs text-muted-foreground font-medium">Missing</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{counts.missing}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Critical Alerts */}
        <Card className="bg-card border-border/60 shadow-sm" data-testid="section-critical-alerts">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-muted-foreground" />
              Critical Alerts
              {criticalItems.length > 0 && (
                <span className="ml-auto text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-0.5 rounded-full">
                  {criticalItems.length}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ) : criticalItems.length === 0 ? (
              <div className="flex flex-col items-center py-5 gap-2 text-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400" />
                <p className="text-sm font-medium text-foreground">All clear</p>
                <p className="text-xs text-muted-foreground">All equipment accounted for</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {criticalItems.map((item) => (
                  <Link key={item.id} href={`/equipment/${item.id}`}>
                    <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/60 bg-background hover:bg-muted/50 transition-colors cursor-pointer">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.reason}{item.location ? ` · ${item.location}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant={item.status === "issue" ? "issue" : "maintenance"}
                        className="shrink-0 text-[10px] px-2 py-0.5"
                      >
                        {item.status === "issue" ? "Issue" : "Missing"}
                      </Badge>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Who Has What */}
        <Card className="bg-card border-border/60 shadow-sm" data-testid="section-who-has-what">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              Who Has What
              {userGroups.length > 0 && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {userGroups.length} user{userGroups.length !== 1 ? "s" : ""}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : userGroups.length === 0 ? (
              <div className="flex flex-col items-center py-5 gap-2 text-center">
                <Users className="w-7 h-7 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">All equipment returned</p>
                <p className="text-xs text-muted-foreground">No equipment currently checked out</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {userGroups.map((group) => {
                  const isExpanded = expandedUsers.has(group.userId);
                  return (
                    <div key={group.userId} className="border border-border/60 rounded-xl overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/50 transition-colors text-left min-h-[44px]"
                        onClick={() => toggleUser(group.userId)}
                        data-testid={`user-group-toggle-${group.userId}`}
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">{group.userEmail}</p>
                          <p className="text-xs text-muted-foreground">
                            {group.items.length} item{group.items.length !== 1 ? "s" : ""} checked out
                          </p>
                        </div>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                        )}
                      </button>
                      {isExpanded && (
                        <div className="border-t border-border/60 bg-muted/20">
                          {group.items.map((eq) => (
                            <Link key={eq.id} href={`/equipment/${eq.id}`}>
                              <div className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40 transition-colors border-b border-border/40 last:border-0 cursor-pointer min-h-[44px]">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{eq.name}</p>
                                  {eq.checkedOutLocation && (
                                    <p className="text-xs text-muted-foreground">{eq.checkedOutLocation}</p>
                                  )}
                                </div>
                                <Badge variant={statusToBadgeVariant(eq.status)} className="shrink-0 text-[10px] px-2 py-0.5">
                                  {eq.status}
                                </Badge>
                              </div>
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Location Overview */}
        <Card className="bg-card border-border/60 shadow-sm" data-testid="section-location-overview">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4 text-muted-foreground" />
              Location Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-full rounded-xl" />
                <Skeleton className="h-8 w-full rounded-xl" />
                <Skeleton className="h-8 w-full rounded-xl" />
              </div>
            ) : locationGroups.length === 0 ? (
              <EmptyState
                icon={MapPin}
                message="No location data"
                subMessage="Equipment with assigned locations will appear here"
                iconBg="bg-muted"
                iconColor="text-muted-foreground"
              />
            ) : (
              <div className="flex flex-col gap-3">
                {locationGroups.map((group) => {
                  const total = equipment?.length || 1;
                  const pct = Math.round((group.count / total) * 100);
                  return (
                    <div key={group.location} className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{group.location}</span>
                        <span className="text-xs text-muted-foreground">{group.count} item{group.count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/50 rounded-full transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* System Health */}
        <Card className="bg-card border-border/60 shadow-sm" data-testid="section-system-health">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Activity className="w-4 h-4 text-muted-foreground" />
              System Health
              <span className="ml-auto text-xs text-muted-foreground font-normal">Updates every 60s</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {metricsLoading ? (
              <div className="grid grid-cols-2 gap-3">
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
                <Skeleton className="h-16 rounded-xl" />
              </div>
            ) : !metrics ? (
              <div className="flex flex-col items-center py-5 gap-2 text-center">
                <Server className="w-7 h-7 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Metrics unavailable</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1 p-3 rounded-xl bg-muted/40 border border-border/40">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="w-3.5 h-3.5" />
                    Uptime
                  </div>
                  <p className="text-lg font-bold">{formatUptime(metrics.uptime)}</p>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-xl bg-muted/40 border border-border/40">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <MemoryStick className="w-3.5 h-3.5" />
                    Memory
                  </div>
                  <p className="text-lg font-bold">{metrics.memoryMb}
                    <span className="text-sm font-normal text-muted-foreground">/{metrics.memoryTotalMb} MB</span>
                  </p>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-xl bg-muted/40 border border-border/40">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Users className="w-3.5 h-3.5" />
                    Sessions
                  </div>
                  <p className="text-lg font-bold">{metrics.activeSessions}</p>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-xl border bg-muted/40 border-border/40">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Server className="w-3.5 h-3.5" />
                    Sync Success
                  </div>
                  <p className="text-lg font-bold text-emerald-700">
                    {metrics.syncMetrics?.syncSuccessCount ?? 0}
                  </p>
                </div>
                <div className="flex flex-col gap-1 p-3 rounded-xl border bg-muted/40 border-border/40">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Server className="w-3.5 h-3.5" />
                    Sync Errors
                  </div>
                  <p className={cn(
                    "text-lg font-bold",
                    (metrics.syncMetrics?.syncFailCount ?? 0) > 0 ? "text-amber-700" : ""
                  )}>
                    {metrics.syncMetrics?.syncFailCount ?? 0}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
