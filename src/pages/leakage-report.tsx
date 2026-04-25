import { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorCard } from "@/components/ui/error-card";
import { useAuth } from "@/hooks/use-auth";
import { ShieldAlert, Download, TrendingDown, PackageOpen, ReceiptText, AlertCircle } from "lucide-react";
import { Link } from "wouter";

function formatCents(cents: number): string {
  return `\u20aa${(cents / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getDefaultDates(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}

export default function LeakageReportPage() {
  const { userId } = useAuth();
  const defaults = useMemo(() => getDefaultDates(), []);
  const [fromDate, setFromDate] = useState(defaults.from);
  const [toDate, setToDate] = useState(defaults.to);
  const [queryParams, setQueryParams] = useState<{ from: string; to: string }>(defaults);

  const reportQ = useQuery({
    queryKey: ["/api/billing/leakage-report", queryParams],
    queryFn: () => api.billing.leakageReport({ from: queryParams.from, to: queryParams.to }),
    enabled: !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  function handleRunReport() {
    setQueryParams({ from: fromDate, to: toDate });
  }

  const report = reportQ.data;
  const summary = report?.summary;
  const items = report?.items ?? [];

  return (
    <Layout>
      <Helmet>
        <title>Leakage Audit Report — VetTrack</title>
      </Helmet>

      <div className="w-full space-y-6 motion-safe:animate-page-enter">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <ShieldAlert className="h-7 w-7 shrink-0 text-destructive" aria-hidden />
            <h1 className="truncate text-2xl font-bold tracking-tight">Leakage Audit Report</h1>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Link href="/billing">
              <Button variant="outline" size="sm">
                Back to Billing
              </Button>
            </Link>
            <a href={api.billing.exportCsvUrl()} download>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" />
                Export CSV
              </Button>
            </a>
          </div>
        </div>

        {/* Date range picker */}
        <div className="rounded-xl border bg-card p-4 shadow-sm">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="from-date">
                From
              </label>
              <input
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground" htmlFor="to-date">
                To
              </label>
              <input
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <Button onClick={handleRunReport} disabled={reportQ.isFetching}>
              {reportQ.isFetching ? "Running..." : "Run Report"}
            </Button>
          </div>
        </div>

        {/* Loading state */}
        {reportQ.isPending && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        )}

        {/* Error state */}
        {reportQ.isError && !reportQ.isPending && (
          <ErrorCard message="Failed to load leakage report" onRetry={() => reportQ.refetch()} />
        )}

        {/* Results */}
        {report && !reportQ.isPending && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Dispensed Qty</p>
                  <PackageOpen className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {summary?.totalDispensedQty ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">units dispensed</p>
              </div>

              <div className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Billed Qty</p>
                  <ReceiptText className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight">
                  {summary?.totalBilledQty ?? 0}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">units billed</p>
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-amber-700">Gap Qty</p>
                  <AlertCircle className="h-4 w-4 text-amber-700" />
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-amber-800">
                  {summary?.totalGapQty ?? 0}
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  {summary?.gapRatePercent ?? 0}% gap rate
                </p>
              </div>

              <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-destructive">Gap Value</p>
                  <TrendingDown className="h-4 w-4 text-destructive" />
                </div>
                <p className="mt-2 text-2xl font-semibold tracking-tight text-destructive">
                  {formatCents(summary?.totalGapValueCents ?? 0)}
                </p>
                <p className="mt-1 text-xs text-destructive/70">estimated revenue lost</p>
              </div>
            </div>

            {/* Table */}
            {items.length === 0 ? (
              <EmptyState
                icon={ShieldAlert}
                message="No leakage detected"
                subMessage="All dispensed items appear to be billed within the selected date range."
                iconBg="bg-emerald-50 ring-1 ring-emerald-200/60"
                iconColor="text-emerald-600"
              />
            ) : (
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="text-left px-4 py-3 font-semibold">Item</th>
                        <th className="text-right px-4 py-3 font-semibold">Unit Price</th>
                        <th className="text-right px-4 py-3 font-semibold">Dispensed</th>
                        <th className="text-right px-4 py-3 font-semibold">Billed</th>
                        <th className="text-right px-4 py-3 font-semibold">Gap Qty</th>
                        <th className="text-right px-4 py-3 font-semibold">Gap Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {items.map((item) => (
                        <tr
                          key={item.itemId}
                          className={item.gapQty > 0 ? "bg-destructive/5" : ""}
                        >
                          <td className="px-4 py-3 font-medium">{item.itemName}</td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {formatCents(item.unitPriceCents)}
                          </td>
                          <td className="px-4 py-3 text-right">{item.dispensedQty}</td>
                          <td className="px-4 py-3 text-right">{item.billedQty}</td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={
                                item.gapQty > 0
                                  ? "font-semibold text-amber-700"
                                  : "text-emerald-700"
                              }
                            >
                              {item.gapQty}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span
                              className={
                                item.gapValueCents > 0
                                  ? "font-semibold text-destructive"
                                  : "text-emerald-700"
                              }
                            >
                              {formatCents(item.gapValueCents)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
