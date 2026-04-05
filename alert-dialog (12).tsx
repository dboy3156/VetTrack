import { useUser } from "@clerk/react";
import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { useListEquipment, useGetAnalyticsSummary } from "@/lib/api";
import { computeAlerts } from "@/lib/alerts";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Clock,
  Boxes,
  Activity,
  BarChart3,
  ChevronRight,
  Sparkles,
  ShieldCheck,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

const STERILIZATION_CATEGORIES = [
  "Surgical Instruments",
  "Dental",
  "Sterilization (Autoclave)",
];
const STERILIZATION_WINDOW_DAYS = 7;

/* ================= STAT CARD ================= */

function StatCard({
  label,
  value,
  icon: Icon,
  bgColor,
  href,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  bgColor: string;
  href?: string;
}) {
  const inner = (
    <div
      className={`bg-card border border-border rounded-2xl p-4 shadow-sm flex items-center gap-4 transition-all
        ${href ? "hover:shadow-md hover:border-primary/30 cursor-pointer active:scale-[0.99]" : ""}
      `}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${bgColor}`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-bold text-foreground leading-none">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
      </div>
      {href && <ChevronRight className="w-4 h-4 text-muted-foreground ml-auto shrink-0" />}
    </div>
  );

  if (href) return <Link href={href}>{inner}</Link>;
  return inner;
}

/* ================= ALERT ROW ================= */

// תוקן: class names סטטיים במקום dynamic string manipulation — Tailwind יכול לסרוק
type AlertRowConfig = {
  label: string;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  dotClass: string;
  iconClass: string;
  badgeBg: string;
  badgeText: string;
};

function AlertRow({ label, count, icon: Icon, href, dotClass, iconClass, badgeBg, badgeText }: AlertRowConfig) {
  if (count === 0) return null;
  return (
    <Link
      href={href}
      className="flex items-center justify-between px-4 py-3 rounded-xl hover:bg-muted transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
        <Icon className={`w-4 h-4 ${iconClass}`} />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-sm font-bold px-2 py-0.5 rounded-full ${badgeBg} ${badgeText}`}>
          {count}
        </span>
        <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
      </div>
    </Link>
  );
}

/* ================= RECENT ITEM ================= */

function RecentItem({
  name,
  status,
  lastSeen,
  id,
}: {
  name: string;
  status?: string | null;
  lastSeen?: string | null;
  id: string;
}) {
  const statusColor =
    status === "ok" ? "bg-green-400"
    : status === "issue" ? "bg-orange-400"
    : status === "maintenance" ? "bg-red-400"
    : status === "sterilized" ? "bg-teal-400"
    : "bg-gray-300";

  return (
    <Link
      href={`/equipment/${id}`}
      className="flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-muted transition-colors group"
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${statusColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground">
          {lastSeen
            ? formatDistanceToNow(new Date(lastSeen), { addSuffix: true })
            : "Never scanned"}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </Link>
  );
}

/* ================= SKELETON ================= */

function DashboardSkeleton() {
  return (
    <Layout>
      <div className="flex flex-col gap-5">
        <Skeleton className="h-8 w-48 rounded-xl" />
        <div className="grid grid-cols-2 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-[72px] rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
    </Layout>
  );
}

/* ================= ALERT ROWS CONFIG ================= */
// סטטי — Tailwind סורק את כל ה-classes בבנייה
type AlertRowData = AlertRowConfig & { key: string };

function buildAlertRows({
  overdueCount,
  issueCount,
  inactiveCount,
  sterilizationDueCount,
}: {
  overdueCount: number;
  issueCount: number;
  inactiveCount: number;
  sterilizationDueCount: number;
}): AlertRowData[] {
  return [
    {
      key: "overdue",
      label: "Overdue Maintenance",
      count: overdueCount,
      icon: Wrench,
      href: "/alerts?type=overdue",
      dotClass: "bg-red-500",
      iconClass: "text-red-500",
      badgeBg: "bg-red-100",
      badgeText: "text-red-700",
    },
    {
      key: "issue",
      label: "Unresolved Issues",
      count: issueCount,
      icon: AlertTriangle,
      href: "/alerts?type=issue",
      dotClass: "bg-orange-400",
      iconClass: "text-orange-500",
      badgeBg: "bg-orange-100",
      badgeText: "text-orange-700",
    },
    {
      key: "inactive",
      label: "Inactive Equipment",
      count: inactiveCount,
      icon: Clock,
      href: "/alerts?type=inactive",
      dotClass: "bg-gray-400",
      iconClass: "text-gray-500",
      badgeBg: "bg-gray-100",
      badgeText: "text-gray-700",
    },
    {
      key: "sterilization",
      label: "Sterilization Due",
      count: sterilizationDueCount,
      icon: ShieldCheck,
      href: "/equipment",
      dotClass: "bg-teal-500",
      iconClass: "text-teal-600",
      badgeBg: "bg-teal-100",
      badgeText: "text-teal-700",
    },
  ];
}

/* ================= DASHBOARD ================= */

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const { data: equipment, isLoading: equipmentLoading } = useListEquipment();
  const { data: analytics, isLoading: analyticsLoading } = useGetAnalyticsSummary();

  const isLoading = !isLoaded || equipmentLoading || analyticsLoading;

  if (isLoading) return <DashboardSkeleton />;

  const allItems = equipment ?? [];
  const alerts = computeAlerts(allItems);

  const totalEquipment = allItems.length;
  const okCount = allItems.filter((e) => e.lastStatus === "ok").length;
  const issueCount = allItems.filter((e) => e.lastStatus === "issue").length;
  const maintenanceCount = allItems.filter((e) => e.lastStatus === "maintenance").length;
  const overdueCount = alerts.filter((a) => a.type === "overdue").length;
  const inactiveCount = alerts.filter((a) => a.type === "inactive").length;

  const sterilizationDueCount = allItems.filter((item) => {
    if (!item.category || !STERILIZATION_CATEGORIES.includes(item.category)) return false;
    if (!item.lastMaintenanceDate) return true;
    const daysSince =
      (Date.now() - new Date(item.lastMaintenanceDate).getTime()) /
      (1000 * 60 * 60 * 24);
    return daysSince > STERILIZATION_WINDOW_DAYS;
  }).length;

  const recentItems = [...allItems]
    .filter((e) => !!e.lastSeen)
    .sort((a, b) => new Date(b.lastSeen!).getTime() - new Date(a.lastSeen!).getTime())
    .slice(0, 5);

  const firstName = user?.firstName ?? user?.username ?? "there";
  const totalAlerts = issueCount + overdueCount;
  const hasAlerts = overdueCount > 0 || inactiveCount > 0 || sterilizationDueCount > 0 || issueCount > 0;

  const alertRows = buildAlertRows({ overdueCount, issueCount, inactiveCount, sterilizationDueCount });

  return (
    <Layout>
      <div className="flex flex-col gap-5 pb-10">

        {/* Greeting */}
        <div className="pt-1">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">
            Hello, {firstName} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {totalAlerts > 0
              ? `${totalAlerts} item${totalAlerts !== 1 ? "s" : ""} need${totalAlerts === 1 ? "s" : ""} your attention`
              : "Everything looks good today"}
          </p>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label="Total Equipment"
            value={totalEquipment}
            icon={Boxes}
            bgColor="bg-blue-500"
            href="/equipment"
          />
          <StatCard
            label="Operational"
            value={okCount}
            icon={CheckCircle2}
            bgColor="bg-green-500"
          />
          <StatCard
            label="Issues"
            value={issueCount}
            icon={AlertTriangle}
            bgColor="bg-orange-500"
            href="/alerts?type=issue"
          />
          <StatCard
            label="In Maintenance"
            value={maintenanceCount}
            icon={Wrench}
            bgColor="bg-red-500"
            href="/alerts?type=overdue"
          />
        </div>

        {/* Alerts Summary */}
        {hasAlerts && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Needs Attention
              </h2>
            </div>
            <div className="py-1">
              {alertRows.map(({ key, ...row }) => (
                <AlertRow key={key} {...row} />
              ))}
            </div>
          </div>
        )}

        {/* All clear */}
        {!hasAlerts && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-green-800">All clear</p>
              <p className="text-xs text-green-700 mt-0.5">
                No issues, overdue maintenance, or inactive equipment.
              </p>
            </div>
          </div>
        )}

        {/* Analytics Summary */}
        {analytics && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Last 30 Days
              </h2>
              <Link
                href="/analytics"
                className="text-xs text-primary font-medium hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                Full report
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 divide-x divide-border">
              <div className="px-4 py-4 text-center">
                <p className="text-2xl font-bold text-foreground">
                  {analytics.scanActivity?.reduce((s, d) => s + d.count, 0) ?? 0}
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-medium flex items-center justify-center gap-1">
                  <Activity className="w-3.5 h-3.5" />
                  Total Scans
                </p>
              </div>
              <div className="px-4 py-4 text-center">
                <p
                  className={`text-2xl font-bold ${
                    (analytics.maintenanceComplianceRate ?? 0) >= 80
                      ? "text-green-600"
                      : (analytics.maintenanceComplianceRate ?? 0) >= 50
                        ? "text-orange-500"
                        : "text-red-600"
                  }`}
                >
                  {analytics.maintenanceComplianceRate ?? 0}%
                </p>
                <p className="text-xs text-muted-foreground mt-1 font-medium flex items-center justify-center gap-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  Maintenance Compliance
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Recently Scanned */}
        {recentItems.length > 0 && (
          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Recently Scanned
              </h2>
              <Link
                href="/activity"
                className="text-xs text-primary font-medium hover:text-primary/80 transition-colors flex items-center gap-1"
              >
                View all
                <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="py-1">
              {recentItems.map((item) => (
                <RecentItem
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  status={item.lastStatus}
                  lastSeen={item.lastSeen}
                />
              ))}
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="grid grid-cols-3 gap-3">
          <Link
            href="/activity"
            className="flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border border-border bg-blue-50 hover:shadow-sm transition-all active:scale-[0.97]"
          >
            <Activity className="w-5 h-5 text-blue-600" />
            <span className="text-xs font-semibold text-foreground">Activity</span>
          </Link>
          <Link
            href="/analytics"
            className="flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border border-border bg-purple-50 hover:shadow-sm transition-all active:scale-[0.97]"
          >
            <BarChart3 className="w-5 h-5 text-purple-600" />
            <span className="text-xs font-semibold text-foreground">Analytics</span>
          </Link>
          <Link
            href="/print"
            className="flex flex-col items-center gap-2 px-3 py-4 rounded-2xl border border-border bg-gray-50 hover:shadow-sm transition-all active:scale-[0.97]"
          >
            <Boxes className="w-5 h-5 text-gray-600" />
            <span className="text-xs font-semibold text-foreground">Print QR</span>
          </Link>
        </div>

      </div>
    </Layout>
  );
}
