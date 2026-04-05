import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  computeDashboardCounts,
  computeCriticalItems,
  computeUserGroups,
  computeLocationGroups,
} from "@/lib/dashboard-utils";
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
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "wouter";
import { cn } from "@/lib/utils";

export default function ManagementDashboardPage() {
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const { data: equipment, isLoading, isError, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
    refetchInterval: 30_000,
  });

  const counts = equipment ? computeDashboardCounts(equipment) : { available: 0, inUse: 0, issues: 0, missing: 0 };
  const criticalItems = equipment ? computeCriticalItems(equipment) : [];
  const userGroups = equipment ? computeUserGroups(equipment) : [];
  const locationGroups = equipment ? computeLocationGroups(equipment) : [];

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
      <div className="flex flex-col gap-4 pb-24 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <LayoutDashboard className="w-6 h-6 text-primary" />
              Dashboard
            </h1>
            {lastUpdated && (
              <p className="text-xs text-muted-foreground mt-0.5">
                Last updated: {lastUpdated}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
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
              Generate Monthly Report
            </Button>
          </div>
        </div>

        {isError && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Failed to load equipment data. Please refresh.</p>
            </CardContent>
          </Card>
        )}

        {/* Summary Counts */}
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
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
                <Card className="border-2 border-emerald-200 bg-emerald-50/50" data-testid="count-available">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-muted-foreground font-medium">Available</span>
                    </div>
                    <p className="text-2xl font-bold text-emerald-700">{counts.available}</p>
                  </CardContent>
                </Card>

                <Card className="border-2 border-blue-200 bg-blue-50/50" data-testid="count-in-use">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-muted-foreground font-medium">In Use</span>
                    </div>
                    <p className="text-2xl font-bold text-blue-700">{counts.inUse}</p>
                  </CardContent>
                </Card>

                <Card className="border-2 border-red-200 bg-red-50/50" data-testid="count-issues">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Wrench className="w-4 h-4 text-red-500" />
                      <span className="text-xs text-muted-foreground font-medium">Issues</span>
                    </div>
                    <p className="text-2xl font-bold text-red-700">{counts.issues}</p>
                  </CardContent>
                </Card>

                <Card className="border-2 border-amber-200 bg-amber-50/50" data-testid="count-missing">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <PackageX className="w-4 h-4 text-amber-500" />
                      <span className="text-xs text-muted-foreground font-medium">Missing</span>
                    </div>
                    <p className="text-2xl font-bold text-amber-700">{counts.missing}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {/* Critical Alerts */}
        <Card data-testid="section-critical-alerts">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Critical Alerts
              {criticalItems.length > 0 && (
                <Badge variant="destructive" className="ml-auto text-xs">
                  {criticalItems.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-10 w-full rounded-xl" />
              </div>
            ) : criticalItems.length === 0 ? (
              <div className="flex flex-col items-center py-6 gap-2 text-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
                <p className="text-sm font-medium text-emerald-700">No issues</p>
                <p className="text-xs text-muted-foreground">All equipment accounted for</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {criticalItems.map((item) => (
                  <Link key={item.id} href={`/equipment/${item.id}`}>
                    <div className={cn(
                      "flex items-center justify-between gap-3 p-3 rounded-xl border transition-colors hover:bg-muted/50 cursor-pointer",
                      item.status === "issue"
                        ? "bg-red-50 border-red-200"
                        : "bg-amber-50 border-amber-200"
                    )}>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate">{item.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {item.reason}{item.location ? ` · ${item.location}` : ""}
                        </p>
                      </div>
                      <Badge
                        variant={item.status === "issue" ? "destructive" : "outline"}
                        className={cn(
                          "shrink-0 text-[10px]",
                          item.status !== "issue" && "border-amber-400 text-amber-700 bg-amber-50"
                        )}
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
        <Card data-testid="section-who-has-what">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Who Has What
              {userGroups.length > 0 && (
                <Badge variant="secondary" className="ml-auto text-xs">
                  {userGroups.length} user{userGroups.length !== 1 ? "s" : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-12 w-full rounded-xl" />
                <Skeleton className="h-12 w-full rounded-xl" />
              </div>
            ) : userGroups.length === 0 ? (
              <div className="flex flex-col items-center py-6 gap-2 text-center">
                <Users className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm font-medium text-muted-foreground">All equipment returned</p>
                <p className="text-xs text-muted-foreground">No equipment currently checked out</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {userGroups.map((group) => {
                  const isExpanded = expandedUsers.has(group.userId);
                  return (
                    <div key={group.userId} className="border rounded-xl overflow-hidden">
                      <button
                        className="w-full flex items-center justify-between gap-3 p-3 hover:bg-muted/50 transition-colors text-left"
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
                        <div className="border-t bg-muted/20">
                          {group.items.map((eq) => (
                            <Link key={eq.id} href={`/equipment/${eq.id}`}>
                              <div className="flex items-center justify-between gap-3 px-4 py-2.5 hover:bg-muted/40 transition-colors border-b last:border-0 cursor-pointer">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium truncate">{eq.name}</p>
                                  {eq.checkedOutLocation && (
                                    <p className="text-xs text-muted-foreground">{eq.checkedOutLocation}</p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="text-[10px] shrink-0">
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
        <Card data-testid="section-location-overview">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              Location Overview
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-full rounded-xl" />
                <Skeleton className="h-8 w-full rounded-xl" />
                <Skeleton className="h-8 w-full rounded-xl" />
              </div>
            ) : locationGroups.length === 0 ? (
              <div className="flex flex-col items-center py-6 gap-2 text-center">
                <MapPin className="w-8 h-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No location data available</p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {locationGroups.map((group) => {
                  const total = equipment?.length || 1;
                  const pct = Math.round((group.count / total) * 100);
                  return (
                    <div key={group.location} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium">{group.location}</span>
                        <span className="text-xs text-muted-foreground">{group.count} item{group.count !== 1 ? "s" : ""}</span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
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
      </div>
    </Layout>
  );
}
