import { useState } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { AlertCircle, RefreshCw, CheckCircle2, Clock, Loader2 } from "lucide-react";
import type { InventoryJob } from "@/types";

type JobStatus = InventoryJob["status"];

const STATUS_CONFIG: Record<JobStatus, { label: string; className: string; icon: React.ReactNode }> = {
  pending:    { label: "Pending",    className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300", icon: <Clock className="h-3 w-3" /> },
  processing: { label: "Processing", className: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",       icon: <Loader2 className="h-3 w-3 animate-spin" /> },
  resolved:   { label: "Resolved",   className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",   icon: <CheckCircle2 className="h-3 w-3" /> },
  failed:     { label: "Failed",     className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",           icon: <AlertCircle className="h-3 w-3" /> },
};

function StatusBadge({ status }: { status: JobStatus }) {
  const { label, className, icon } = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {icon} {label}
    </span>
  );
}

const FILTER_TABS: { key: string; label: string }[] = [
  { key: "failed",     label: "Failed" },
  { key: "pending",    label: "Pending" },
  { key: "processing", label: "Processing" },
  { key: "resolved",   label: "Resolved" },
];

export default function InventoryJobsPage() {
  const { userId } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("failed");
  const qc = useQueryClient();

  const jobsQ = useQuery({
    queryKey: ["/api/billing/inventory-jobs", statusFilter],
    queryFn: () => api.billing.inventoryJobs({ status: statusFilter }),
    enabled: !!userId,
    refetchInterval: 30_000,
  });

  const retryMutation = useMutation({
    mutationFn: (id: string) => api.billing.retryInventoryJob(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/billing/inventory-jobs"] }),
  });

  const jobs: InventoryJob[] = jobsQ.data ?? [];

  return (
    <Layout>
      <Helmet><title>Inventory Jobs — VetTrack</title></Helmet>
      <div className="mx-auto max-w-5xl px-4 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Inventory Deduction Jobs</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Medication inventory adjustments queued after task completion
            </p>
          </div>
          <div className="flex gap-1.5">
            {FILTER_TABS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`rounded-md px-3 py-1.5 text-sm transition-colors ${
                  statusFilter === key
                    ? "bg-primary text-primary-foreground"
                    : "border hover:bg-muted"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {jobsQ.isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {jobsQ.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            <AlertCircle className="mr-1.5 inline h-4 w-4" />
            Failed to load inventory jobs: {(jobsQ.error as Error).message}
          </div>
        )}

        {!jobsQ.isLoading && !jobsQ.isError && jobs.length === 0 && (
          <div className="rounded-lg border p-12 text-center">
            <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">No {statusFilter} jobs</p>
          </div>
        )}

        {jobs.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Task ID</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Container</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Vol (mL)</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Retries</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Failure Reason</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobs.map((job) => (
                  <tr key={job.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3"><StatusBadge status={job.status} /></td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground" title={job.taskId}>
                      {job.taskId.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground" title={job.containerId}>
                      {job.containerId.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-3">{Number(job.requiredVolumeMl).toFixed(2)}</td>
                    <td className="px-4 py-3">{job.retryCount}</td>
                    <td className="px-4 py-3 max-w-xs truncate text-xs text-red-600 dark:text-red-400" title={job.failureReason ?? undefined}>
                      {job.failureReason ?? <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      {job.status === "failed" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={retryMutation.isPending}
                          onClick={() => retryMutation.mutate(job.id)}
                        >
                          <RefreshCw className="mr-1 h-3 w-3" />
                          Retry
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-muted-foreground">
          Auto-refreshes every 30 s. The background recovery scheduler re-enqueues eligible failed jobs every 10 minutes.
        </p>
      </div>
    </Layout>
  );
}
