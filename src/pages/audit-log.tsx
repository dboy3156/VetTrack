import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, ChevronLeft, ChevronRight, ClipboardList, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import type { AuditLog } from "@/types";

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
};

const ALL_ACTION_TYPES = Object.keys(ACTION_TYPE_LABELS);

function actionLabel(actionType: string): string {
  return ACTION_TYPE_LABELS[actionType] ?? actionType;
}

function actionBadgeClass(actionType: string): string {
  if (actionType.includes("deleted")) return "bg-destructive/10 text-destructive";
  if (actionType.includes("created") || actionType.includes("provisioned")) return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
  if (actionType.includes("login")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
  if (actionType.includes("role") || actionType.includes("status")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}

function AuditLogRow({ log }: { log: AuditLog }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b last:border-b-0">
      <button
        className="w-full text-left px-4 py-3 hover:bg-muted/30 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3 flex-wrap">
          <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5 min-w-[140px]">
            {format(new Date(log.timestamp), "MMM d, yyyy h:mm a")}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${actionBadgeClass(log.actionType)}`}>
            {actionLabel(log.actionType)}
          </span>
          <span className="text-sm text-foreground truncate flex-1 min-w-0">
            {log.performedByEmail}
          </span>
          {log.targetType && log.targetId && (
            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {log.targetType}: <span className="font-mono">{log.targetId.slice(0, 8)}…</span>
            </span>
          )}
        </div>
      </button>
      {expanded && log.metadata && (
        <div className="px-4 pb-3">
          <pre className="text-xs bg-muted rounded-lg p-3 overflow-auto max-h-48 whitespace-pre-wrap break-words">
            {JSON.stringify(log.metadata, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  const { isAdmin } = useAuth();
  const [, navigate] = useLocation();

  const [actionType, setActionType] = useState<string>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const params = {
    actionType: actionType || undefined,
    from: from || undefined,
    to: to || undefined,
    page,
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/audit-logs", params],
    queryFn: () => api.auditLogs.list(params),
    enabled: isAdmin,
  });

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

  function handleFilter() {
    setPage(1);
  }

  function handleReset() {
    setActionType("");
    setFrom("");
    setTo("");
    setPage(1);
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

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex flex-col gap-1.5 min-w-[180px]">
                <Label className="text-xs">Action Type</Label>
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

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">From</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">To</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="h-8 text-sm w-36"
                />
              </div>

              <div className="flex gap-2">
                <Button size="sm" onClick={handleFilter}>Apply</Button>
                <Button size="sm" variant="outline" onClick={handleReset}>Reset</Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex flex-col gap-2 p-4">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-12 rounded-xl" />
                ))}
              </div>
            ) : isError ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
                <AlertTriangle className="w-8 h-8 text-destructive opacity-60" />
                <div>
                  <p className="text-sm font-medium text-foreground">Failed to load audit log</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Check your connection and try again</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => refetch()}>Try Again</Button>
              </div>
            ) : !data?.items.length ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <ClipboardList className="w-10 h-10 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">No audit log entries found.</p>
              </div>
            ) : (
              <div>
                {data.items.map((log) => (
                  <AuditLogRow key={log.id} log={log} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {data && (data.hasMore || page > 1) && (
          <div className="flex items-center justify-between">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="gap-1"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">Page {page}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={!data.hasMore}
              onClick={() => setPage((p) => p + 1)}
              className="gap-1"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
