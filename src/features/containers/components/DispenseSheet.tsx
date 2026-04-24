import { useState, useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertTriangle,
  CheckCircle,
  XCircle,
  Loader2,
  Minus,
  Plus,
  ChevronRight,
} from "lucide-react";
import type { InventoryContainerWithItems, Appointment } from "@/types";

interface DispenseSheetProps {
  containerId: string;
  isOpen: boolean;
  onClose: () => void;
  /** If provided, opens directly in STATE 4 (emergency complete) */
  emergencyEventId?: string;
}

type SheetState = "items" | "patient" | "confirm" | "success" | "emergency-success" | "emergency-complete";

interface ItemSelection {
  itemId: string;
  quantity: number;
}

interface DispenseSuccessData {
  takenBy: { userId: string; displayName: string };
  takenAt: string;
  dispensed?: Array<{ itemId: string; label: string; quantity: number; newStock: number }>;
  emergencyEventId?: string;
  isEmergency: boolean;
}

function formatTimeHHMM(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" });
}

export function DispenseSheet({ containerId, isOpen, onClose, emergencyEventId }: DispenseSheetProps) {
  const qc = useQueryClient();

  const [sheetState, setSheetState] = useState<SheetState>(emergencyEventId ? "emergency-complete" : "items");
  const [selections, setSelections] = useState<Map<string, number>>(new Map());
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null | undefined>(undefined);
  const [successData, setSuccessData] = useState<DispenseSuccessData | null>(null);
  const [emergencyLoading, setEmergencyLoading] = useState(false);
  const [completedEventId, setCompletedEventId] = useState<string | undefined>(emergencyEventId);

  // Reset state when sheet opens/closes
  useEffect(() => {
    if (isOpen) {
      if (emergencyEventId) {
        setSheetState("emergency-complete");
        setCompletedEventId(emergencyEventId);
      } else {
        setSheetState("items");
      }
      setSelections(new Map());
      setSelectedAnimalId(undefined);
      setSuccessData(null);
    }
  }, [isOpen, emergencyEventId]);

  // Fetch container with items via restock containerItems (provides live quantities)
  const containerItemsQ = useQuery({
    queryKey: ["/api/containers/detail", containerId],
    queryFn: async (): Promise<InventoryContainerWithItems> => {
      const view = await api.restock.containerItems(containerId);
      const itemsWithIds = view.lines.map((l) => ({
        id: l.itemId ?? "",
        itemId: l.itemId ?? "",
        quantity: l.actual,
        label: l.label,
        code: l.code,
      }));
      return {
        ...view.container,
        items: itemsWithIds,
      };
    },
    enabled: isOpen,
    staleTime: 30_000,
    retry: false,
  });

  // Fetch today's appointments to get active patients
  const today = new Date().toISOString().slice(0, 10);
  const appointmentsQ = useQuery({
    queryKey: ["/api/appointments", today],
    queryFn: () => api.appointments.list({ day: today }),
    enabled: isOpen,
    staleTime: 60_000,
    retry: false,
  });

  // Unique animals from today's appointments
  const activePatients = (() => {
    if (!appointmentsQ.data) return [];
    const seen = new Set<string>();
    const patients: Array<{ animalId: string; animalName: string; species?: string | null }> = [];
    for (const appt of appointmentsQ.data as Appointment[]) {
      if (appt.animalId && !seen.has(appt.animalId)) {
        seen.add(appt.animalId);
        patients.push({
          animalId: appt.animalId,
          animalName: (appt as unknown as { animalName?: string }).animalName ?? appt.animalId,
          species: (appt as unknown as { species?: string }).species,
        });
      }
    }
    return patients;
  })();

  const dispenseMut = useMutation({
    mutationFn: (data: { items: Array<{ itemId: string; quantity: number }>; animalId?: string | null; isEmergency?: boolean }) =>
      api.containers.dispense(containerId, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/containers/detail", containerId] });
      qc.invalidateQueries({ queryKey: ["/api/shift-handover"] });
      setSuccessData({
        takenBy: result.takenBy,
        takenAt: result.takenAt,
        dispensed: result.dispensed,
        emergencyEventId: result.emergencyEventId,
        isEmergency: Boolean(result.emergencyEventId),
      });
      setSheetState(result.emergencyEventId ? "emergency-success" : "success");
    },
    onError: (err: unknown) => {
      const e = err as { message?: string };
      if (e.message?.includes("INSUFFICIENT_STOCK")) {
        setSheetState("items");
        toast.error("מלאי לא מספיק לפריט המבוקש");
      } else {
        toast.error("שגיאה בשרת — נסה שוב");
      }
    },
  });

  const completeEmergencyMut = useMutation({
    mutationFn: (data: { items: Array<{ itemId: string; quantity: number }>; animalId?: string | null }) =>
      api.containers.completeEmergency(completedEventId!, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["/api/containers/detail", containerId] });
      qc.invalidateQueries({ queryKey: ["/api/shift-handover"] });
      setSuccessData({
        takenBy: result.takenBy,
        takenAt: result.takenAt,
        dispensed: result.dispensed,
        isEmergency: true,
      });
      setSheetState("success");
    },
    onError: () => {
      toast.error("שגיאה בשרת — נסה שוב");
    },
  });

  // Auto-close normal success after 3 seconds
  useEffect(() => {
    if (sheetState === "success") {
      const timer = setTimeout(() => onClose(), 3000);
      return () => clearTimeout(timer);
    }
  }, [sheetState, onClose]);

  const handleEmergencyTap = useCallback(async () => {
    setEmergencyLoading(true);
    try {
      await dispenseMut.mutateAsync({ items: [], animalId: null, isEmergency: true });
    } finally {
      setEmergencyLoading(false);
    }
  }, [dispenseMut]);

  const updateQuantity = useCallback((itemId: string, delta: number, maxQty: number) => {
    setSelections((prev) => {
      const next = new Map(prev);
      const current = next.get(itemId) ?? 0;
      const newVal = Math.max(0, Math.min(maxQty, current + delta));
      if (newVal === 0) {
        next.delete(itemId);
      } else {
        next.set(itemId, newVal);
      }
      return next;
    });
  }, []);

  const totalSelected = [...selections.values()].reduce((sum, q) => sum + q, 0);
  const selectedItems: ItemSelection[] = [...selections.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));

  const container = containerItemsQ.data;
  const items = container?.items ?? [];

  const renderDragHandle = () => (
    <div className="flex justify-center pt-3 pb-1">
      <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
    </div>
  );

  // STATE: EMERGENCY COMPLETE (STATE 4)
  if (sheetState === "emergency-complete") {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[90vh] overflow-y-auto p-0 rounded-t-2xl">
          {renderDragHandle()}
          <div className="px-4 pb-6 space-y-4">
            <SheetHeader>
              <SheetTitle className="text-xl text-right">השלמת חירום</SheetTitle>
              <p className="text-sm text-muted-foreground text-right">פרט את הפריטים שנלקחו בחירום</p>
            </SheetHeader>

            {containerItemsQ.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  {items.map((item) => {
                    const qty = selections.get(item.itemId) ?? 0;
                    return (
                      <div key={item.itemId} className="flex items-center justify-between gap-3 py-2 border-b border-border/50">
                        <div className="flex-1 text-right">
                          <span className="text-base font-medium">{item.label}</span>
                          <span className="text-xs text-muted-foreground mr-2">({item.quantity} במלאי)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => updateQuantity(item.itemId, -1, item.quantity)}
                            disabled={qty === 0}
                            className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center disabled:opacity-30"
                            aria-label="הפחת"
                          >
                            <Minus className="w-5 h-5" />
                          </button>
                          <span className="w-8 text-center text-lg font-bold tabular-nums">{qty}</span>
                          <button
                            onClick={() => updateQuantity(item.itemId, 1, item.quantity)}
                            disabled={qty >= item.quantity}
                            className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30"
                            aria-label="הוסף"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Patient selection for emergency complete */}
                <div className="space-y-2">
                  <p className="text-sm font-medium text-right">שייך למטופל (אופציונלי)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {activePatients.map((p) => (
                      <button
                        key={p.animalId}
                        onClick={() => setSelectedAnimalId(p.animalId)}
                        className={cn(
                          "p-3 rounded-xl border text-right min-h-[80px] transition-colors",
                          selectedAnimalId === p.animalId
                            ? "border-primary bg-primary/10"
                            : "border-border bg-background",
                        )}
                      >
                        <div className="font-semibold text-sm">{p.animalName}</div>
                        {p.species && <div className="text-xs text-muted-foreground">{p.species}</div>}
                        {selectedAnimalId === p.animalId && (
                          <CheckCircle className="w-4 h-4 text-primary mt-1" />
                        )}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setSelectedAnimalId(null)}
                    className={cn(
                      "w-full py-3 px-4 rounded-xl border text-sm text-right transition-colors min-h-[48px]",
                      selectedAnimalId === null ? "border-primary bg-primary/10" : "border-border",
                    )}
                  >
                    ללא שיוך למטופל
                  </button>
                </div>

                <div className="sticky bottom-0 bg-background pt-2 pb-2 space-y-2">
                  <Button
                    className="w-full min-h-[52px] text-lg font-bold rounded-xl"
                    disabled={totalSelected === 0 || selectedAnimalId === undefined || completeEmergencyMut.isPending}
                    onClick={() => completeEmergencyMut.mutate({ items: selectedItems, animalId: selectedAnimalId })}
                  >
                    {completeEmergencyMut.isPending ? (
                      <Loader2 className="w-5 h-5 animate-spin mr-2" />
                    ) : null}
                    אשר פירוט חירום
                  </Button>
                  <button onClick={onClose} className="w-full text-sm text-muted-foreground py-2 min-h-[44px]">
                    ביטול
                  </button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // STATE: SUCCESS
  if (sheetState === "success") {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[90vh] overflow-y-auto p-0 rounded-t-2xl">
          {renderDragHandle()}
          <div className="px-4 pb-8 flex flex-col items-center text-center space-y-4">
            <CheckCircle className="w-20 h-20 text-green-500 mt-4" />
            <SheetTitle className="text-2xl font-bold">
              {successData?.isEmergency ? "עודכן בהצלחה" : "נלקח בהצלחה"}
            </SheetTitle>
            {successData && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p>על ידי: {successData.takenBy.displayName}</p>
                <p>בשעה: {formatTimeHHMM(successData.takenAt)}</p>
                {successData.dispensed && successData.dispensed.length > 0 && (
                  <ul className="mt-2 text-right space-y-1">
                    {successData.dispensed.map((d) => (
                      <li key={d.itemId}>
                        {d.label} × {d.quantity}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">נסגר אוטומטית בעוד שניות...</p>
            <Button variant="outline" onClick={onClose} className="min-h-[48px] w-full rounded-xl">
              סגור
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // STATE: EMERGENCY SUCCESS
  if (sheetState === "emergency-success") {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[90vh] overflow-y-auto p-0 rounded-t-2xl">
          {renderDragHandle()}
          <div className="px-4 pb-8 flex flex-col items-center text-center space-y-4">
            <XCircle className="w-20 h-20 text-red-500 mt-4" />
            <SheetTitle className="text-2xl font-bold text-red-700">חירום נרשם</SheetTitle>
            {successData && (
              <div className="text-sm text-muted-foreground space-y-1">
                <p className="font-medium">{successData.takenBy.displayName} — {formatTimeHHMM(successData.takenAt)}</p>
              </div>
            )}
            <Button
              variant="outline"
              className="w-full min-h-[52px] rounded-xl border-red-300 text-red-700"
              onClick={() => {
                setCompletedEventId(successData?.emergencyEventId);
                setSheetState("emergency-complete");
              }}
            >
              השלם פירוט אחרי הטיפול
            </Button>
            <button
              onClick={onClose}
              className="text-sm text-muted-foreground py-2 min-h-[44px]"
            >
              סגור לעכשיו
            </button>
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // STATE: CONFIRM (patient selection — STATE 2)
  if (sheetState === "confirm") {
    return (
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="bottom" dir="rtl" className="max-h-[90vh] overflow-y-auto p-0 rounded-t-2xl">
          {renderDragHandle()}
          <div className="px-4 pb-6 space-y-4">
            <SheetHeader>
              <SheetTitle className="text-xl text-right">למי שייך?</SheetTitle>
              <p className="text-sm text-muted-foreground text-right">בחר מטופל או השאר ללא שיוך</p>
            </SheetHeader>

            {appointmentsQ.isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  {activePatients.map((p) => (
                    <button
                      key={p.animalId}
                      onClick={() => setSelectedAnimalId(p.animalId)}
                      className={cn(
                        "p-3 rounded-xl border text-right min-h-[80px] transition-colors",
                        selectedAnimalId === p.animalId
                          ? "border-primary bg-primary/10"
                          : "border-border bg-background",
                      )}
                    >
                      <div className="font-semibold text-sm">{p.animalName}</div>
                      {p.species && <div className="text-xs text-muted-foreground">{p.species}</div>}
                      {selectedAnimalId === p.animalId && (
                        <CheckCircle className="w-4 h-4 text-primary mt-1" />
                      )}
                    </button>
                  ))}
                  {activePatients.length === 0 && (
                    <div className="col-span-2 text-center text-sm text-muted-foreground py-4">
                      אין מטופלים פעילים היום
                    </div>
                  )}
                </div>

                <button
                  onClick={() => setSelectedAnimalId(null)}
                  className={cn(
                    "w-full py-3 px-4 rounded-xl border text-sm text-right transition-colors min-h-[48px]",
                    selectedAnimalId === null ? "border-primary bg-primary/10 font-medium" : "border-border",
                  )}
                >
                  ללא שיוך למטופל
                </button>

                <div className="sticky bottom-0 bg-background pt-2 pb-2 space-y-2">
                  <Button
                    className="w-full min-h-[52px] text-lg font-bold rounded-xl"
                    disabled={selectedAnimalId === undefined || dispenseMut.isPending}
                    onClick={() =>
                      dispenseMut.mutate({
                        items: selectedItems,
                        animalId: selectedAnimalId,
                        isEmergency: false,
                      })
                    }
                  >
                    {dispenseMut.isPending ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                    אשר לקיחה
                  </Button>
                  <button
                    onClick={() => {
                      setSelectedAnimalId(undefined);
                      setSheetState("items");
                    }}
                    className="w-full text-sm text-muted-foreground py-2 min-h-[44px]"
                  >
                    חזור
                  </button>
                </div>
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  // STATE: ITEMS (STATE 0 + STATE 1 — emergency button + item list)
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" dir="rtl" className="max-h-[90vh] overflow-y-auto p-0 rounded-t-2xl">
        {renderDragHandle()}
        <div className="px-4 pb-6 space-y-4">
          <SheetHeader>
            <SheetTitle className="text-xl text-right">
              {container?.name ?? "טוען..."}
            </SheetTitle>
          </SheetHeader>

          {/* STATE 0: Emergency button — always at top, always visible */}
          <button
            onClick={handleEmergencyTap}
            disabled={emergencyLoading}
            className="w-full min-h-[64px] rounded-xl bg-red-600 text-white text-xl font-bold flex items-center justify-center gap-3 active:bg-red-700 disabled:opacity-70"
          >
            {emergencyLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <AlertTriangle className="w-6 h-6" />
            )}
            🚨 חירום
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">או בחר פריטים</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* STATE 1: Item list */}
          {containerItemsQ.isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1">
              {items.map((item) => {
                const qty = selections.get(item.itemId) ?? 0;
                return (
                  <div key={item.itemId} className="flex items-center justify-between gap-3 py-2 border-b border-border/50">
                    <div className="flex-1 text-right">
                      <span className="text-base font-medium">{item.label}</span>
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs bg-muted text-muted-foreground">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(item.itemId, -1, item.quantity)}
                        disabled={qty === 0}
                        className="w-12 h-12 rounded-xl bg-muted flex items-center justify-center disabled:opacity-30"
                        aria-label="הפחת"
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                      <span className="w-8 text-center text-lg font-bold tabular-nums">{qty}</span>
                      <button
                        onClick={() => updateQuantity(item.itemId, 1, item.quantity)}
                        disabled={qty >= item.quantity}
                        className="w-12 h-12 rounded-xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-30"
                        aria-label="הוסף"
                      >
                        <Plus className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              {items.length === 0 && !containerItemsQ.isLoading && (
                <p className="text-center text-sm text-muted-foreground py-4">אין פריטים במכלול זה</p>
              )}
            </div>
          )}

          {/* Sticky bottom bar */}
          <div className="sticky bottom-0 bg-background pt-2 pb-2 space-y-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
              <span>{totalSelected} פריטים נבחרו</span>
              <ChevronRight className="w-4 h-4" />
            </div>
            <Button
              className="w-full min-h-[52px] text-lg font-bold rounded-xl"
              disabled={totalSelected === 0}
              onClick={() => {
                setSelectedAnimalId(undefined);
                setSheetState("confirm");
              }}
            >
              המשך
            </Button>
            <button
              onClick={onClose}
              className="w-full text-sm text-muted-foreground py-2 min-h-[44px]"
            >
              ביטול
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
