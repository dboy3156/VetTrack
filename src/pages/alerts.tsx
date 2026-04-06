import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonAlertCard } from "@/components/ui/skeleton-cards";
import { ErrorCard } from "@/components/ui/error-card";
import { EmptyState } from "@/components/ui/empty-state";
import { computeAlerts } from "@/lib/utils";
import {
  AlertTriangle,
  Clock,
  Activity,
  CheckCircle,
  Bell,
  Droplets,
  UserCheck,
  X,
  MapPin,
  ChevronRight,
} from "lucide-react";
import type { Alert, AlertType, AlertAcknowledgment } from "@/types";
import { toast } from "sonner";

function formatRelativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin === 1) return "1 minute ago";
  if (diffMin < 60) return `${diffMin} minutes ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr === 1) return "1 hour ago";
  if (diffHr < 24) return `${diffHr} hours ago`;
  const diffDay = Math.floor(diffHr / 24);
  return diffDay === 1 ? "1 day ago" : `${diffDay} days ago`;
}

const ALERT_CONFIG: Record<
  AlertType,
  { icon: React.ElementType; dotColor: string; label: string; badgeLabel: string; badgeClass: string; iconBg: string }
> = {
  issue: {
    icon: AlertTriangle,
    dotColor: "bg-red-400",
    label: "Active Issue",
    badgeLabel: "Critical",
    badgeClass: "bg-red-50 text-red-600 border-red-200",
    iconBg: "bg-red-50",
  },
  overdue: {
    icon: Clock,
    dotColor: "bg-amber-400",
    label: "Overdue",
    badgeLabel: "High",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200",
    iconBg: "bg-amber-50",
  },
  sterilization_due: {
    icon: Droplets,
    dotColor: "bg-teal-400",
    label: "Sterilization Due",
    badgeLabel: "Medium",
    badgeClass: "bg-teal-50 text-teal-700 border-teal-200",
    iconBg: "bg-teal-50",
  },
  inactive: {
    icon: Activity,
    dotColor: "bg-slate-300",
    label: "Inactive",
    badgeLabel: "Low",
    badgeClass: "bg-slate-50 text-slate-600 border-slate-200",
    iconBg: "bg-muted",
  },
};

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();

  const { data: equipment, isLoading: eqLoading, isError: eqError, refetch: refetchEq } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
  });

  const { data: acks, isLoading: acksLoading, isError: acksError, refetch: refetchAcks } = useQuery({
    queryKey: ["/api/alert-acks"],
    queryFn: api.alertAcks.list,
  });

  const ackMut = useMutation({
    mutationFn: ({ equipmentId, alertType }: { equipmentId: string; alertType: string }) =>
      api.alertAcks.acknowledge(equipmentId, alertType),
    onSuccess: () => {
      navigator.vibrate?.(50);
      queryClient.invalidateQueries({ queryKey: ["/api/alert-acks"] });
      toast.success("Marked as handling");
    },
    onError: () => toast.error("Failed to acknowledge"),
  });

  const unAckMut = useMutation({
    mutationFn: ({ equipmentId, alertType }: { equipmentId: string; alertType: string }) =>
      api.alertAcks.remove(equipmentId, alertType),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/alert-acks"] });
    },
    onError: () => toast.error("Failed to remove"),
  });

  const isLoading = eqLoading || acksLoading;
  const isError = eqError || acksError;
  const alerts = equipment ? computeAlerts(equipment) : [];

  const acksMap = new Map<string, AlertAcknowledgment>();
  if (acks) {
    for (const ack of acks) {
      acksMap.set(`${ack.equipmentId}:${ack.alertType}`, ack);
    }
  }

  const equipmentLocationMap = new Map<string, string>();
  if (equipment) {
    for (const eq of equipment) {
      const loc = eq.checkedOutLocation || eq.location;
      if (loc) equipmentLocationMap.set(eq.id, loc);
    }
  }

  const grouped: Partial<Record<AlertType, Alert[]>> = {};
  for (const alert of alerts) {
    if (!grouped[alert.type]) grouped[alert.type] = [];
    grouped[alert.type]!.push(alert);
  }

  const priorityOrder: AlertType[] = ["issue", "overdue", "sterilization_due", "inactive"];

  return (
    <Layout>
      <Helmet>
        <title>Alerts — VetTrack</title>
        <meta name="description" content="Active equipment alerts sorted by severity — CRITICAL issues, overdue maintenance, sterilization reminders, and inactive equipment. Acknowledge and assign handlers." />
        <link rel="canonical" href="https://vettrack.replit.app/alerts" />
      </Helmet>
      <div className="flex flex-col gap-5 pb-24 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2">
            <Bell className="w-5 h-5 text-muted-foreground" />
            Alerts
          </h1>
          {alerts.length > 0 && (
            <span className="text-xs font-semibold text-muted-foreground bg-muted px-2.5 py-1 rounded-full">
              {alerts.length} active
            </span>
          )}
        </div>

        {isError && (
          <ErrorCard
            message="Failed to load alerts. Please try again."
            onRetry={() => {
              refetchEq();
              refetchAcks();
            }}
          />
        )}

        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(5)].map((_, i) => (
              <SkeletonAlertCard key={i} />
            ))}
          </div>
        ) : isError ? null : alerts.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            message="All Clear!"
            subMessage="No alerts at this time. All equipment is in good standing."
            iconBg="bg-emerald-50"
            iconColor="text-emerald-500"
            borderColor="border-border/60"
            action={
              <Link href="/equipment">
                <Button variant="outline" size="sm">
                  Browse Equipment
                </Button>
              </Link>
            }
          />
        ) : (
          priorityOrder
            .filter((type) => grouped[type] && grouped[type]!.length > 0)
            .map((type) => {
              const config = ALERT_CONFIG[type];
              const Icon = config.icon;
              const items = grouped[type]!;

              return (
                <div key={type}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className={`w-2 h-2 rounded-full ${config.dotColor} shrink-0`} />
                    <h2 className="text-sm font-semibold text-foreground">{config.label}</h2>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${config.badgeClass}`}>
                      {config.badgeLabel}
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto">
                      {items.length} item{items.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((alert) => {
                      const ackKey = `${alert.equipmentId}:${alert.type}`;
                      const ack = acksMap.get(ackKey);
                      const location = equipmentLocationMap.get(alert.equipmentId);

                      return (
                        <Card
                          key={`${alert.type}-${alert.equipmentId}`}
                          className="bg-card border-border/60 shadow-sm overflow-hidden"
                        >
                          {/* Clickable main area → navigate to equipment detail */}
                          <button
                            className="w-full text-left p-4 flex items-start gap-3 hover:bg-muted/30 transition-colors active:bg-muted/50"
                            onClick={() => navigate(`/equipment/${alert.equipmentId}`)}
                            data-testid={`alert-navigate-${alert.equipmentId}`}
                          >
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${config.iconBg}`}>
                              <Icon className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-sm truncate">
                                {alert.equipmentName}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                {alert.detail}
                              </p>
                              {location && (
                                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                  <MapPin className="w-3 h-3 shrink-0" />
                                  {location}
                                </p>
                              )}
                            </div>
                            <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
                          </button>

                          {/* Single action: acknowledge / handling status */}
                          <div className="px-4 pb-3">
                            {ack ? (
                              <div className="flex items-center justify-between gap-2 bg-muted/50 rounded-xl px-3 py-2">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-xs text-foreground font-medium truncate block">
                                      {ack.acknowledgedByEmail.split("@")[0]}
                                    </span>
                                    <span className="text-xs text-muted-foreground truncate block">
                                      Handling since {formatRelativeTime(new Date(ack.acknowledgedAt))}
                                    </span>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="w-6 h-6 text-muted-foreground hover:text-red-500 shrink-0"
                                  onClick={() =>
                                    unAckMut.mutate({
                                      equipmentId: alert.equipmentId,
                                      alertType: alert.type,
                                    })
                                  }
                                  data-testid={`btn-unack-${alert.equipmentId}`}
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs w-full border-border/60 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  ackMut.mutate({
                                    equipmentId: alert.equipmentId,
                                    alertType: alert.type,
                                  })
                                }
                                data-testid={`btn-ack-${alert.equipmentId}`}
                              >
                                <UserCheck className="w-3.5 h-3.5 mr-1.5" />
                                I'm handling this
                              </Button>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              );
            })
        )}
      </div>
    </Layout>
  );
}
