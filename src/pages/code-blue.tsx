import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { useLocation } from "wouter";
import { AlertTriangle, Siren, Stethoscope, Wrench, X } from "lucide-react";
import { api } from "@/lib/api";
import { leaderPoll } from "@/lib/leader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CriticalEquipment } from "@/types";
import { formatDistanceToNow } from "date-fns";
import { he } from "date-fns/locale";
import { useAuth } from "@/hooks/use-auth";

function formatCodeBlueRelativeTime(timestamp?: string | null): string {
  if (!timestamp) return "לא ידוע";
  try {
    return formatDistanceToNow(new Date(timestamp), { addSuffix: true, locale: he });
  } catch {
    return "לא ידוע";
  }
}

function getCategoryIcon(category: string) {
  const normalized = category.toLowerCase();
  if (normalized.includes("surg") || normalized.includes("steril")) return Wrench;
  return Stethoscope;
}

function statusLabel(status: CriticalEquipment["status"]): string {
  return status === "critical" ? "קריטי" : "דורש תשומת לב";
}

function statusClass(status: CriticalEquipment["status"]): string {
  return status === "critical"
    ? "bg-red-900 text-red-200 border-red-700"
    : "bg-amber-900 text-amber-200 border-amber-700";
}

function scoreLastSeen(timestamp?: string | null): number {
  if (!timestamp) return Number.NEGATIVE_INFINITY;
  const parsed = new Date(timestamp).getTime();
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function hasKnownLocation(item: CriticalEquipment): number {
  return item.lastSeenLocation && item.lastSeenLocation.trim().length > 0 ? 1 : 0;
}

function functionalPriority(status: CriticalEquipment["status"]): number {
  return status === "critical" ? 0 : 1;
}

function sortByCodeBluePriority(items: CriticalEquipment[]): CriticalEquipment[] {
  return [...items].sort((a, b) => {
    // Stabilization contract: Proximity > Accessibility > Functional status.
    const proximityDelta = scoreLastSeen(b.lastSeenTimestamp) - scoreLastSeen(a.lastSeenTimestamp);
    if (proximityDelta !== 0) return proximityDelta;

    const accessibilityDelta = hasKnownLocation(b) - hasKnownLocation(a);
    if (accessibilityDelta !== 0) return accessibilityDelta;

    const functionalDelta = functionalPriority(a.status) - functionalPriority(b.status);
    if (functionalDelta !== 0) return functionalDelta;

    return a.id.localeCompare(b.id);
  });
}

export default function CodeBluePage() {
  const [, navigate] = useLocation();
  const { userId } = useAuth();
  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["/api/equipment/critical"],
    queryFn: api.equipment.getCriticalEquipment,
    enabled: !!userId,
    refetchInterval: leaderPoll(15_000),
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const items = useMemo(() => sortByCodeBluePriority(data ?? []), [data]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] bg-zinc-950 text-white overflow-y-auto"
      >
        <motion.div
          className="pointer-events-none fixed inset-0 border-4 border-red-600/70"
          animate={{ opacity: [0.2, 1, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        />

        <div className="relative max-w-4xl mx-auto px-4 py-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 rounded-full border border-red-600 bg-red-950/90 px-3 py-1.5">
              <AlertTriangle className="w-5 h-5 text-red-300" />
              <span className="text-sm md:text-base font-bold tracking-wide text-red-200">
                CODE BLUE — ציוד קריטי
              </span>
            </div>
            <Button
              variant="outline"
              className="border-zinc-600 bg-zinc-900/80 text-zinc-100 hover:bg-zinc-800"
              onClick={() => navigate("/home")}
              data-testid="code-blue-dismiss"
            >
              <X className="w-4 h-4 mr-1" />
              סגור
            </Button>
          </div>

          <div className="mt-4 flex items-center justify-between text-sm text-zinc-300">
            <div className="flex items-center gap-2">
              <Siren className="w-4 h-4 text-red-400" />
              <span>ציוד זמין לטיפול דחוף בלבד</span>
            </div>
            <Button
              variant="ghost"
              className="text-zinc-200 hover:text-white hover:bg-zinc-800"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              רענן
            </Button>
          </div>

          {isLoading ? (
            <div className="mt-6 text-zinc-300">טוען ציוד קריטי...</div>
          ) : isError ? (
            <div className="mt-6 rounded-xl border border-red-700 bg-red-950/60 p-4 text-red-200">
              לא הצלחנו לטעון את רשימת הציוד הקריטי.
            </div>
          ) : items.length === 0 ? (
            <div className="mt-6 rounded-xl border border-zinc-700 bg-zinc-900/80 p-4 text-zinc-200">
              אין כרגע ציוד קריטי או ציוד שדורש תשומת לב.
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              {items.map((item) => {
                const CategoryIcon = getCategoryIcon(item.category);
                return (
                  <Card
                    key={item.id}
                    className="border-zinc-700 bg-zinc-900/90 text-zinc-50"
                    data-testid={`critical-equipment-card-${item.id}`}
                  >
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-semibold text-base truncate">{item.name}</p>
                          <p className="text-xs text-zinc-300 flex items-center gap-1 mt-0.5">
                            <CategoryIcon className="w-3.5 h-3.5" />
                            {item.category}
                          </p>
                        </div>
                        <Badge className={statusClass(item.status)}>
                          {statusLabel(item.status)}
                        </Badge>
                      </div>

                      <div className="rounded-lg border border-zinc-700 bg-zinc-800/70 p-3">
                        <p className="text-xs text-zinc-400">מיקום אחרון</p>
                        <p className="text-sm font-semibold text-red-200">
                          {item.lastSeenLocation ?? "מיקום לא זמין"}
                        </p>
                      </div>

                      <p className="text-xs text-zinc-400" data-testid={`critical-equipment-time-${item.id}`}>
                        {formatCodeBlueRelativeTime(item.lastSeenTimestamp)}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
