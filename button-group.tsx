import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import { QrScanner } from "@/components/qr-scanner";
import {
  useGetEquipment,
  useScanEquipment,
  getGetEquipmentQueryKey,
} from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Layout } from "@/components/layout";
import {
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Sparkles,
  ArrowLeft,
  Loader2,
  ChevronRight,
} from "lucide-react";

/* ================= TYPES ================= */

type Status = "ok" | "issue" | "maintenance" | "sterilized";

/* ================= STATUS CONFIG ================= */

const STATUS_OPTIONS: {
  value: Status;
  label: string;
  sublabel: string;
  icon: React.ComponentType<{ className?: string }>;
  bg: string;
  border: string;
  iconColor: string;
}[] = [
  {
    value: "ok",
    label: "OK",
    sublabel: "Equipment is working normally",
    icon: CheckCircle2,
    bg: "bg-green-50 hover:bg-green-100 active:bg-green-200",
    border: "border-green-200",
    iconColor: "text-green-600",
  },
  {
    value: "issue",
    label: "Issue",
    sublabel: "Something is wrong — needs attention",
    icon: AlertTriangle,
    bg: "bg-orange-50 hover:bg-orange-100 active:bg-orange-200",
    border: "border-orange-200",
    iconColor: "text-orange-600",
  },
  {
    value: "maintenance",
    label: "Maintenance",
    sublabel: "Sent for repair or servicing",
    icon: Wrench,
    bg: "bg-red-50 hover:bg-red-100 active:bg-red-200",
    border: "border-red-200",
    iconColor: "text-red-600",
  },
  {
    value: "sterilized",
    label: "Sterilized",
    sublabel: "Autoclave or sterilization complete",
    icon: Sparkles,
    bg: "bg-teal-50 hover:bg-teal-100 active:bg-teal-200",
    border: "border-teal-200",
    iconColor: "text-teal-600",
  },
];

/* ================= STEP: SCAN ================= */

function StepScan({ onScanned }: { onScanned: (id: string) => void }) {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Scan Equipment</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Point the camera at the QR code on the equipment
        </p>
      </div>
      <div className="rounded-2xl overflow-hidden border border-border shadow-sm bg-black aspect-[4/3]">
        <QrScanner onScan={onScanned} open={true} />
      </div>
    </div>
  );
}

/* ================= STEP: CONFIRM ================= */

function StepConfirm({
  equipmentId,
  onConfirm,  // תוקן: מקבל את השם כארגומנט
  onRescan,
}: {
  equipmentId: string;
  onConfirm: (equipmentName: string) => void;
  onRescan: () => void;
}) {
  const { data: equipment, isLoading, isError } = useGetEquipment(equipmentId, {
    query: { enabled: !!equipmentId, queryKey: getGetEquipmentQueryKey(equipmentId) },
  });

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Looking up equipment...</p>
      </div>
    );
  }

  if (isError || !equipment) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center">
          <AlertTriangle className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <p className="font-semibold text-foreground">Equipment not found</p>
          <p className="text-sm text-muted-foreground mt-1">
            This QR code doesn't match any registered equipment.
          </p>
        </div>
        <button
          onClick={onRescan}
          className="px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Try again
        </button>
      </div>
    );
  }

  const currentCfg = STATUS_OPTIONS.find((s) => s.value === equipment.lastStatus);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-foreground tracking-tight">Equipment Found</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Confirm this is the correct item</p>
      </div>

      <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
        <p className="text-lg font-bold text-foreground">{equipment.name}</p>
        {(equipment.model || equipment.serialNumber) && (
          <p className="text-sm text-muted-foreground mt-0.5">
            {[equipment.model, equipment.serialNumber].filter(Boolean).join(" · ")}
          </p>
        )}
        {equipment.category && (
          <p className="text-xs text-muted-foreground mt-1">{equipment.category}</p>
        )}
        {currentCfg && (
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-1">
              Current Status
            </p>
            <span
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${currentCfg.bg} ${currentCfg.border} ${currentCfg.iconColor}`}
            >
              <currentCfg.icon className="w-3.5 h-3.5" />
              {currentCfg.label}
            </span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onRescan}
          className="flex-1 h-11 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          Not this one
        </button>
        <button
          onClick={() => onConfirm(equipment.name)} // תוקן: מעביר את השם
          className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
        >
          Continue
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ================= STEP: SELECT STATUS ================= */

function StepSelectStatus({
  equipmentId,
  equipmentName,
  onSuccess,
  onBack,
}: {
  equipmentId: string;
  equipmentName: string;
  onSuccess: (status: Status) => void;
  onBack: () => void;
}) {
  const queryClient = useQueryClient();
  const scanMutation = useScanEquipment();
  const [pendingStatus, setPendingStatus] = useState<Status | null>(null);
  const [note, setNote] = useState("");
  const [showNote, setShowNote] = useState(false);

  // תוקן: submitScan מוגדר בתוך handleSelect — אין stale closure
  const handleSelect = useCallback(
    (status: Status) => {
      setPendingStatus(status);
      scanMutation.mutate(
        { equipmentId, status, note: showNote ? note : "" },
        {
          onSuccess: () => {
            queryClient.invalidateQueries({
              queryKey: getGetEquipmentQueryKey(equipmentId),
            });
            onSuccess(status);
          },
          onError: () => {
            setPendingStatus(null);
          },
        },
      );
    },
    [equipmentId, note, showNote, scanMutation, queryClient, onSuccess],
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-2 rounded-xl hover:bg-muted transition-colors"
          aria-label="Back"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground tracking-tight truncate">
            {equipmentName}
          </h1>
          <p className="text-sm text-muted-foreground">Select new status</p>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {STATUS_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isPending = pendingStatus === opt.value && scanMutation.isPending;

          return (
            <button
              key={opt.value}
              onClick={() => handleSelect(opt.value)}
              disabled={scanMutation.isPending}
              className={`
                flex items-center gap-4 px-4 py-4 rounded-2xl border text-left
                transition-all active:scale-[0.98]
                ${opt.bg} ${opt.border}
                disabled:opacity-60 disabled:cursor-not-allowed
              `}
            >
              <div className="w-10 h-10 rounded-xl bg-white/80 flex items-center justify-center shrink-0 shadow-sm">
                {isPending ? (
                  <Loader2 className={`w-5 h-5 animate-spin ${opt.iconColor}`} />
                ) : (
                  <Icon className={`w-5 h-5 ${opt.iconColor}`} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${opt.iconColor}`}>{opt.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{opt.sublabel}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Optional note */}
      <div className="bg-card border border-border rounded-2xl p-4 shadow-sm">
        <button
          onClick={() => setShowNote((v) => !v)}
          className="text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          {showNote ? "Remove note" : "+ Add a note (optional)"}
        </button>
        {showNote && (
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Battery replaced, scalpel set returned from surgery..."
            className="mt-3 w-full h-20 px-3 py-2 rounded-xl border border-border bg-muted/30 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none"
          />
        )}
      </div>

      {scanMutation.isError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm text-red-700 font-medium">
            Failed to update status. Please try again.
          </p>
        </div>
      )}
    </div>
  );
}

/* ================= STEP: DONE ================= */

function StepDone({
  equipmentName,
  status,
  equipmentId,
  onScanAnother,
  onViewEquipment,
}: {
  equipmentName: string;
  status: Status;
  onScanAnother: () => void;
  onViewEquipment: () => void;
}) {
  const cfg = STATUS_OPTIONS.find((s) => s.value === status)!;
  const Icon = cfg.icon;

  return (
    <div className="flex flex-col items-center text-center gap-6 py-10">
      <div
        className={`w-20 h-20 rounded-3xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shadow-sm`}
      >
        <Icon className={`w-9 h-9 ${cfg.iconColor}`} />
      </div>

      <div>
        <h2 className="text-2xl font-bold text-foreground">Updated!</h2>
        <p className="text-base text-muted-foreground mt-1">
          <span className="font-semibold text-foreground">{equipmentName}</span>
          {" "}is now marked as{" "}
          <span className={`font-semibold ${cfg.iconColor}`}>{cfg.label}</span>
        </p>
      </div>

      <div className="flex flex-col gap-3 w-full max-w-xs">
        <button
          onClick={onScanAnother}
          className="w-full h-11 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          Scan another item
        </button>
        <button
          onClick={onViewEquipment}
          className="w-full h-11 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors flex items-center justify-center gap-2"
        >
          View equipment details
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

/* ================= STEP STATE ================= */

type Step =
  | { type: "scan" }
  | { type: "confirm"; equipmentId: string }
  | { type: "select"; equipmentId: string; equipmentName: string }
  | { type: "done"; equipmentId: string; equipmentName: string; status: Status };

/* ================= MAIN ================= */

export function QuickStatusUpdate() {
  const [, navigate] = useLocation();
  const [step, setStep] = useState<Step>({ type: "scan" });

  const handleScanned = useCallback((id: string) => {
    setStep({ type: "confirm", equipmentId: id });
  }, []);

  // תוקן: מקבל את שם הציוד מ-StepConfirm
  const handleConfirmed = useCallback(
    (equipmentName: string) => {
      if (step.type !== "confirm") return;
      setStep({
        type: "select",
        equipmentId: step.equipmentId,
        equipmentName,
      });
    },
    [step],
  );

  const handleSuccess = useCallback(
    (status: Status) => {
      if (step.type !== "select") return;
      setStep({
        type: "done",
        equipmentId: step.equipmentId,
        equipmentName: step.equipmentName, // עכשיו השם האמיתי
        status,
      });
    },
    [step],
  );

  const reset = useCallback(() => setStep({ type: "scan" }), []);

  return (
    <Layout>
      <div className="max-w-md mx-auto flex flex-col gap-5 pb-10 pt-2">

        {step.type === "scan" && (
          <StepScan onScanned={handleScanned} />
        )}

        {step.type === "confirm" && (
          <StepConfirm
            equipmentId={step.equipmentId}
            onConfirm={handleConfirmed}
            onRescan={reset}
          />
        )}

        {step.type === "select" && (
          <StepSelectStatus
            equipmentId={step.equipmentId}
            equipmentName={step.equipmentName}
            onSuccess={handleSuccess}
            onBack={() =>
              setStep({ type: "confirm", equipmentId: step.equipmentId })
            }
          />
        )}

        {step.type === "done" && (
          <StepDone
            equipmentName={step.equipmentName}
            status={step.status}
            equipmentId={step.equipmentId}
            onScanAnother={reset}
            onViewEquipment={() => navigate(`/equipment/${step.equipmentId}`)}
          />
        )}

      </div>
    </Layout>
  );
}
