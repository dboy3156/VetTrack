import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorCard } from "@/components/ui/error-card";
import { EmptyState } from "@/components/ui/empty-state";
import { computeAlerts, buildWhatsAppUrl } from "@/lib/utils";
import {
  AlertTriangle,
  Clock,
  Activity,
  CheckCircle,
  MessageCircle,
  ChevronRight,
  Bell,
  Droplets,
  UserCheck,
  X,
  MapPin,
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
  { icon: React.ElementType; color: string; bg: string; label: string; severityBg: string; severityText: string }
> = {
  issue: {
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-50 border-red-200",
    label: "Active Issue",
    severityBg: "bg-red-600",
    severityText: "CRITICAL",
  },
  overdue: {
    icon: Clock,
    color: "text-amber-500",
    bg: "bg-amber-50 border-amber-200",
    label: "Overdue",
    severityBg: "bg-amber-500",
    severityText: "HIGH",
  },
  sterilization_due: {
    icon: Droplets,
    color: "text-teal-500",
    bg: "bg-teal-50 border-teal-200",
    label: "Sterilization Due",
    severityBg: "bg-teal-500",
    severityText: "MEDIUM",
  },
  inactive: {
    icon: Activity,
    color: "text-slate-500",
    bg: "bg-slate-50 border-slate-200",
    label: "Inactive",
    severityBg: "bg-slate-400",
    severityText: "LOW",
  },
};

export default function AlertsPage() {
  const queryClient = useQueryClient();

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
      <div className="flex flex-col gap-4 pb-24 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold leading-tight flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Alerts
          </h1>
          {alerts.length > 0 && (
            <Badge variant="issue">{alerts.length} active</Badge>
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
          <div className="flex flex-col gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? null : alerts.length === 0 ? (
          <EmptyState
            icon={CheckCircle}
            message="All Clear!"
            subMessage="No alerts at this time. All equipment is in good standing."
            iconBg="bg-emerald-50"
            iconColor="text-emerald-500"
            borderColor="border-emerald-200"
            action={
              <Link href="/equipment">
                <Button variant="outline" size="sm" className="border-emerald-300 text-emerald-700 hover:bg-emerald-50">
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
                  <div className="flex items-center gap-2 mb-2">
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <h2 className="text-sm font-semibold">{config.label}</h2>
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded-full text-white ${config.severityBg}`}
                    >
                      {config.severityText}
                    </span>
                    <Badge variant="outline" className="text-xs ml-auto">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((alert) => {
                      const ackKey = `${alert.equipmentId}:${alert.type}`;
                      const ack = acksMap.get(ackKey);

                      return (
                        <Card
                          key={`${alert.type}-${alert.equipmentId}`}
                          className={`border ${config.bg}`}
                        >
                          <CardContent className="p-4 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-semibold text-sm truncate">
                                  {alert.equipmentName}
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {alert.detail}
                                </p>
                                {equipmentLocationMap.get(alert.equipmentId) && (
                                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                    <MapPin className="w-3 h-3 shrink-0" />
                                    {equipmentLocationMap.get(alert.equipmentId)}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  onClick={() => {
                                    const waUrl = buildWhatsAppUrl(
                                      undefined,
                                      alert.equipmentName,
                                      "issue",
                                      alert.detail
                                    );
                                    window.open(waUrl, "_blank");
                                  }}
                                  title="Send WhatsApp alert"
                                  data-testid={`btn-whatsapp-${alert.equipmentId}`}
                                >
                                  <MessageCircle className="w-4 h-4" />
                                </Button>
                                <Link href={`/equipment/${alert.equipmentId}`}>
                                  <Button variant="ghost" size="icon-sm">
                                    <ChevronRight className="w-4 h-4" />
                                  </Button>
                                </Link>
                              </div>
                            </div>

                            {/* Acknowledgment row */}
                            {ack ? (
                              <div className="flex items-center justify-between gap-2 bg-white/70 rounded-lg px-3 py-2 border border-white">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  <div className="min-w-0">
                                    <span className="text-xs text-emerald-700 font-medium truncate block">
                                      {ack.acknowledgedByEmail.split("@")[0]}
                                    </span>
                                    <span className="text-xs text-emerald-600/70 truncate block">
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
                                >
                                  <X className="w-3 h-3" />
                                </Button>
                              </div>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 text-xs self-start"
                                onClick={() =>
                                  ackMut.mutate({
                                    equipmentId: alert.equipmentId,
                                    alertType: alert.type,
                                  })
                                }
                                data-testid={`btn-ack-${alert.equipmentId}`}
                              >
                                <UserCheck className="w-3.5 h-3.5 mr-1" />
                                I'm handling this
                              </Button>
                            )}
                          </CardContent>
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
