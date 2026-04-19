import { t } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { useState } from "react";
import type { BillingLedgerEntry } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { Receipt, Plus, Ban } from "lucide-react";

const STATUS_BADGE: Record<BillingLedgerEntry["status"], string> = {
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  synced: "bg-emerald-100 text-emerald-800 border-emerald-200",
  voided: "bg-slate-100 text-slate-500 border-slate-200 line-through",
};

function formatCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BillingLedgerPage() {
  const qc = useQueryClient();
  const p = t.billingLedger;
  const { userId, role } = useAuth();
  const isAdmin = role === "admin";

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<BillingLedgerEntry | null>(null);

  const [form, setForm] = useState({
    animalId: "",
    itemType: "CONSUMABLE" as "EQUIPMENT" | "CONSUMABLE",
    itemId: "",
    quantity: 1,
    unitPriceCents: 0,
  });

  const ledgerQ = useQuery({
    queryKey: ["/api/billing", statusFilter],
    queryFn: () => api.billing.list(statusFilter !== "all" ? { status: statusFilter } : undefined),
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

  const entries = ledgerQ.data ?? [];
  const totalPending = entries.filter((e) => e.status === "pending").reduce((s, e) => s + e.totalAmountCents, 0);
  const totalSynced = entries.filter((e) => e.status === "synced").reduce((s, e) => s + e.totalAmountCents, 0);

  return (
    <Layout>
      <Helmet><title>{p.title} — VetTrack</title></Helmet>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{p.title}</h1>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4 mr-1" />
              {p.addCharge}
            </Button>
          )}
        </div>

        {/* Totals summary */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{p.totalPending}</p>
            <p className="text-lg font-semibold text-amber-700">{formatCents(totalPending)}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{p.totalSynced}</p>
            <p className="text-lg font-semibold text-emerald-700">{formatCents(totalSynced)}</p>
          </div>
        </div>

        {/* Status filter */}
        <div className="flex gap-2">
          {["all", "pending", "synced", "voided"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {p[`filter_${s}` as keyof typeof p] ?? s}
            </button>
          ))}
        </div>

        {/* Table */}
        {ledgerQ.isPending ? (
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : entries.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">{p.noEntries}</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{p.colAnimal}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colType}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colQty}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colUnit}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colTotal}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colStatus}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colDate}</th>
                  {isAdmin && <th className="px-4 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {entries.map((entry) => (
                  <tr key={entry.id} className={entry.status === "voided" ? "opacity-50" : ""}>
                    <td className="px-4 py-2 font-mono text-xs truncate max-w-[100px]">{entry.animalId}</td>
                    <td className="px-4 py-2">{entry.itemType}</td>
                    <td className="px-4 py-2">{entry.quantity}</td>
                    <td className="px-4 py-2">{formatCents(entry.unitPriceCents)}</td>
                    <td className="px-4 py-2 font-medium">{formatCents(entry.totalAmountCents)}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_BADGE[entry.status]}`}>
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {new Date(entry.createdAt).toLocaleDateString()}
                    </td>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        {entry.status !== "voided" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive h-7 px-2"
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
                  <SelectItem value="EQUIPMENT">EQUIPMENT</SelectItem>
                  <SelectItem value="CONSUMABLE">CONSUMABLE</SelectItem>
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
                <Label>{p.fieldQty}</Label>
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
