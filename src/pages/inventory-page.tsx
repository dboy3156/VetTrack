import { t } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Warehouse, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import type { InventoryContainer } from "@/types";

export default function InventoryPage() {
  const qc = useQueryClient();
  const p = t.inventoryPage;
  const q = useQuery({
    queryKey: ["/api/containers"],
    queryFn: () => api.containers.list(),
  });

  const [restockById, setRestockById] = useState<Record<string, string>>({});
  const [auditById, setAuditById] = useState<Record<string, string>>({});

  const restockMut = useMutation({
    mutationFn: ({ id, added }: { id: string; added: number }) => api.containers.restock(id, added),
    onSuccess: () => {
      toast.success(p.submitRestock);
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
    },
    onError: () => toast.error(p.loadError),
  });

  const auditMut = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => api.containers.blindAudit(id, count),
    onSuccess: () => {
      toast.success(p.submitAudit);
      qc.invalidateQueries({ queryKey: ["/api/containers"] });
    },
    onError: () => toast.error(p.loadError),
  });

  return (
    <Layout title={p.title}>
      <Helmet>
        <title>{p.title} — VetTrack</title>
      </Helmet>
      <div className="max-w-3xl mx-auto p-4 space-y-4">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Warehouse className="w-7 h-7" aria-hidden />
          {p.title}
        </h1>

        {q.isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        )}

        {q.isError && <p className="text-destructive">{p.loadError}</p>}

        {q.data?.map((c: InventoryContainer) => (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{c.name}</CardTitle>
              {c.department ? <p className="text-xs text-muted-foreground">{c.department}</p> : null}
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <p>
                {p.target}: {c.targetQuantity} · {p.current}: {c.currentQuantity}
              </p>
              <div className="flex flex-wrap gap-2 items-end">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">{p.addedLabel}</label>
                  <Input
                    type="number"
                    min={0}
                    className="w-28 h-11"
                    value={restockById[c.id] ?? ""}
                    onChange={(e) => setRestockById((s) => ({ ...s, [c.id]: e.target.value }))}
                  />
                </div>
                <Button
                  size="sm"
                  className="h-11"
                  disabled={restockMut.isPending}
                  onClick={() => {
                    const n = parseInt(restockById[c.id] ?? "0", 10);
                    if (Number.isNaN(n) || n < 0) return;
                    restockMut.mutate({ id: c.id, added: n });
                  }}
                >
                  {restockMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {p.submitRestock}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2 items-end border-t pt-3">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-muted-foreground">{p.physicalCount}</label>
                  <Input
                    type="number"
                    min={0}
                    className="w-28 h-11"
                    value={auditById[c.id] ?? ""}
                    onChange={(e) => setAuditById((s) => ({ ...s, [c.id]: e.target.value }))}
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-11"
                  disabled={auditMut.isPending}
                  onClick={() => {
                    const n = parseInt(auditById[c.id] ?? "", 10);
                    if (Number.isNaN(n) || n < 0) return;
                    auditMut.mutate({ id: c.id, count: n });
                  }}
                >
                  {auditMut.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {p.submitAudit}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {q.data && q.data.length === 0 && !q.isLoading && (
          <p className="text-muted-foreground text-sm">{p.empty}</p>
        )}
      </div>
    </Layout>
  );
}
