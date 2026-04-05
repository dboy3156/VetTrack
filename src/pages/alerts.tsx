import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
} from "lucide-react";
import type { Alert, AlertType } from "@/types";

const ALERT_CONFIG: Record<
  AlertType,
  { icon: React.ElementType; color: string; bg: string; label: string }
> = {
  issue: {
    icon: AlertTriangle,
    color: "text-red-500",
    bg: "bg-red-50 border-red-200",
    label: "Active Issue",
  },
  overdue: {
    icon: Clock,
    color: "text-amber-500",
    bg: "bg-amber-50 border-amber-200",
    label: "Overdue",
  },
  sterilization_due: {
    icon: Droplets,
    color: "text-teal-500",
    bg: "bg-teal-50 border-teal-200",
    label: "Sterilization Due",
  },
  inactive: {
    icon: Activity,
    color: "text-slate-500",
    bg: "bg-slate-50 border-slate-200",
    label: "Inactive",
  },
};

export default function AlertsPage() {
  const { data: equipment, isLoading } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
  });

  const alerts = equipment ? computeAlerts(equipment) : [];

  const grouped: Partial<Record<AlertType, Alert[]>> = {};
  for (const alert of alerts) {
    if (!grouped[alert.type]) grouped[alert.type] = [];
    grouped[alert.type]!.push(alert);
  }

  const priorityOrder: AlertType[] = ["issue", "overdue", "sterilization_due", "inactive"];

  return (
    <Layout>
      <div className="flex flex-col gap-4 pb-24 animate-fade-in">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" />
            Alerts
          </h1>
          {alerts.length > 0 && (
            <Badge variant="destructive">{alerts.length} active</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-2">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : alerts.length === 0 ? (
          <Card className="border-2 border-dashed border-emerald-200">
            <CardContent className="p-10 text-center">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="font-bold text-lg text-emerald-700">All Clear!</h3>
              <p className="text-muted-foreground text-sm mt-1">
                No alerts at this time. All equipment is in good standing.
              </p>
            </CardContent>
          </Card>
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
                    <h2 className="font-semibold text-sm">{config.label}</h2>
                    <Badge variant="outline" className="text-xs">
                      {items.length}
                    </Badge>
                  </div>
                  <div className="flex flex-col gap-2">
                    {items.map((alert) => (
                      <Card
                        key={`${alert.type}-${alert.equipmentId}`}
                        className={`border ${config.bg}`}
                      >
                        <CardContent className="p-3.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm truncate">
                              {alert.equipmentName}
                            </p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {alert.detail}
                            </p>
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
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              );
            })
        )}
      </div>
    </Layout>
  );
}
