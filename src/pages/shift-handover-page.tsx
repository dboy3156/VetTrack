import { t } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { useSearch } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ClipboardList, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatDateTimeByLocale } from "@/lib/i18n";
import type { ShiftHandoverSummary } from "@/types";

function formatIls(cents: number): string {
  return (cents / 100).toLocaleString("he-IL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatExpiryYmd(value: string | null): string {
  if (!value?.trim()) return "—";
  const d = new Date(`${value.trim()}T12:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("he-IL");
}

function buildHebrewSummary(data: ShiftHandoverSummary): string {
  const p = t.shiftHandoverPage;
  const windowKind = data.windowSource === "open_shift" ? p.windowOpenShift : p.windowFallback;
  const lines: string[] = [
    `*${p.title}*`,
    `${p.windowLabel}: ${formatDateTimeByLocale(new Date(data.windowStart))} — ${formatDateTimeByLocale(new Date(data.windowEnd))}`,
    `${windowKind}`,
    `${p.revenue}: ₪${formatIls(data.revenueCents)}`,
    "",
    `*${p.unreturnedTitle}* (${data.unreturned.length})`,
    ...data.unreturned.map(
      (u) =>
        `• ${u.name}${u.checkedOutByEmail ? ` — ${u.checkedOutByEmail}` : ""}${u.checkedOutLocation ? ` — ${u.checkedOutLocation}` : ""}`,
    ),
    ...(data.unreturned.length === 0 ? [p.noItems] : []),
    "",
    `*${p.activityTitle}* (${data.hotAssets.length})`,
    ...data.hotAssets.map((h) => `• ${h.name} — ${p.scanCount}: ${h.scans}`),
    ...(data.hotAssets.length === 0 ? [p.noItems] : []),
    "",
    `*${p.expiringTitle}* (${data.expiringAssets.length})`,
    ...data.expiringAssets.map(
      (e) => `• ${e.name}${e.expiryDate ? ` — ${p.expiryLabel}: ${formatExpiryYmd(e.expiryDate)}` : ""}`,
    ),
    ...(data.expiringAssets.length === 0 ? [p.noItems] : []),
  ];
  return lines.join("\n");
}

export default function ShiftHandoverPage() {
  const search = useSearch();
  const dischargeAnimalId = useMemo(() => new URLSearchParams(search).get("discharge"), [search]);
  const [dischargeOpen, setDischargeOpen] = useState(false);

  const dischargeQ = useQuery({
    queryKey: ["/api/shift-handover/discharge", dischargeAnimalId],
    queryFn: () => api.shiftHandover.getDischargeItems(dischargeAnimalId!),
    enabled: Boolean(dischargeAnimalId),
  });

  useEffect(() => {
    if (dischargeAnimalId) setDischargeOpen(true);
  }, [dischargeAnimalId]);

  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["/api/shift-handover/summary"],
    queryFn: () => api.shiftHandover.getSummary(),
  });

  const startMut = useMutation({
    mutationFn: () => api.shiftHandover.startSession(),
    onSuccess: () => {
      toast.success(t.shiftHandoverPage.startShift);
      qc.invalidateQueries({ queryKey: ["/api/shift-handover/summary"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("409") || msg.toLowerCase().includes("conflict")) {
        toast.error(t.shiftHandoverPage.shiftConflict);
      } else {
        toast.error(t.shiftHandoverPage.loadError);
      }
    },
  });

  const endMut = useMutation({
    mutationFn: () => api.shiftHandover.endSession(),
    onSuccess: () => {
      toast.success(t.shiftHandoverPage.endShift);
      qc.invalidateQueries({ queryKey: ["/api/shift-handover/summary"] });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("404")) {
        toast.error(t.shiftHandoverPage.noOpenShift);
      } else {
        toast.error(t.shiftHandoverPage.loadError);
      }
    },
  });

  const copySummary = async () => {
    if (!q.data) return;
    try {
      await navigator.clipboard.writeText(buildHebrewSummary(q.data));
      toast.success(t.shiftHandoverPage.copied);
    } catch {
      toast.error(t.shiftHandoverPage.loadError);
    }
  };

  const p = t.shiftHandoverPage;
  const data = q.data;

  return (
    <Layout title={p.title}>
      <Helmet>
        <title>{p.title} — VetTrack</title>
      </Helmet>
      <Dialog open={dischargeOpen} onOpenChange={setDischargeOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.shiftHandoverPage.dischargeTitle}</DialogTitle>
          </DialogHeader>
          {dischargeQ.isLoading && <Skeleton className="h-20 w-full" />}
          {dischargeQ.data && (
            <ul className="text-sm space-y-2">
              {dischargeQ.data.items.length === 0 ? (
                <li className="text-muted-foreground">{t.shiftHandoverPage.dischargeEmpty}</li>
              ) : (
                dischargeQ.data.items.map((it) => (
                  <li key={it.sessionId} className="font-medium">
                    {it.equipmentName ?? "—"}
                  </li>
                ))
              )}
            </ul>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDischargeOpen(false)}>
              {t.shiftHandoverPage.dischargeClose}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ClipboardList className="w-7 h-7" aria-hidden />
              {p.title}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{p.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => copySummary()}
              disabled={!data || q.isLoading}
              className="gap-1"
            >
              <Copy className="w-4 h-4" />
              {p.copySummary}
            </Button>
            {!data?.openShiftSession ? (
              <Button size="sm" onClick={() => startMut.mutate()} disabled={startMut.isPending}>
                {startMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {p.startShift}
              </Button>
            ) : (
              <Button variant="secondary" size="sm" onClick={() => endMut.mutate()} disabled={endMut.isPending}>
                {endMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {p.endShift}
              </Button>
            )}
          </div>
        </div>

        {q.isLoading && (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {q.isError && (
          <Card className="border-destructive/50">
            <CardContent className="pt-6 text-destructive">{p.loadError}</CardContent>
          </Card>
        )}

        {data && (
          <Accordion type="multiple" defaultValue={["unreturned", "revenue", "activity", "expiring"]} className="w-full border rounded-xl px-3 bg-card">
            <AccordionItem value="unreturned">
              <AccordionTrigger className="text-base font-semibold">{p.unreturnedTitle}</AccordionTrigger>
              <AccordionContent>
                {data.unreturned.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{p.noItems}</p>
                ) : (
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {data.unreturned.map((u) => (
                      <li key={u.id}>
                        <span className="font-medium">{u.name}</span>
                        {u.checkedOutByEmail ? ` — ${u.checkedOutByEmail}` : ""}
                        {u.checkedOutLocation ? ` — ${u.checkedOutLocation}` : ""}
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="revenue">
              <AccordionTrigger className="text-base font-semibold">{p.revenueSectionTitle}</AccordionTrigger>
              <AccordionContent className="text-sm space-y-2">
                <p>
                  {formatDateTimeByLocale(new Date(data.windowStart))} — {formatDateTimeByLocale(new Date(data.windowEnd))}
                </p>
                <p className="text-muted-foreground">
                  {data.windowSource === "open_shift" ? p.windowOpenShift : p.windowFallback}
                </p>
                <p className="text-lg font-semibold pt-1">
                  {p.revenue}: ₪{formatIls(data.revenueCents)}
                </p>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="activity">
              <AccordionTrigger className="text-base font-semibold">{p.activityTitle}</AccordionTrigger>
              <AccordionContent>
                {data.hotAssets.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{p.noItems}</p>
                ) : (
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {data.hotAssets.map((h) => (
                      <li key={h.id}>
                        {h.name} — {p.scanCount}: {h.scans}
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="expiring" className="border-b-0">
              <AccordionTrigger className="text-base font-semibold">{p.expiringTitle}</AccordionTrigger>
              <AccordionContent>
                {data.expiringAssets.length === 0 ? (
                  <p className="text-muted-foreground text-sm">{p.noItems}</p>
                ) : (
                  <ul className="list-disc list-inside space-y-1 text-sm">
                    {data.expiringAssets.map((e) => (
                      <li key={e.id}>
                        <span className="font-medium">{e.name}</span>
                        {e.expiryDate ? (
                          <span className="text-muted-foreground">
                            {" "}
                            — {p.expiryLabel}: {formatExpiryYmd(e.expiryDate)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
      </div>
    </Layout>
  );
}
