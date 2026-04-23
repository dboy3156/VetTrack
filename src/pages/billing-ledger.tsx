import { t } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { ErrorCard } from "@/components/ui/error-card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useState, useMemo } from "react";
import type { BillingLedgerEntry } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { Receipt, Plus, Ban, TrendingUp, Clock, CheckCircle2, XCircle } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

const STATUS_BADGE: Record<BillingLedgerEntry["status"], string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  synced: "bg-emerald-100 text-emerald-800 border-emerald-200",
  voided: "bg-muted text-muted-foreground border-border line-through",
};

const STATUS_LABEL: Record<BillingLedgerEntry["status"], string> = {
  pending: "ממתין",
  synced: "מסונכרן",
  voided: "מבוטל",
};

function formatCents(cents: number): string {
  return `₪${(cents / 100).toFixed(2)}`;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

type DateRange = "today" | "week" | "month" | "all";

function getDateRange(range: DateRange): { from?: string; to?: string } {
  const now = new Date();
  const toIso = (d: Date) => d.toISOString();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { from: toIso(start), to: toIso(now) };
  }
  if (range === "week") {
    const start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from: toIso(start), to: toIso(now) };
  }
  if (range === "month") {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { from: toIso(start), to: toIso(now) };
  }
  return {};
}

const PAGE_SIZE = 50;

export default function BillingLedgerPage() {
  const qc = useQueryClient();
  const p = t.billingLedger;
  const { userId, isAdmin } = useAuth();

  const [dateRange, setDateRange] = useState<DateRange>("month");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<BillingLedgerEntry | null>(null);

  const [form, setForm] = useState({
    animalId: "",
    itemType: "CONSUMABLE" as "EQUIPMENT" | "CONSUMABLE",
    itemId: "",
    quantity: 1,
    unitPriceCents: 0,
  });

  const dateParams = useMemo(() => getDateRange(dateRange), [dateRange]);

  const summaryQ = useQuery({
    queryKey: ["/api/billing/summary", dateParams],
    queryFn: () => api.billing.summary(dateParams),
    enabled: !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const ledgerQ = useQuery({
    queryKey: ["/api/billing", statusFilter, dateParams],
    queryFn: () =>
      api.billing.list({
        ...(statusFilter !== "all" ? { status: statusFilter } : {}),
        ...dateParams,
        limit: 500,
      }),
    enabled: !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const createMut = useMutation({
    mutationFn: () =>
      api.billing.create({
        animalId: form.animalId.trim(),
        itemType: form.itemType,
        itemId: form.itemId.trim(),
        quantity: form.quantity,
        unitPriceCents: form.unitPriceCents,
      }),
    onSuccess: () => {
      toast.success(p.chargeAdded);
      qc.invalidateQueries({ queryKey: ["/api/billing"] });
      setAddOpen(false);
      setForm({ animalId: "", itemType: "CONSUMABLE", itemId: "", quantity: 1, unitPriceCents: 0 });
    },
    onError: () => toast.error(p.chargeAddFailed),
  });

  const voidMut = useMutation({
    mutationFn: (id: string) => api.billing.void(id),
    onSuccess: () => {
      toast.success(p.chargeVoided);
      qc.invalidateQueries({ queryKey: ["/api/billing"] });
      setVoidTarget(null);
    },
    onError: () => toast.error(p.chargeVoidFailed),
  });

  const allEntries = ledgerQ.data ?? [];
  const filteredEntries = useMemo(() => {
    return allEntries.filter((e) => {
      if (typeFilter === "EQUIPMENT" && e.itemType !== "EQUIPMENT") return false;
      if (typeFilter === "CONSUMABLE" && e.itemType !== "CONSUMABLE") return false;
      return true;
    });
  }, [allEntries, typeFilter]);

  const visibleEntries = filteredEntries.slice(0, (page + 1) * PAGE_SIZE);
  const hasMore = filteredEntries.length > visibleEntries.length;

  const summary = summaryQ.data;
  const chartData = summary?.byDay.map((d) => ({
    date: formatShortDate(d.date),
    amount: d.totalCents / 100,
  })) ?? [];

  const rangeButtons: { key: DateRange; label: string }[] = [
    { key: "today", label: p.rangeToday },
    { key: "week", label: p.rangeWeek },
    { key: "month", label: p.rangeMonth },
    { key: "all", label: p.rangeAll },
  ];

  return (
    <Layout>
      <Helmet>
        <title>{p.title} — VetTrack</title>
      </Helmet>

      <div dir="rtl" className="flex flex-col gap-5 pb-24 animate-fade-in">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-bold leading-tight">{p.title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Date range filter */}
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              {rangeButtons.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => { setDateRange(key); setPage(0); }}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    dateRange === key
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {isAdmin && (
              <Button size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4 ms-1" />
                {p.addCharge}
              </Button>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        {summaryQ.isPending ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : summaryQ.isError ? (
          <ErrorCard message={p.loadError} onRetry={() => summaryQ.refetch()} />
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <TrendingUp className="h-4 w-4" />
                <span className="text-xs font-medium">{p.totalBilled}</span>
              </div>
              <p className="text-2xl font-bold text-foreground tabular-nums">
                {formatCents(summary?.totalCents ?? 0)}
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Clock className="h-4 w-4" />
                <span className="text-xs font-medium">{p.totalPending}</span>
              </div>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                {formatCents(summary?.pendingCents ?? 0)}
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" />
                <span className="text-xs font-medium">{p.totalSynced}</span>
              </div>
              <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300 tabular-nums">
                {formatCents(summary?.syncedCents ?? 0)}
              </p>
            </div>
            <div className="flex flex-col gap-2 rounded-xl border border-border/60 bg-muted/40 p-4 shadow-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <XCircle className="h-4 w-4" />
                <span className="text-xs font-medium">{p.totalVoided}</span>
              </div>
              <p className="text-2xl font-bold text-muted-foreground tabular-nums">
                {formatCents(summary?.voidedCents ?? 0)}
              </p>
            </div>
          </div>
        )}

        {/* Bar Chart */}
        {!summaryQ.isPending && !summaryQ.isError && (
          <div className="rounded-xl border border-border/60 bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-foreground mb-3">{p.chartTitle}</p>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `₪${v}`}
                  />
                  <Tooltip
                    formatter={(value: number) => [`₪${value.toFixed(2)}`, ""]}
                    contentStyle={{
                      borderRadius: "8px",
                      border: "1px solid hsl(var(--border))",
                      background: "hsl(var(--card))",
                      color: "hsl(var(--foreground))",
                      fontSize: 12,
                    }}
                  />
                  <Bar dataKey="amount" fill="#6366f1" radius={[3, 3, 0, 0]} maxBarSize={20} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36 h-8 text-xs bg-card">
              <SelectValue placeholder={p.filterStatus} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{p.filter_all}</SelectItem>
              <SelectItem value="pending">{p.filter_pending}</SelectItem>
              <SelectItem value="synced">{p.filter_synced}</SelectItem>
              <SelectItem value="voided">{p.filter_voided}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(0); }}>
            <SelectTrigger className="w-36 h-8 text-xs bg-card">
              <SelectValue placeholder={p.filterType} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{p.type_all}</SelectItem>
              <SelectItem value="EQUIPMENT">{p.type_equipment}</SelectItem>
              <SelectItem value="CONSUMABLE">{p.type_consumable}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {ledgerQ.isPending ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-xl" />)}
          </div>
        ) : ledgerQ.isError ? (
          <ErrorCard message={p.loadError} onRetry={() => ledgerQ.refetch()} />
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center py-16 gap-3 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">{p.noEntries}</p>
          </div>
        ) : (
          <>
            <div className="rounded-xl border border-border/60 overflow-hidden shadow-sm">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b border-border/60">
                  <tr>
                    <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground">{p.colDate}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground">{p.colStatus}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground">{p.colAmount}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground">{p.colQty}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground">{p.colItem}</th>
                    <th className="text-right px-4 py-2.5 font-medium text-xs text-muted-foreground">{p.colPatient}</th>
                    {isAdmin && <th className="px-4 py-2.5 w-10" />}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {visibleEntries.map((entry) => (
                    <tr
                      key={entry.id}
                      className={`hover:bg-muted/30 transition-colors ${entry.status === "voided" ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(entry.createdAt).toLocaleDateString("he-IL")}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE[entry.status]}`}>
                          {STATUS_LABEL[entry.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums">
                        {formatCents(entry.totalAmountCents)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {entry.quantity}
                      </td>
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-xs font-mono truncate max-w-[120px]">{entry.itemId}</p>
                          <p className="text-xs text-muted-foreground">
                            {entry.itemType === "EQUIPMENT" ? p.type_equipment : p.type_consumable}
                          </p>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground truncate max-w-[100px]">
                        {entry.animalId}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3">
                          {entry.status !== "voided" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10 h-7 w-7 p-0"
                              onClick={() => setVoidTarget(entry)}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {hasMore && (
              <div className="flex justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                >
                  {p.loadMore}
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add charge dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{p.addCharge}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{p.fieldAnimalId}</Label>
              <Input
                value={form.animalId}
                onChange={(e) => setForm((f) => ({ ...f, animalId: e.target.value }))}
                placeholder={p.fieldAnimalIdPlaceholder}
              />
            </div>
            <div className="space-y-1">
              <Label>{p.fieldItemType}</Label>
              <Select
                value={form.itemType}
                onValueChange={(v) => setForm((f) => ({ ...f, itemType: v as "EQUIPMENT" | "CONSUMABLE" }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="EQUIPMENT">{p.type_equipment}</SelectItem>
                  <SelectItem value="CONSUMABLE">{p.type_consumable}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{p.fieldItemId}</Label>
              <Input
                value={form.itemId}
                onChange={(e) => setForm((f) => ({ ...f, itemId: e.target.value }))}
                placeholder={p.fieldItemIdPlaceholder}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>{p.colQty}</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.quantity}
                  onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1">
                <Label>{p.fieldUnitCents}</Label>
                <Input
                  type="number"
                  min={0}
                  value={form.unitPriceCents}
                  onChange={(e) => setForm((f) => ({ ...f, unitPriceCents: Number(e.target.value) }))}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>{p.cancel}</Button>
            <Button
              onClick={() => createMut.mutate()}
              disabled={createMut.isPending || !form.animalId || !form.itemId}
            >
              {createMut.isPending ? p.saving : p.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Void confirmation */}
      <AlertDialog open={!!voidTarget} onOpenChange={(o) => !o && setVoidTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{p.voidTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {p.voidDescription} {voidTarget ? formatCents(voidTarget.totalAmountCents) : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{p.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => voidTarget && voidMut.mutate(voidTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {p.voidConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
