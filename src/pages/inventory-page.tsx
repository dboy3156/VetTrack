import { t } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Package, Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useMemo, useState } from "react";
import type { InventoryContainer } from "@/types";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

export default function InventoryPage() {
  const qc = useQueryClient();
  const p = t.inventoryPage;

  const q = useQuery({
    queryKey: ["/api/containers"],
    queryFn: () => api.containers.list(),
  });

  const roomsQ = useQuery({
    queryKey: ["/api/rooms"],
    queryFn: api.rooms.list,
    staleTime: 60_000,
  });

  const roomNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of roomsQ.data ?? []) {
      m.set(r.id, r.name);
    }
    return m;
  }, [roomsQ.data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addedById, setAddedById] = useState<Record<string, number>>({});
  const [auditById, setAuditById] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!q.data?.length) {
      setSelectedId(null);
      return;
    }
    setSelectedId((prev) => {
      if (prev && q.data.some((c) => c.id === prev)) return prev;
      return q.data[0].id;
    });
  }, [q.data]);

  const selected = q.data?.find((c) => c.id === selectedId) ?? null;

  const setAdded = (id: string, value: number) => {
    const n = Math.max(0, Math.min(999, Math.round(value)));
    setAddedById((s) => ({ ...s, [id]: n }));
  };

  const restockMut = useMutation({
    mutationFn: ({ id, added }: { id: string; added: number }) => api.containers.restock(id, added),
    onSuccess: () => {
      navigator.vibrate?.([30, 20, 40]);
      toast.success(p.submitRestock);
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
    },
    onError: () => toast.error(p.loadError),
  });

  const auditMut = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => api.containers.blindAudit(id, count),
    onSuccess: () => {
      navigator.vibrate?.([25, 15, 25]);
      toast.success(p.submitAudit);
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
    },
    onError: () => toast.error(p.loadError),
  });

  const bootstrapMut = useMutation({
    mutationFn: () => api.containers.bootstrapDefaults(),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
      if (res.inserted > 0) {
        navigator.vibrate?.(40);
        toast.success(p.quickAddSuccess);
      } else toast(p.quickAddNothing);
    },
    onError: () => toast.error(p.loadError),
  });

  const billingHint = selected
    ? selected.roomId && roomNameById.get(selected.roomId)
      ? interpolateBilling(p.billingHint, roomNameById.get(selected.roomId)!)
      : p.billingHintNoRoom
    : "";

  return (
    <Layout title={p.title}>
      <Helmet>
        <title>{p.title} — VetTrack</title>
      </Helmet>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <Package className="w-7 h-7 text-primary shrink-0" aria-hidden />
            {p.title}
          </h1>
        </div>

        {q.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        )}

        {q.isError && <p className="text-destructive text-sm">{p.loadError}</p>}

        {q.data && q.data.length === 0 && !q.isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center gap-5 rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-12 text-center"
          >
            <p className="text-muted-foreground text-sm max-w-sm leading-relaxed">{p.empty}</p>
            <Button
              variant="default"
              size="lg"
              className="min-h-[48px] rounded-xl font-semibold"
              disabled={bootstrapMut.isPending}
              onClick={() => bootstrapMut.mutate()}
            >
              {bootstrapMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
              {p.quickAdd}
            </Button>
          </motion.div>
        )}

        {q.data && q.data.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {q.data.map((c: InventoryContainer) => {
              const isSel = selectedId === c.id;
              return (
                <motion.button
                  key={c.id}
                  type="button"
                  layout
                  onClick={() => setSelectedId(c.id)}
                  className={cn(
                    "text-right rounded-2xl border p-4 transition-all text-start w-full",
                    "hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    isSel
                      ? "border-primary bg-primary/5 shadow-md ring-1 ring-primary/20"
                      : "border-border bg-card"
                  )}
                >
                  <p className="font-semibold text-base leading-snug">{c.name}</p>
                  {c.department ? (
                    <p className="text-xs text-muted-foreground mt-1">{c.department}</p>
                  ) : null}
                  <p className="text-[11px] font-medium text-primary mt-2">
                    {isSel ? p.selected : p.tapToSelect}
                  </p>
                </motion.button>
              );
            })}
          </div>
        )}

        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <Card className="overflow-hidden border-border/80 shadow-sm">
                <CardContent className="p-5 space-y-5">
                  <div className="flex flex-wrap items-end justify-between gap-4">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {p.targetHeading}
                      </p>
                      <p className="text-4xl font-bold tabular-nums tracking-tight text-foreground mt-1">
                        {selected.targetQuantity}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        {p.current}:{" "}
                        <span className="font-semibold text-foreground">{selected.currentQuantity}</span>
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed border-s-2 border-primary/40 ps-3 py-1">
                    {billingHint}
                  </p>

                  <div className="space-y-2">
                    <p className="text-sm font-medium">{p.addedLabel}</p>
                    <div className="flex items-center justify-center gap-4">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-14 w-14 shrink-0 rounded-2xl border-2 text-xl"
                        aria-label={p.decreaseAdded}
                        onClick={() =>
                          setAdded(selected.id, (addedById[selected.id] ?? 0) - 1)
                        }
                      >
                        <Minus className="w-7 h-7" />
                      </Button>
                      <div className="flex flex-col items-center gap-1 min-w-[6rem]">
                        <span className="text-5xl font-bold tabular-nums leading-none tracking-tight">
                          {addedById[selected.id] ?? 0}
                        </span>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-14 w-14 shrink-0 rounded-2xl border-2 text-xl"
                        aria-label={p.increaseAdded}
                        onClick={() =>
                          setAdded(selected.id, (addedById[selected.id] ?? 0) + 1)
                        }
                      >
                        <Plus className="w-7 h-7" />
                      </Button>
                    </div>
                  </div>

                  <Button
                    className="w-full min-h-[48px] rounded-xl font-semibold text-base"
                    disabled={restockMut.isPending}
                    onClick={() => {
                      const n = addedById[selected.id] ?? 0;
                      restockMut.mutate({ id: selected.id, added: n });
                    }}
                  >
                    {restockMut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    {p.submitRestock}
                  </Button>

                  <div className="border-t border-border pt-5 space-y-3">
                    <p className="text-sm font-medium">{p.physicalCount}</p>
                    <div className="flex flex-wrap gap-2 items-center">
                      <Input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        className="max-w-[10rem] h-12 text-lg font-semibold"
                        value={auditById[selected.id] ?? ""}
                        onChange={(e) => setAuditById((s) => ({ ...s, [selected.id]: e.target.value }))}
                      />
                      <Button
                        variant="secondary"
                        className="h-12 rounded-xl font-semibold"
                        disabled={auditMut.isPending}
                        onClick={() => {
                          const n = parseInt(auditById[selected.id] ?? "", 10);
                          if (Number.isNaN(n) || n < 0) return;
                          auditMut.mutate({ id: selected.id, count: n });
                        }}
                      >
                        {auditMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        {p.submitAudit}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </Layout>
  );
}

function interpolateBilling(template: string, roomName: string): string {
  return template.replace(/\{roomName\}/g, roomName);
}
