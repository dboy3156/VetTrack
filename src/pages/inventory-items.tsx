import { t } from "@/lib/i18n";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import { toast } from "sonner";
import { useState, useMemo } from "react";
import type { InventoryItem } from "@/types";
import { useAuth } from "@/hooks/use-auth";
import { Archive, Plus, Pencil, Trash2 } from "lucide-react";

type FormState = { code: string; label: string; category: string; nfcTagId: string };
const BLANK: FormState = { code: "", label: "", category: "", nfcTagId: "" };

export default function InventoryItemsPage() {
  const qc = useQueryClient();
  const p = t.inventoryItemsPage;
  const { userId, role } = useAuth();
  const isAdmin = role === "admin";

  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<InventoryItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);

  const itemsQ = useQuery({
    queryKey: ["/api/inventory-items"],
    queryFn: () => api.inventoryItems.list(),
    enabled: !!userId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return (itemsQ.data ?? []).filter(
      (item) => item.label.toLowerCase().includes(q) || item.code.toLowerCase().includes(q),
    );
  }, [itemsQ.data, search]);

  function openCreate() {
    setEditTarget(null);
    setForm(BLANK);
    setFormOpen(true);
  }

  function openEdit(item: InventoryItem) {
    setEditTarget(item);
    setForm({ code: item.code, label: item.label, category: item.category ?? "", nfcTagId: item.nfcTagId ?? "" });
    setFormOpen(true);
  }

  const createMut = useMutation({
    mutationFn: () =>
      api.inventoryItems.create({
        code: form.code.trim(),
        label: form.label.trim(),
        category: form.category.trim() || undefined,
        nfcTagId: form.nfcTagId.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(p.itemCreated);
      qc.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      setFormOpen(false);
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("409") || msg.includes("CODE_EXISTS")) toast.error(p.codeExists);
      else toast.error(p.itemCreateFailed);
    },
  });

  const updateMut = useMutation({
    mutationFn: () =>
      api.inventoryItems.update(editTarget!.id, {
        label: form.label.trim(),
        category: form.category.trim() || null,
        nfcTagId: form.nfcTagId.trim() || null,
      }),
    onSuccess: () => {
      toast.success(p.itemUpdated);
      qc.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      setFormOpen(false);
    },
    onError: () => toast.error(p.itemUpdateFailed),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.inventoryItems.delete(id),
    onSuccess: () => {
      toast.success(p.itemDeleted);
      qc.invalidateQueries({ queryKey: ["/api/inventory-items"] });
      setDeleteTarget(null);
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? "";
      if (msg.includes("409") || msg.includes("ITEM_IN_USE")) toast.error(p.itemInUse);
      else toast.error(p.itemDeleteFailed);
    },
  });

  const isPending = editTarget ? updateMut.isPending : createMut.isPending;

  function handleSave() {
    if (editTarget) updateMut.mutate();
    else createMut.mutate();
  }

  return (
    <Layout>
      <Helmet><title>{p.title} — VetTrack</title></Helmet>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">{p.title}</h1>
          </div>
          {isAdmin && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-4 w-4 mr-1" />
              {p.newItem}
            </Button>
          )}
        </div>

        <Input
          placeholder={p.searchPlaceholder}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />

        {itemsQ.isPending ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">{p.noItems}</p>
        ) : (
          <div className="rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{p.colCode}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colLabel}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colCategory}</th>
                  <th className="text-left px-4 py-2 font-medium">{p.colNfc}</th>
                  {isAdmin && <th className="px-4 py-2 w-20" />}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-2 font-mono text-xs">{item.code}</td>
                    <td className="px-4 py-2">{item.label}</td>
                    <td className="px-4 py-2 text-muted-foreground">{item.category ?? "—"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.nfcTagId ?? "—"}</td>
                    {isAdmin && (
                      <td className="px-4 py-2">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => openEdit(item)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit dialog */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? p.editItem : p.newItem}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>{p.fieldCode}</Label>
              <Input
                value={form.code}
                onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                disabled={!!editTarget}
                placeholder="IV_16G_CATHETER"
              />
            </div>
            <div className="space-y-1">
              <Label>{p.fieldLabel}</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder={p.fieldLabelPlaceholder}
              />
            </div>
            <div className="space-y-1">
              <Label>{p.fieldCategory}</Label>
              <Input
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder={p.fieldCategoryPlaceholder}
              />
            </div>
            <div className="space-y-1">
              <Label>{p.fieldNfc}</Label>
              <Input
                value={form.nfcTagId}
                onChange={(e) => setForm((f) => ({ ...f, nfcTagId: e.target.value }))}
                placeholder={p.fieldNfcPlaceholder}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>{p.cancel}</Button>
            <Button
              onClick={handleSave}
              disabled={isPending || !form.label}
            >
              {isPending ? p.saving : p.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{p.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {p.deleteDescription} <strong>{deleteTarget?.label}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{p.cancel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {p.deleteConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}
