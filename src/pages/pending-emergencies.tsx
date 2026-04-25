import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function formatDateTime(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatIls(cents: number): string {
  return (cents / 100).toLocaleString("he-IL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface PendingItem {
  id: string;
  containerId: string;
  itemName: string;
  quantity: number;
  dispensedAt: string;
  unitPriceCents: number;
}

interface AnimalOption {
  animalId: string;
  animalName: string;
}

function AnimalSelector({
  animals,
  value,
  onChange,
}: {
  animals: AnimalOption[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return animals;
    return animals.filter((a) => a.animalName.toLowerCase().includes(q));
  }, [animals, search]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="חפש מטופל..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-8 text-sm"
        />
      </div>
      <div className="max-h-40 overflow-y-auto rounded border text-sm divide-y">
        {filtered.length === 0 ? (
          <p className="px-3 py-2 text-muted-foreground text-center">לא נמצאו מטופלים</p>
        ) : (
          filtered.map((a) => (
            <button
              key={a.animalId}
              type="button"
              className={cn(
                "w-full text-right px-3 py-2 hover:bg-muted transition-colors",
                value === a.animalId ? "bg-primary/10 font-semibold text-primary" : "",
              )}
              onClick={() => onChange(a.animalId)}
            >
              {a.animalName}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

interface ReconcileRowProps {
  item: PendingItem;
  animals: AnimalOption[];
  onReconciled: (id: string) => void;
}

function ReconcileRow({ item, animals, onReconciled }: ReconcileRowProps) {
  const [selectedAnimalId, setSelectedAnimalId] = useState("");
  const [reconciled, setReconciled] = useState(false);

  const qc = useQueryClient();

  const reconcileMut = useMutation({
    mutationFn: () =>
      api.shiftHandover.reconcileEmergency(item.id, {
        animalId: selectedAnimalId,
        quantity: item.quantity,
      }),
    onSuccess: () => {
      setReconciled(true);
      toast.success("הפריט יוחס ונוסף לחשבון בהצלחה");
      qc.invalidateQueries({ queryKey: ["/api/shift-handover/pending-emergencies"] });
      onReconciled(item.id);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "";
      toast.error(`שגיאה ביחוס: ${msg || "אנא נסה שנית"}`);
    },
  });

  const estimatedCost = (item.unitPriceCents * item.quantity) / 100;

  if (reconciled) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-4">
        <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
        <span className="text-sm font-medium text-green-800 dark:text-green-300">
          {item.itemName} — יוחס בהצלחה
        </span>
      </div>
    );
  }

  return (
    <Card className="border border-red-200 dark:border-red-900/50">
      <CardContent className="p-4 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <p className="font-bold text-base">{item.itemName}</p>
            <p className="text-sm text-muted-foreground">
              כמות: <span className="font-medium tabular-nums">{item.quantity}</span>
              {" · "}
              {formatDateTime(item.dispensedAt)}
            </p>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400 tabular-nums">
              עלות משוערת: ₪{formatIls(estimatedCost)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-800 font-medium shrink-0">
            <AlertTriangle className="w-3 h-3" aria-hidden />
            חירום — ממתין
          </span>
        </div>

        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">שייך למטופל:</p>
          <AnimalSelector
            animals={animals}
            value={selectedAnimalId}
            onChange={setSelectedAnimalId}
          />
        </div>

        <Button
          className="w-full min-h-[44px] bg-red-600 hover:bg-red-700 text-white font-bold"
          disabled={!selectedAnimalId || reconcileMut.isPending}
          onClick={() => reconcileMut.mutate()}
        >
          {reconcileMut.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            "יחס וחייב"
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PendingEmergenciesPage() {
  const [reconciledIds, setReconciledIds] = useState<Set<string>>(new Set());

  const emergenciesQ = useQuery({
    queryKey: ["/api/shift-handover/pending-emergencies"],
    queryFn: () => api.shiftHandover.getPendingEmergencies(),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const animalsQ = useQuery({
    queryKey: ["/api/animals/active"],
    queryFn: () => api.animals.active(),
    retry: false,
    refetchOnWindowFocus: false,
    staleTime: 60_000,
  });

  const handleReconciled = (id: string) => {
    setReconciledIds((prev) => new Set([...prev, id]));
  };

  const items = emergenciesQ.data?.items ?? [];
  const animals: AnimalOption[] = (animalsQ.data?.animals ?? []).map((a) => ({
    animalId: a.animalId,
    animalName: a.animalName,
  }));

  const pendingItems = items.filter((it) => !reconciledIds.has(it.id));
  const allDone = items.length > 0 && pendingItems.length === 0;

  return (
    <Layout title="פריטי חירום ממתינים">
      <Helmet>
        <title>פריטי Code Blue ממתינים — VetTrack</title>
      </Helmet>

      <div className="max-w-2xl mx-auto p-4 space-y-4" dir="rtl">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2 tracking-tight">
            <AlertTriangle className="w-7 h-7 text-red-500 shrink-0" aria-hidden />
            פריטי Code Blue ממתינים
          </h1>
          <p className="text-muted-foreground text-sm mt-1 leading-relaxed">
            פריטים שנלקחו בחירום לפני רישום המטופל. יש ליחס כל פריט למטופל ולאשר חיוב.
          </p>
        </div>

        {emergenciesQ.isLoading && (
          <div className="space-y-3" role="status" aria-live="polite" aria-busy="true">
            <span className="sr-only">טוען...</span>
            <Skeleton className="h-32 w-full rounded-xl" />
            <Skeleton className="h-32 w-full rounded-xl" />
          </div>
        )}

        {emergenciesQ.isError && (
          <Card className="border-destructive/50 rounded-xl">
            <CardContent className="pt-6 text-destructive">שגיאה בטעינת הנתונים</CardContent>
          </Card>
        )}

        {emergenciesQ.data && items.length === 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-6 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
            <p className="font-semibold text-green-800 dark:text-green-300">אין פריטי חירום ממתינים</p>
            <p className="text-sm text-muted-foreground">כל פריטי החירום יוחסו בהצלחה.</p>
          </div>
        )}

        {allDone && items.length > 0 && (
          <div className="rounded-xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-6 text-center space-y-2">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto" />
            <p className="font-semibold text-green-800 dark:text-green-300">כל הפריטים יוחסו!</p>
            <p className="text-sm text-muted-foreground">כל פריטי החירום בדף זה טופלו.</p>
          </div>
        )}

        {pendingItems.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {pendingItems.length} פריט{pendingItems.length !== 1 ? "ים" : ""} ממתינ{pendingItems.length !== 1 ? "ים" : ""} ליחוס
            </p>
            {pendingItems.map((item) => (
              <ReconcileRow
                key={item.id}
                item={item}
                animals={animals}
                onReconciled={handleReconciled}
              />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
