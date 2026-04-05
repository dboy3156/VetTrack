import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Droplets,
  Activity,
  Trophy,
} from "lucide-react";
import { format } from "date-fns";

const STATUS_COLORS_HEX = {
  ok: "#10b981",
  issue: "#ef4444",
  maintenance: "#f59e0b",
  sterilized: "#14b8a6",
};

export default function AnalyticsPage() {
  const { data: analytics, isLoading, isError } = useQuery({
    queryKey: ["/api/analytics"],
    queryFn: api.analytics.summary,
  });

  const pieData = analytics
    ? [
        { name: "OK", value: analytics.statusBreakdown.ok, color: "#10b981" },
        { name: "Issue", value: analytics.statusBreakdown.issue, color: "#ef4444" },
        { name: "Maintenance", value: analytics.statusBreakdown.maintenance, color: "#f59e0b" },
        { name: "Sterilized", value: analytics.statusBreakdown.sterilized, color: "#14b8a6" },
      ].filter((d) => d.value > 0)
    : [];

  const chartData = analytics?.scanActivity
    ? analytics.scanActivity.slice(-14).map((d) => {
        let dateLabel = d.date;
        try {
          dateLabel = format(new Date(d.date), "MMM d");
        } catch {
          // keep raw date string if parsing fails
        }
        return { date: dateLabel, scans: d.count };
      })
    : [];

  return (
    <Layout>
      <div className="flex flex-col gap-4 pb-24 animate-fade-in">
        <h1 className="text-2xl font-bold leading-tight flex items-center gap-2">
          <BarChart3 className="w-6 h-6 text-primary" />
          Analytics
        </h1>

        {isError && (
          <Card className="border-destructive bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">Failed to load analytics. Please refresh to try again.</p>
            </CardContent>
          </Card>
        )}

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          {isLoading ? (
            <>
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-24 rounded-xl" />
            </>
          ) : (
            <>
              <Card className="border-emerald-200 bg-emerald-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span className="text-xs text-muted-foreground font-medium">Maintenance</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-700">
                    {analytics?.maintenanceComplianceRate ?? 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">Compliance rate</p>
                </CardContent>
              </Card>

              <Card className="border-teal-200 bg-teal-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Droplets className="w-4 h-4 text-teal-500" />
                    <span className="text-xs text-muted-foreground font-medium">Sterilization</span>
                  </div>
                  <p className="text-2xl font-bold text-teal-700">
                    {analytics?.sterilizationComplianceRate ?? 0}%
                  </p>
                  <p className="text-xs text-muted-foreground">Compliance rate</p>
                </CardContent>
              </Card>

              <Card className="border-red-200 bg-red-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                    <span className="text-xs text-muted-foreground font-medium">Overdue</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700">
                    {analytics?.statusBreakdown.overdue ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Items overdue</p>
                </CardContent>
              </Card>

              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Wrench className="w-4 h-4 text-amber-500" />
                    <span className="text-xs text-muted-foreground font-medium">Issues</span>
                  </div>
                  <p className="text-2xl font-bold text-amber-700">
                    {analytics?.statusBreakdown.issue ?? 0}
                  </p>
                  <p className="text-xs text-muted-foreground">Active issues</p>
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Status pie chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Equipment Status Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-52" />
            ) : pieData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={index} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: number) => [`${value} items`, ""]}
                  />
                  <Legend
                    formatter={(value, entry: any) =>
                      `${value}: ${entry.payload.value}`
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-10 text-sm">No data yet</p>
            )}
          </CardContent>
        </Card>

        {/* Scan activity chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Scan Activity (14 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="opacity-50" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={1} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="scans" fill="#0d9488" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-8 text-sm">
                No scan activity yet
              </p>
            )}
          </CardContent>
        </Card>

        {/* Top problem equipment */}
        {analytics?.topProblemEquipment && analytics.topProblemEquipment.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                Top Problem Equipment
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3">
                {analytics.topProblemEquipment.map((item, i) => (
                  <div key={item.equipmentId} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
                        {i + 1}
                      </span>
                      <span className="text-sm font-medium truncate">{item.name}</span>
                    </div>
                    <Badge variant="issue" className="shrink-0">
                      {item.issueCount} issues
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
