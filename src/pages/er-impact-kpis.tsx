import { useMemo, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getErImpact } from "@/lib/er-api";
import { cn } from "@/lib/utils";
import type { ErKpiWindowDays } from "../../shared/er-types";

const WINDOWS: ErKpiWindowDays[] = [7, 14, 30];

// ── Colour palette — clinical, not decorative ────────────────────────────────
const COLOR_BASELINE = "#6b7280"; // muted gray  → Pre-Go-Live Baseline
const COLOR_CURRENT = "#0ea5e9";  // clinical blue → current ER Mode window
const COLOR_DIRECT_ACK = "#16a34a"; // green → healthy direct acknowledgment
const COLOR_FORCED_ACK = "#dc2626"; // red   → Forced Ack Override

function formatCents(cents: number): string {
  if (cents >= 100_000_00) return `₪${(cents / 100_000_00).toFixed(1)}M`;
  if (cents >= 100_000) return `₪${(cents / 100_000).toFixed(1)}K`;
  return `₪${(cents / 100).toFixed(0)}`;
}

function DeltaBadge({ delta, lowerIsBetter }: { delta: number | null; lowerIsBetter?: boolean }) {
  if (delta === null || delta === 0) return null;
  const improved = lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <Badge
      variant="outline"
      className={cn(
        "ml-1 text-xs font-medium tabular-nums",
        improved
          ? "border-green-500/40 bg-green-500/10 text-green-700 dark:text-green-400"
          : "border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-400",
      )}
    >
      {delta > 0 ? "+" : ""}
      {(delta * 100).toFixed(1)}%
    </Badge>
  );
}

function ConfidencePip({ level }: { level: "low" | "medium" | "high" }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        level === "high" && "bg-green-500",
        level === "medium" && "bg-yellow-500",
        level === "low" && "bg-gray-400",
      )}
      title={`Confidence: ${level}`}
    />
  );
}

// ── Section: Time to Triage ──────────────────────────────────────────────────
function TimeToTriageCard({
  baselineValue,
  currentValue,
  percentDelta,
  confidence,
  windowDays,
}: {
  baselineValue: number | null;
  currentValue: number | null;
  percentDelta: number | null;
  confidence: "low" | "medium" | "high";
  windowDays: number;
}) {
  const data = [
    { label: "Pre-Go-Live Baseline", minutes: baselineValue ?? 0, fill: COLOR_BASELINE },
    { label: `Last ${windowDays}d (ER Mode)`, minutes: currentValue ?? 0, fill: COLOR_CURRENT },
  ];
  const noData = baselineValue === null && currentValue === null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">Time to Triage</CardTitle>
          <ConfidencePip level={confidence} />
          {percentDelta !== null && (
            <DeltaBadge delta={percentDelta} lowerIsBetter />
          )}
        </div>
        <p className="text-muted-foreground text-xs">
          Median minutes from Intake Event to first clinician assignment (P50)
        </p>
      </CardHeader>
      <CardContent>
        {noData ? (
          <p className="text-muted-foreground text-sm">No assigned intakes in this window.</p>
        ) : (
          <>
            <div className="mb-3 flex gap-6 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Pre-Go-Live Baseline</span>
                <div className="font-semibold tabular-nums">
                  {baselineValue !== null ? `${baselineValue} min` : "—"}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Current</span>
                <div className="font-semibold tabular-nums">
                  {currentValue !== null ? `${currentValue} min` : "—"}
                </div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={140}>
              <BarChart data={data} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis unit=" min" tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`${v} min`, "Median"]} />
                <Bar dataKey="minutes" radius={[4, 4, 0, 0]}>
                  {data.map((entry) => (
                    <Cell key={entry.label} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section: Handoff Integrity ───────────────────────────────────────────────
function HandoffIntegrityCard({
  totalHandoffs,
  directAckCount,
  forcedAckOverrideCount,
  directAckRate,
  baselineDirectAckRate,
}: {
  totalHandoffs: number;
  directAckCount: number;
  forcedAckOverrideCount: number;
  directAckRate: number | null;
  baselineDirectAckRate: number | null;
}) {
  const unadjustedCount = totalHandoffs - directAckCount - forcedAckOverrideCount;
  const pieData = [
    { name: "Direct Ack (Incoming Assignee)", value: directAckCount, fill: COLOR_DIRECT_ACK },
    { name: "Forced Ack Override", value: forcedAckOverrideCount, fill: COLOR_FORCED_ACK },
    ...(unadjustedCount > 0
      ? [{ name: "Pending / Open", value: unadjustedCount, fill: "#d1d5db" }]
      : []),
  ].filter((d) => d.value > 0);

  const directPct = directAckRate !== null ? `${(directAckRate * 100).toFixed(1)}%` : "—";
  const baselinePct = baselineDirectAckRate !== null ? `${(baselineDirectAckRate * 100).toFixed(1)}%` : "—";

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Handoff Integrity</CardTitle>
        <p className="text-muted-foreground text-xs">
          Structured Clinical Handoffs acknowledged by incoming assignee vs. Forced Ack Override
        </p>
      </CardHeader>
      <CardContent>
        {totalHandoffs === 0 ? (
          <p className="text-muted-foreground text-sm">No handoff items in this window.</p>
        ) : (
          <>
            <div className="mb-3 flex gap-6 text-sm">
              <div>
                <span className="text-muted-foreground text-xs">Pre-Go-Live Baseline</span>
                <div className="font-semibold tabular-nums">{baselinePct}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Direct Ack Rate</span>
                <div className="font-semibold tabular-nums">{directPct}</div>
              </div>
              <div>
                <span className="text-muted-foreground text-xs">Total Handoffs</span>
                <div className="font-semibold tabular-nums">{totalHandoffs}</div>
              </div>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={70}
                  dataKey="value"
                  paddingAngle={2}
                >
                  {pieData.map((entry) => (
                    <Cell key={entry.name} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: number) => [v, "Handoffs"]} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Section: SLA Performance ─────────────────────────────────────────────────
function SlaPerformanceCard({
  escalationCount,
  baselineEscalationCount,
  windowDays,
}: {
  escalationCount: number;
  baselineEscalationCount: number | null;
  windowDays: number;
}) {
  const data = [
    {
      label: "Pre-Go-Live Baseline",
      count: baselineEscalationCount ?? 0,
      fill: COLOR_BASELINE,
    },
    { label: `Last ${windowDays}d (ER Mode)`, count: escalationCount, fill: COLOR_CURRENT },
  ];

  const delta =
    baselineEscalationCount !== null && baselineEscalationCount > 0
      ? (escalationCount - baselineEscalationCount) / baselineEscalationCount
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">SLA Performance</CardTitle>
          {delta !== null && <DeltaBadge delta={delta} lowerIsBetter />}
        </div>
        <p className="text-muted-foreground text-xs">
          Frequency of Time Aging Escalation triggers (auto-severity bumps)
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Pre-Go-Live Baseline</span>
            <div className="font-semibold tabular-nums">
              {baselineEscalationCount !== null ? baselineEscalationCount : "—"}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Current</span>
            <div className="font-semibold tabular-nums">{escalationCount}</div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v: number) => [v, "Escalations"]} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Section: Financial Correlation ───────────────────────────────────────────
function FinancialCorrelationCard({
  capturedRevenueThisPeriodCents,
  currentAvgDailyRevenueCents,
  baselineAvgDailyRevenueCents,
  windowDays,
}: {
  capturedRevenueThisPeriodCents: number;
  currentAvgDailyRevenueCents: number;
  baselineAvgDailyRevenueCents: number | null;
  windowDays: number;
}) {
  const data = [
    {
      label: "Pre-Go-Live Baseline",
      avgDaily: baselineAvgDailyRevenueCents !== null ? baselineAvgDailyRevenueCents / 100 : 0,
      fill: COLOR_BASELINE,
    },
    {
      label: `Last ${windowDays}d (ER Mode)`,
      avgDaily: currentAvgDailyRevenueCents / 100,
      fill: COLOR_CURRENT,
    },
  ];

  const delta =
    baselineAvgDailyRevenueCents !== null && baselineAvgDailyRevenueCents > 0
      ? (currentAvgDailyRevenueCents - baselineAvgDailyRevenueCents) /
        baselineAvgDailyRevenueCents
      : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold">Financial Correlation</CardTitle>
          {delta !== null && <DeltaBadge delta={delta} lowerIsBetter={false} />}
        </div>
        <p className="text-muted-foreground text-xs">
          Revenue recovery: captured billing vs. Pre-Go-Live Baseline average
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex gap-6 text-sm">
          <div>
            <span className="text-muted-foreground text-xs">Period total</span>
            <div className="font-semibold tabular-nums">
              {formatCents(capturedRevenueThisPeriodCents)}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Avg/day (current)</span>
            <div className="font-semibold tabular-nums">
              {formatCents(currentAvgDailyRevenueCents)}
            </div>
          </div>
          <div>
            <span className="text-muted-foreground text-xs">Avg/day (baseline)</span>
            <div className="font-semibold tabular-nums">
              {baselineAvgDailyRevenueCents !== null
                ? formatCents(baselineAvgDailyRevenueCents)
                : "—"}
            </div>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={140}>
          <BarChart data={data} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} />
            <YAxis
              tickFormatter={(v) => `₪${v}`}
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(v: number) => [`₪${v.toFixed(0)}`, "Avg daily revenue"]}
            />
            <Bar dataKey="avgDaily" radius={[4, 4, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.label} fill={entry.fill} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function ErImpactKpisPage() {
  const [windowDays, setWindowDays] = useState<ErKpiWindowDays>(14);

  const q = useQuery({
    queryKey: ["er", "impact-kpis", windowDays],
    queryFn: () => getErImpact({ window: windowDays }),
  });

  const triageKpi = useMemo(
    () => q.data?.comparisons.find((c) => c.kpi === "doorToTriageMinutesP50"),
    [q.data],
  );

  return (
    <Layout>
      <Helmet>
        <title>Outcome KPI Dashboard</title>
      </Helmet>
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-4 md:p-8">
        {/* Header */}
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Outcome KPI Dashboard</h1>
            <p className="text-muted-foreground text-sm">
              Current ER Mode metrics compared to the Pre-Go-Live Baseline.
            </p>
          </div>
          <div className="flex items-end gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-muted-foreground text-xs font-medium">Window</span>
              <Select
                value={String(windowDays)}
                onValueChange={(v) => setWindowDays(Number(v) as ErKpiWindowDays)}
              >
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WINDOWS.map((w) => (
                    <SelectItem key={w} value={String(w)}>
                      {w} days
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href="/er">Command Center</Link>
            </Button>
          </div>
        </div>

        {/* Baseline metadata */}
        {q.data ? (
          <p className="text-muted-foreground text-xs">
            Pre-Go-Live Baseline: {q.data.baselineStartDate} → {q.data.baselineEndDate}
            {" · "}Generated: {new Date(q.data.generatedAt).toLocaleString()}
          </p>
        ) : null}

        {/* Loading / error states */}
        {q.isLoading ? (
          <p className="text-muted-foreground text-sm">Loading Outcome KPIs…</p>
        ) : q.isError || !q.data ? (
          <p className="text-destructive text-sm">Could not load Outcome KPI data.</p>
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            {/* Time to Triage */}
            <TimeToTriageCard
              baselineValue={triageKpi?.baselineValue ?? null}
              currentValue={triageKpi?.currentValue ?? null}
              percentDelta={triageKpi?.percentDelta ?? null}
              confidence={triageKpi?.confidence ?? "low"}
              windowDays={windowDays}
            />

            {/* Handoff Integrity */}
            {q.data.handoffIntegrity ? (
              <HandoffIntegrityCard
                totalHandoffs={q.data.handoffIntegrity.totalHandoffs}
                directAckCount={q.data.handoffIntegrity.directAckCount}
                forcedAckOverrideCount={q.data.handoffIntegrity.forcedAckOverrideCount}
                directAckRate={q.data.handoffIntegrity.directAckRate}
                baselineDirectAckRate={q.data.handoffIntegrity.baselineDirectAckRate}
              />
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Handoff Integrity</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">No handoff data available.</p>
                </CardContent>
              </Card>
            )}

            {/* SLA Performance */}
            {q.data.slaEscalation ? (
              <SlaPerformanceCard
                escalationCount={q.data.slaEscalation.escalationCount}
                baselineEscalationCount={q.data.slaEscalation.baselineEscalationCount}
                windowDays={windowDays}
              />
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">SLA Performance</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">No escalation data available.</p>
                </CardContent>
              </Card>
            )}

            {/* Financial Correlation */}
            {q.data.financialCorrelation ? (
              <FinancialCorrelationCard
                capturedRevenueThisPeriodCents={
                  q.data.financialCorrelation.capturedRevenueThisPeriodCents
                }
                currentAvgDailyRevenueCents={
                  q.data.financialCorrelation.currentAvgDailyRevenueCents
                }
                baselineAvgDailyRevenueCents={
                  q.data.financialCorrelation.baselineAvgDailyRevenueCents
                }
                windowDays={windowDays}
              />
            ) : (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Financial Correlation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm">No billing data available.</p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
