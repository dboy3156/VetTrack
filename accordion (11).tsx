import { Layout } from "@/components/layout";
import { useGetAnalyticsSummary, useListEquipment } from "@/lib/api";
import { Link } from "wouter";
import { ArrowLeft, AlertTriangle, TrendingUp, ShieldCheck, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  RadialBarChart,
  RadialBar,
} from "recharts";
import { format, parseISO } from "date-fns";

const STATUS_COLORS: Record<string, string> = {
  ok: "#22c55e",
  issue: "#f97316",
  overdue: "#ef4444",
  inactive: "#9ca3af",
  sterilized: "#14b8a6",
};

const STATUS_LABELS: Record<string, string> = {
  ok: "OK",
  issue: "Issue",
  overdue: "Overdue",
  inactive: "Inactive",
  sterilized: "Sterilized",
};

function ComplianceGauge({ rate, label }: { rate: number; label: string }) {
  const color = rate >= 80 ? "#14b8a6" : rate >= 50 ? "#f97316" : "#ef4444";
  const gaugeData = [{ value: rate, fill: color }];

  return (
    <div className="relative w-full h-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%"
          cy="55%"
          innerRadius="70%"
          outerRadius="100%"
          startAngle={180}
          endAngle={0}
          data={gaugeData}
          barSize={12}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={6}
            background={{ fill: "#e5e7eb" }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
        <span className="text-3xl font-bold" style={{ color }}>{rate}%</span>
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
    </div>
  );
}

const STERILIZATION_CATEGORIES = [
  "Surgical Instruments",
  "Dental",
  "Sterilization (Autoclave)",
];

export default function Analytics() {
  const { data, isLoading } = useGetAnalyticsSummary();
  const { data: equipment } = useListEquipment();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col gap-5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-32 rounded-2xl" />
            <Skeleton className="h-32 rounded-2xl" />
          </div>
          <Skeleton className="h-64 w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (!data) {
    return (
      <Layout>
        <div className="text-center py-20 text-muted-foreground">Failed to load analytics data.</div>
      </Layout>
    );
  }

  const pieData = Object.entries(data.statusBreakdown)
    .filter(([, v]) => v > 0)
    .map(([key, value]) => ({
      name: STATUS_LABELS[key] ?? key,
      value,
      color: STATUS_COLORS[key] ?? "#94a3b8",
    }));

  const scanChartData = data.scanActivity.map((d) => ({
    date: d.date,
    label: format(parseISO(d.date), "MMM d"),
    scans: d.count,
  }));

  const totalScans30d = data.scanActivity.reduce((s, d) => s + d.count, 0);

  const sterilizableItems = (equipment ?? []).filter(
    (e) => e.category && STERILIZATION_CATEGORIES.includes(e.category)
  );
  const sterilizedItems = sterilizableItems.filter(
    (e) => e.lastStatus === "sterilized"
  );
  const sterilizationComplianceRate = sterilizableItems.length > 0
    ? Math.round((sterilizedItems.length / sterilizableItems.length) * 100)
    : 100;

  return (
    <Layout>
      <div className="flex flex-col gap-5 pb-10">
        <div>
          <Link href="/" className="inline-flex items-center text-base text-muted-foreground hover:text-foreground mb-3 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Analytics</h1>
          <p className="text-base text-muted-foreground mt-0.5">Last 30 days overview</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
              <TrendingUp className="w-4 h-4" />
              Total Scans
            </div>
            <div className="text-3xl font-bold text-foreground">{totalScans30d}</div>
            <div className="text-sm text-muted-foreground">last 30 days</div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
              <ShieldCheck className="w-4 h-4" />
              Maintenance
            </div>
            <div className="h-28 -mb-2">
              <ComplianceGauge rate={data.maintenanceComplianceRate} label="compliant" />
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground mb-1">
              <Sparkles className="w-4 h-4" />
              Sterilization
            </div>
            <div className="h-28 -mb-2">
              <ComplianceGauge rate={sterilizationComplianceRate} label="compliant" />
            </div>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Scan Activity</h2>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={scanChartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="scanGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  interval={Math.floor(scanChartData.length / 6)}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9ca3af" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1c1917",
                    border: "none",
                    borderRadius: "12px",
                    color: "#fff",
                    fontSize: "13px",
                    padding: "8px 12px",
                  }}
                  labelFormatter={(label) => label}
                  formatter={(value: number) => [value, "Scans"]}
                />
                <Area
                  type="monotone"
                  dataKey="scans"
                  stroke="#14b8a6"
                  strokeWidth={2}
                  fill="url(#scanGrad)"
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 0, fill: "#14b8a6" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Equipment by Status</h2>
          <div className="flex items-center gap-4">
            <div className="w-36 h-36 shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={35}
                    outerRadius={60}
                    paddingAngle={2}
                    strokeWidth={0}
                  >
                    {pieData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1c1917",
                      border: "none",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "13px",
                      padding: "8px 12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="flex flex-col gap-2 flex-1">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-sm font-medium text-foreground">{entry.name}</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">{entry.value}</span>
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 border-t border-border mt-1">
                <span className="text-sm font-medium text-muted-foreground">Total</span>
                <span className="text-sm font-bold text-foreground">{data.totalEquipment}</span>
              </div>
            </div>
          </div>
        </div>

        {data.topProblemEquipment.length > 0 && (
          <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Top Problem Equipment</h2>
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={data.topProblemEquipment.map((e) => ({
                    name: e.name.length > 18 ? e.name.slice(0, 16) + "..." : e.name,
                    issues: e.issueCount,
                    id: e.equipmentId,
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" tick={{ fontSize: 11, fill: "#9ca3af" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={120}
                    tick={{ fontSize: 12, fill: "#1c1917" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#1c1917",
                      border: "none",
                      borderRadius: "12px",
                      color: "#fff",
                      fontSize: "13px",
                      padding: "8px 12px",
                    }}
                    formatter={(value: number) => [value, "Issues"]}
                  />
                  <Bar dataKey="issues" fill="#f97316" radius={[0, 6, 6, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-3 flex flex-col gap-1.5">
              {data.topProblemEquipment.map((item) => (
                <Link
                  key={item.equipmentId}
                  href={`/equipment/${item.equipmentId}`}
                  className="flex items-center justify-between px-3 py-2 rounded-xl hover:bg-muted transition-colors text-sm"
                >
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />
                    <span className="font-medium text-foreground">{item.name}</span>
                  </div>
                  <span className="font-bold text-orange-600">{item.issueCount} issue{item.issueCount !== 1 ? "s" : ""}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
