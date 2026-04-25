import { useQuery } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { useState } from "react";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import {
  TrendingDown,
  Download,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
} from "lucide-react";

function formatIls(cents: number) {
  return (cents / 100).toLocaleString("he-IL", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function defaultFrom() {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

function defaultTo() {
  return new Date().toISOString().slice(0, 10);
}

export default function LeakageReportPage() {
  const { userId } = useAuth();
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["/api/billing/leakage-report", from, to],
    queryFn: () => api.billing.leakageReport({ from, to }),
    enabled: !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const exportUrl = api.billing.exportCsvUrl({ status: "pending", from, to });

  const hasGap = (data?.summary.totalGapValueCents ?? 0) > 0;

  return (
    <Layout title="Leakage Report">
      <Helmet>
        <title>Leakage Report — VetTrack</title>
      </Helmet>

      <div className="mx-auto max-w-5xl space-y-6 p-4 pb-24">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link href="/billing" className="mb-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <ChevronLeft className="h-3.5 w-3.5" />
              Back to Billing
            </Link>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <TrendingDown className="h-6 w-6 text-destructive shrink-0" />
              Billing Leakage Report
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dispensed consumables vs. billing entries — shows the ₪ gap.
            </p>
          </div>

          <a
            href={exportUrl}
            download
            className="inline-flex items-center gap-2 rounded-xl border border-border/70 bg-background px-4 py-2 text-sm font-medium shadow-sm hover:bg-muted/50 transition-colors"
          >
            <Download className="h-4 w-4" />
            Export Pending CSV
          </a>
        </div>

        {/* Date range */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card p-4">
          <div className="flex items-center gap-2">
            <label htmlFor="from-date" className="text-xs font-medium text-muted-foreground">From</label>
            <input
              id="from-date"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="to-date" className="text-xs font-medium text-muted-foreground">To</label>
            <input
              id="to-date"
              type="date"
              value={to}
              min={from}
              max={defaultTo()}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-border/70 bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <Button size="sm" variant="outline" onClick={() => void refetch()} disabled={isLoading}>
            Apply
          </Button>
        </div>

        {isError && (
          <Card className="border-destructive/40">
            <CardContent className="pt-5 text-sm text-destructive">Failed to load report. Retry above.</CardContent>
          </Card>
        )}

        {/* Summary KPI cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Card className={hasGap ? "border-destructive/40 bg-destructive/5" : "border-emerald-300/60 bg-emerald-50/60 dark:bg-emerald-950/20"}>
              <CardContent className="flex flex-col items-center justify-center py-5 text-center">
                <p className={`text-3xl font-bold tabular-nums ${hasGap ? "text-destructive" : "text-emerald-700 dark:text-emerald-300"}`}>
                  ₪{formatIls(data.summary.totalGapValueCents)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Total Gap Value</p>
              </CardContent>
            </Card>
            <Card className={data.summary.overallLeakagePct > 15 ? "border-destructive/40 bg-destructive/5" : ""}>
              <CardContent className="flex flex-col items-center justify-center py-5 text-center">
                <p className={`text-3xl font-bold tabular-nums ${data.summary.overallLeakagePct > 15 ? "text-destructive" : "text-foreground"}`}>
                  {data.summary.overallLeakagePct}%
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Leakage Rate</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-5 text-center">
                <p className="text-3xl font-bold tabular-nums">{data.summary.totalDispensedQty}</p>
                <p className="mt-1 text-xs text-muted-foreground">Units Dispensed</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-5 text-center">
                <p className="text-3xl font-bold tabular-nums">{data.summary.totalBilledQty}</p>
                <p className="mt-1 text-xs text-muted-foreground">Units Billed</p>
              </CardContent>
            </Card>
          </div>
        ) : null}

        {/* Bar chart: dispensed vs billed top 10 containers */}
        {data && data.items.length > 0 && (
          <Card className="border-border/60">
            <CardContent className="pt-5">
              <p className="mb-4 text-sm font-semibold">Top containers by gap value</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={data.items.slice(0, 10).map((i) => ({
                    name: i.containerName.length > 18 ? `${i.containerName.slice(0, 16)}…` : i.containerName,
                    Dispensed: i.dispensedQty,
                    Billed: i.billedQty,
                    Gap: i.gapQty,
                  }))}
                  margin={{ top: 0, right: 8, left: -16, bottom: 0 }}
                >
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    formatter={(value: number, name: string) => [value, name]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Dispensed" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Billed" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Gap" radius={[4, 4, 0, 0]}>
                    {data.items.slice(0, 10).map((item, idx) => (
                      <Cell key={idx} fill={item.gapQty > 0 ? "#f87171" : "#34d399"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Itemised table */}
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : data && data.items.length > 0 ? (
          <Card className="border-border/60">
            <CardContent className="p-0">
              <div className="overflow-x-auto rounded-xl">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40">
                      <th className="px-4 py-3 text-left font-medium text-muted-foreground">Container</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Unit ₪</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Dispensed</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Billed</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gap</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Gap ₪</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Leakage %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {data.items.map((item) => (
                      <tr
                        key={item.containerId}
                        className={item.gapQty > 0 ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/30"}
                      >
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            {item.gapQty > 0 ? (
                              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-destructive" />
                            ) : (
                              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-500" />
                            )}
                            {item.containerName}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-muted-foreground">
                          ₪{formatIls(item.unitPriceCents)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.dispensedQty}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{item.billedQty}</td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${item.gapQty > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {item.gapQty > 0 ? `+${item.gapQty}` : "0"}
                        </td>
                        <td className={`px-4 py-3 text-right font-semibold tabular-nums ${item.gapQty > 0 ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"}`}>
                          {item.gapQty > 0 ? `₪${formatIls(item.gapValueCents)}` : "—"}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {item.gapQty > 0 ? (
                            <Badge className="bg-destructive/15 text-destructive border-destructive/30 text-xs">
                              {item.leakagePct}%
                            </Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 text-xs">
                              0%
                            </Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        ) : data && data.items.length === 0 ? (
          <Card className="border-border/60">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
              <CheckCircle2 className="mb-3 h-8 w-8 text-emerald-500" />
              <p className="font-medium">No dispenses in this period</p>
              <p className="text-sm">No inventory adjustments were recorded between these dates.</p>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </Layout>
  );
}
