import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuditRowSkeleton } from "@/components/ui/skeleton-cards";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Shield,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  AlertTriangle,
  RefreshCw,
  User,
} from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageErrorBoundary } from "@/components/ui/page-error-boundary";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import type { AuditLog } from "@/types";
import { t } from "@/lib/i18n";

// Client-side rows per page — DOM never holds more than ROWS_PER_PAGE divs.
const ROWS_PER_PAGE = 8;

const ACTION_TYPE_LABELS: Record<string, string> = {
  user_login: "User Login",
  user_provisioned: "User Provisioned",
  user_role_changed: "Role Changed",
  user_status_changed: "Status Changed",
  equipment_created: "Equipment Created",
  equipment_updated: "Equipment Updated",
  equipment_deleted: "Equipment Deleted",
  equipment_scanned: "Equipment Scanned",
  equipment_checked_out: "Checked Out",
  equipment_returned: "Returned",
  equipment_reverted: "Scan Reverted",
  equipment_bulk_deleted: "Bulk Deleted",
  equipment_bulk_moved: "Bulk Moved",
  equipment_imported: "Equipment Imported",
  folder_created: "Folder Created",
  folder_updated: "Folder Updated",
  folder_deleted: "Folder Deleted",
  alert_acknowledged: "Alert Acknowledged",
  alert_acknowledgment_removed: "Alert Ack Removed",
  "system.init": "System Initialised",
  "system.verified": "System Verified",
  "rounds.started": "Rounds Started",
  "rounds.completed": "Rounds Completed",
  "equipment.scan": "Equipment Scanned",
  "equipment.checkout": "Equipment Checked Out",
  "equipment.transfer": "Equipment Transferred",
  "equipment.maintenance_review": "Maintenance Review",
  "equipment.request": "Equipment Requested",
  "alert.received": "Alert Received",
  "audit_log.search": "Audit Log Search",
  "report.viewed": "Report Viewed",
};

const ALL_ACTION_TYPES = Object.keys(ACTION_TYPE_LABELS);

function actionLabel(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType] ?? actionType;
}

function actionBadgeClass(actionType: string): string {
  if (actionType.includes("deleted") || actionType.includes("issue")) return "bg-destructive/10 text-destructive";
  if (actionType.includes("created") || actionType.includes("provisioned") || actionType.includes("init") || actionType.includes("verified")) {
    return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  }
  if (actionType.includes("login") || actionType.includes("checkout") || actionType.includes("scan")) {
    return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  }
  if (actionType.includes("transfer") || actionType.includes("moved") || actionType.includes("request")) {
    return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400";
  }
  if (actionType.includes("rounds") || actionType.includes("report") || actionType.includes("review") || actionType.includes("maintenance")) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  }
  if (actionType.includes("role") || actionType.includes("status")) {
    return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  }
  return "bg-muted text-muted-foreground";
}

function AuditLogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);
  const meta = log.metadata as Record<string, unknown> | null | undefined;

  const noteText = meta?.note as string | undefined;
  const equipmentName = meta?.equipmentName as string | undefined;

  return (
    <div className="border-b last:border-b-0" style={{ minHeight: 60 }}>
      <button
        className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          {/* Timestamp — flexShrink:0 + fixed minWidth prevents sibling shift */}
          <span
            className="text-xs text-muted-foreground whitespace-nowrap pt-0.5"
            style={{ flexShrink: 0, minWidth: 130 }}
          >
            {format(new Date(log.timestamp), "MMM d, h:mm a")}
          </span>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Action badge + equipment name */}
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${actionBadgeClass(log.actionType)}`}
                style={{ flexShrink: 0 }}
              >
                {actionLabel(log.actionType)}
              </span>
              {equipmentName && (
                <span className="text-xs font-medium text-foreground truncate">
                  {equipmentName}
                </span>
              )}
            </div>

            {/* Staff name + email */}
            <div className="flex items-center gap-1 mt-0.5">
              <User className="w-3 h-3 text-muted-foreground" style={{ flexShrink: 0 }} />
              <span className="text-xs text-muted-foreground truncate">
                {log.performedByEmail ?? ""}
              </span>
            </div>

            {/* Note preview */}
            {noteText && !expanded && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {noteText}
              </p>
            )}
          </div>

          {/* Target ID pill — flexShrink:0 so it never collapses */}
          {log.targetId && (
            <span
              className="text-xs text-muted-foreground whitespace-nowrap font-mono hidden sm:block"
              style={{ flexShrink: 0 }}
            >
              {log.targetId.slice(0, 8)}…
            </span>
          )}
        </div>
      </button>

      {/* Expanded metadata */}
      {expanded && meta && (
        <div className="px-4 pb-3">
          <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words">
            {JSON.stringify(meta, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export function SharedAuditLogsPanel({
  compact = false,
}: {
  compact?: boolean;
}) {
  // Server-side filter state
  const [actionType, setActionType] = useState<string>("");
  const [performedBy, setPerformedBy] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [serverPage, setServerPage] = useState(1);

  // Client-side page within the current server page's result set
  const [clientPage, setClientPage] = useState(1);

  const serverParams = {
    actionType: actionType || undefined,
    performedBy: performedBy.trim() || undefined,
    from: from || undefined,
    to: to || undefined,
    page: serverPage,
  };

  const { data, isLoading, isError, isRefetching, refetch } = useQuery({
    queryKey: ["/api/audit-logs", serverParams],
    queryFn: () => api.auditLogs.list(serverParams),
  });

  // All items returned by the server for this page
  const allItems = data?.items ?? [];

  // Client-side pagination — bounded to ROWS_PER_PAGE DOM nodes at all times.
  const clientTotalPages = Math.max(1, Math.ceil(allItems.length / ROWS_PER_PAGE));
  const safeClientPage = Math.min(clientPage, clientTotalPages);

  const pageItems = useMemo(
    () => allItems.slice((safeClientPage - 1) * ROWS_PER_PAGE, safeClientPage * ROWS_PER_PAGE),
    [allItems, safeClientPage],
  );

  // Reset client page whenever the server data changes (filter/page change)
  useEffect(() => {
    setClientPage(1);
  }, [data]);

  function handleFilter() {
    setServerPage(1);
    setClientPage(1);
  }

  function handleReset() {
    setActionType("");
    setPerformedBy("");
    setFrom("");
    setTo("");
    setServerPage(1);
    setClientPage(1);
  }

  const hasActiveFilter = !!(actionType || performedBy.trim() || from || to);

  return (
    <div className={compact ? "space-y-4" : "space-y-6"}>
      {/* Filters */}
      <PageErrorBoundary fallbackLabel="Filters failed to render">
        <Card>
          {!compact && (
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
          )}
          <CardContent className={compact ? "pt-4" : undefined}>
            <div className="flex flex-wrap gap-4 items-end">
              {/* Staff name filter */}
              <div className="flex flex-col gap-1.5 min-w-[160px]">
                <Label className="text-xs">{t.adminPage.logFilterStaff}</Label>
                <div className="relative">
                  <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    placeholder="e.g. Sigal, Dana…"
                    value={performedBy}
                    onChange={(e) => setPerformedBy(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleFilter()}
                    className="h-8 text-sm pl-8"
                  />
                </div>
              </div>

              {/* Action type */}
              <div className="flex flex-col gap-1.5 min-w-[180px]">
                <Label className="text-xs">{t.adminPage.logFilterAction}</Label>
                <Select value={actionType || "all"} onValueChange={(v) => setActionType(v === "all" ? "" : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {ALL_ACTION_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{ACTION_TYPE_LABELS[type]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Date range */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{t.adminPage.logFilterFrom}</Label>
                <Input
                  type="date"
                  placeholder="מ-תאריך"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{t.adminPage.logFilterTo}</Label>
                <Input
                  type="date"
                  placeholder="עד-תאריך"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>

              <div className="flex gap-2">
                <Button size="sm" className="h-11 text-xs" onClick={handleFilter}>{t.adminPage.logFilterApply}</Button>
                {hasActiveFilter && (
                  <Button size="sm" variant="outline" className="h-11 text-xs" onClick={handleReset}>{t.adminPage.logFilterReset}</Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </PageErrorBoundary>

      {/* Log table */}
      <PageErrorBoundary fallbackLabel="Audit log table failed to render">
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              /* Skeleton — AuditRowSkeleton pixel-matches the real row (minHeight:60). */
              <div>
                {[...Array(ROWS_PER_PAGE)].map((_, i) => (
                  <AuditRowSkeleton key={i} />
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                <AlertTriangle className="w-8 h-8 text-destructive opacity-60" />
                <div>
                  <p className="text-sm font-medium text-foreground">Failed to load audit log</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Check your connection and try again</p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => refetch()}
                  disabled={isRefetching}
                  className="gap-1.5 h-11 text-xs"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRefetching ? "animate-spin" : ""}`} />
                  {isRefetching ? "Trying…" : "Try Again"}
                </Button>
              </div>
            ) : !allItems.length ? (
              <div className="py-4">
                <EmptyState
                  icon={ClipboardList}
                  message="No log entries found"
                  subMessage={
                    hasActiveFilter
                      ? "No entries match the current filters. Try adjusting the staff name, action type, or date range."
                      : "Audit entries appear here as actions are performed in VetTrack."
                  }
                  action={
                    hasActiveFilter ? (
                      <button
                        onClick={handleReset}
                        className="text-sm text-primary hover:underline font-medium"
                      >
                        Clear filters
                      </button>
                    ) : undefined
                  }
                />
              </div>
            ) : (
              <div>
                {/* Summary bar */}
                <div className="px-4 py-2 border-b bg-muted/30 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    {t.adminPage.logEntries(allItems.length, Boolean(data?.hasMore))}
                    {" · "}
                    {t.adminPage.logClientPage(safeClientPage, clientTotalPages)}
                    {hasActiveFilter && <span className="ml-1 text-primary font-medium">· Filtered</span>}
                  </span>
                  {isRefetching && (
                    <RefreshCw className="w-3 h-3 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/*
                  Log body — minHeight: ROWS_PER_PAGE * 60px so page transitions
                  never collapse the container (CLS eliminated on navigation).
                */}
                <div style={{ minHeight: ROWS_PER_PAGE * 60 }}>
                  {pageItems.map((log) => (
                    <AuditLogRow key={log.id} log={log} />
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </PageErrorBoundary>

      {/* Client-side page controls */}
      {!isLoading && !isError && clientTotalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={safeClientPage <= 1}
            onClick={() => setClientPage((p) => Math.max(1, p - 1))}
            className="gap-1 h-11 text-xs"
            data-testid="btn-prev-client-page"
          >
            <ChevronLeft className="w-4 h-4" />
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            {safeClientPage} / {clientTotalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={safeClientPage >= clientTotalPages}
            onClick={() => setClientPage((p) => Math.min(clientTotalPages, p + 1))}
            className="gap-1 h-11 text-xs"
            data-testid="btn-next-client-page"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Server-side page controls — appears only when server has more than 50 entries */}
      {data && (data.hasMore || serverPage > 1) && (
        <div className="flex items-center justify-between border-t pt-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={serverPage <= 1}
            onClick={() => {
              setServerPage((p) => Math.max(1, p - 1));
              setClientPage(1);
            }}
            className="gap-1 h-11 text-xs"
          >
            <ChevronLeft className="w-4 h-4" />
            Load earlier
          </Button>
          <span className="text-xs text-muted-foreground">batch {serverPage}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={!data.hasMore}
            onClick={() => {
              setServerPage((p) => p + 1);
              setClientPage(1);
            }}
            className="gap-1 h-11 text-xs"
          >
            Load more
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();

  if (!isAdmin) {
    return (
      <Layout>
        <Helmet>
          <title>Audit Log — VetTrack</title>
        </Helmet>
        <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
          <Shield className="w-12 h-12 text-muted-foreground" />
          <h1 className="text-2xl font-bold">Admin Only</h1>
          <p className="text-sm text-muted-foreground">You need admin access to view this page.</p>
          <Button variant="ghost" onClick={() => navigate("/")}>Go Home</Button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Helmet>
        <title>Audit Log — VetTrack</title>
        <meta name="description" content="Immutable audit log of all critical actions in VetTrack." />
      </Helmet>
      <div className="flex flex-col gap-6 pb-24 animate-fade-in">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-primary" />
          Audit Log
        </h1>
        <SharedAuditLogsPanel />
      </div>
    </Layout>
  );
}
