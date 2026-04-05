import { useListEquipment } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Link, useLocation } from "wouter";
import { computeAlerts, type Alert } from "@/lib/alerts";
import { AlertTriangle, Wrench, Clock, CheckCircle2, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ALERT_CONFIG: Record<Alert["type"], {
  label: string;
  icon: React.ReactNode;
  accentClass: string;
  badgeClass: string;
}> = {
  overdue: {
    label: "Overdue Maintenance",
    icon: <Wrench className="w-4 h-4" />,
    accentClass: "bg-red-500",
    badgeClass: "bg-red-100 text-red-700",
  },
  issue: {
    label: "Unresolved Issue",
    icon: <AlertTriangle className="w-4 h-4" />,
    accentClass: "bg-orange-400",
    badgeClass: "bg-orange-100 text-orange-700",
  },
  inactive: {
    label: "Inactive",
    icon: <Clock className="w-4 h-4" />,
    accentClass: "bg-gray-300",
    badgeClass: "bg-gray-100 text-gray-600",
  },
};

function ProblemRow({ alert }: { alert: Alert }) {
  const cfg = ALERT_CONFIG[alert.type];
  return (
    <Link
      href={`/equipment/${alert.equipmentId}`}
      className="group bg-card rounded-2xl border border-border shadow-sm hover:shadow-md hover:border-primary/30 transition-all overflow-hidden flex items-stretch"
    >
      <div className={`w-1 shrink-0 ${cfg.accentClass}`} />
      <div className="flex-1 flex items-center justify-between gap-3 px-4 py-3.5">
        <div className="min-w-0">
          <p className="font-semibold text-lg text-foreground truncate">{alert.equipmentName}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-sm font-semibold ${cfg.badgeClass}`}>
              {cfg.icon}
              {cfg.label}
            </span>
          </div>
          {alert.detail && (
            <p className="text-sm text-muted-foreground mt-1">{alert.detail}</p>
          )}
        </div>
        <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

function AlertGroup({ title, alerts }: { title: string; alerts: Alert[] }) {
  if (alerts.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
        {title} ({alerts.length})
      </p>
      {alerts.map((alert) => (
        <ProblemRow key={`${alert.type}-${alert.equipmentId}`} alert={alert} />
      ))}
    </div>
  );
}

export default function Problems() {
  const { data: equipment, isLoading } = useListEquipment();
  const [location] = useLocation();

  const alerts = equipment ? computeAlerts(equipment) : [];

  // תוקן: safe parsing של query string
  const searchPart = location.includes("?") ? location.split("?")[1] : "";
  const typeFromUrl = new URLSearchParams(searchPart).get("type");

  const overdueAlerts = alerts.filter((a) => a.type === "overdue");
  const issueAlerts = alerts.filter((a) => a.type === "issue");
  const inactiveAlerts = alerts.filter((a) => a.type === "inactive");

  const filteredAlerts = !typeFromUrl
    ? alerts
    : alerts.filter((a) => a.type === typeFromUrl);

  return (
    <Layout>
      <div className="flex flex-col gap-5 pb-10">
        <div className="pt-1">
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Problems</h1>
          <p className="text-base text-muted-foreground mt-0.5">Equipment that needs attention</p>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-3">
            <Skeleton className="h-[72px] w-full rounded-2xl" />
            <Skeleton className="h-[72px] w-full rounded-2xl" />
            <Skeleton className="h-[72px] w-full rounded-2xl" />
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-green-50 flex items-center justify-center">
              <CheckCircle2 className="w-7 h-7 text-green-500" />
            </div>
            <p className="font-semibold text-lg">All clear</p>
            <p className="text-muted-foreground text-base">
              No issues, overdue maintenance, or inactive equipment.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {(!typeFromUrl || typeFromUrl === "overdue") && (
              <AlertGroup title="Overdue Maintenance" alerts={overdueAlerts} />
            )}
            {(!typeFromUrl || typeFromUrl === "issue") && (
              <AlertGroup title="Unresolved Issues" alerts={issueAlerts} />
            )}
            {(!typeFromUrl || typeFromUrl === "inactive") && (
              <AlertGroup title="Inactive" alerts={inactiveAlerts} />
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
