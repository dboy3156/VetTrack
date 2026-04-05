import { useEffect, useRef, useState } from "react";
import { useListEquipment, useListFolders } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Link } from "wouter";
import { ArrowLeft, Printer, Check } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function PrintLabels() {
  const { data: equipment, isLoading } = useListEquipment();
  const { data: folders } = useListFolders();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current && equipment) {
      setSelected(new Set(equipment.map((e) => e.id)));
      initialized.current = true;
    }
  }, [equipment]);

  function toggleItem(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (!equipment) return;
    if (selected.size === equipment.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(equipment.map((e) => e.id)));
    }
  }

  function handlePrint() {
    window.print();
  }

  const selectedItems = equipment?.filter((e) => selected.has(e.id)) ?? [];

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-[200px] w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col gap-5 pb-10 print:hidden">
        <div>
          <Link href="/" className="inline-flex items-center text-base text-muted-foreground hover:text-foreground mb-4 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Link>
          <h1 className="text-3xl font-bold text-foreground tracking-tight">Print QR Labels</h1>
          <p className="text-base text-muted-foreground mt-0.5">
            Select equipment to include, then print.
          </p>
        </div>

        <div className="flex items-center justify-between gap-4">
          <button
            onClick={toggleAll}
            className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
          >
            {selected.size === equipment?.length ? "Deselect All" : "Select All"}
          </button>
          <span className="text-sm text-muted-foreground">
            {selected.size} of {equipment?.length ?? 0} selected
          </span>
        </div>

        <div className="flex flex-col gap-2">
          {equipment?.map((item) => {
            const isSelected = selected.has(item.id);
            const folderName = folders?.find((f) => f.id === item.folderId)?.name;
            return (
              <button
                key={item.id}
                onClick={() => toggleItem(item.id)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                  isSelected
                    ? "bg-primary/10 border-primary/40"
                    : "bg-card border-border hover:border-primary/20"
                }`}
              >
                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                  isSelected ? "bg-primary border-primary" : "border-muted-foreground/40"
                }`}>
                  {isSelected && <Check className="w-3.5 h-3.5 text-primary-foreground" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-base text-foreground truncate">{item.name}</p>
                  <p className="text-sm text-muted-foreground truncate font-mono">{item.id}</p>
                </div>
                {folderName && (
                  <span className="text-sm text-muted-foreground shrink-0">{folderName}</span>
                )}
              </button>
            );
          })}
        </div>

        {selectedItems.length > 0 && (
          <button
            onClick={handlePrint}
            className="sticky bottom-6 mx-auto flex items-center gap-2.5 h-14 px-6 rounded-full bg-primary text-primary-foreground shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all font-semibold text-base z-40"
          >
            <Printer className="w-5 h-5" />
            Print {selectedItems.length} Label{selectedItems.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      <div className="hidden print:block">
        <div className="print-label-grid">
          {selectedItems.map((item) => (
            <div key={item.id} className="print-label">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(item.id)}`}
                alt={`QR code for ${item.name}`}
                className="print-label-qr"
              />
              <div className="print-label-info">
                <div className="print-label-name">{item.name}</div>
                <div className="print-label-id">{item.id}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
