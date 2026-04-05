import React, { useState, useEffect } from "react";
import { useParams, Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Sparkles,
  Activity,
  ArrowRightLeft,
  Save
} from "lucide-react";

import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// Using our strict core API utilities
import { useGetEquipment, useUpdateEquipment, useApi, Status } from "@/lib/api";

// ==========================================
// Types
// ==========================================
interface LogEntry {
  id: string;
  timestamp: string;
  status: Status;
  note?: string;
}

interface TransferEntry {
  id: string;
  timestamp: string;
  fromLocation?: string;
  toLocation?: string;
}

type HistoryItem = 
  | { id: string; type: "log"; timestamp: string; data: LogEntry }
  | { id: string; type: "transfer"; timestamp: string; data: TransferEntry };

// ==========================================
// Configurations
// ==========================================
// FIX: Added explicit 'border' prop to adhere to Tailwind static classes rule
const STATUS_CONFIG: Record<Status, { icon: React.ElementType; color: string; bg: string; border: string; label: string }> = {
  ok: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-100", border: "border-green-600", label: "OK" },
  issue: { icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-100", border: "border-orange-600", label: "Issue" },
  maintenance: { icon: Wrench, color: "text-blue-600", bg: "bg-blue-100", border: "border-blue-600", label: "Maintenance" },
  sterilized: { icon: Sparkles, color: "text-teal-600", bg: "bg-teal-100", border: "border-teal-600", label: "Sterilized" }
};

function StatusBadge({ status }: { status: Status }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ok;
  const Icon = cfg.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ${cfg.bg} ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

// ==========================================
// Component
// ==========================================
export default function EquipmentDetail() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const api = useApi();

  // Local State
  const [scanState, setScanState] = useState<"idle" | "selecting" | "note">("idle");
  const [selectedStatus, setSelectedStatus] = useState<Status | null>(null);
  const [scanNote, setScanNote] = useState("");
  const [intervalInput, setIntervalInput] = useState("");

  // Data Fetching
  const { data: equipment, isLoading: isLoadingEquipment } = useGetEquipment(id);

  const { data: logs = [] } = useQuery<LogEntry[]>({
    queryKey: ["equipment-logs", id],
    queryFn: () => api(`/equipment/${id}/logs`),
    enabled: !!id,
  });

  const { data: transfers = [] } = useQuery<TransferEntry[]>({
    queryKey: ["equipment-transfers", id],
    queryFn: () => api(`/equipment/${id}/transfers`),
    enabled: !!id,
  });

  // Mutations
  const updateMutation = useUpdateEquipment();

  const scanMutation = useMutation({
    mutationFn: (payload: { status: Status; note: string }) =>
      api(`/equipment/${id}/scan`, {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => {
      setScanState("idle");
      setSelectedStatus(null);
      setScanNote("");
      queryClient.invalidateQueries({ queryKey: ["equipment", id] });
      queryClient.invalidateQueries({ queryKey: ["equipment-logs", id] });
    },
  });

  // Handlers
  useEffect(() => {
    if (equipment?.maintenanceInterval !== undefined && intervalInput === "") {
      setIntervalInput(String(equipment.maintenanceInterval));
    }
  }, [equipment?.maintenanceInterval, intervalInput]);

  const handleSaveInterval = () => {
    if (!equipment || !id) return;
    updateMutation.mutate({
      id,
      maintenanceInterval: parseInt(intervalInput, 10) || 0
    });
  };

  const handleStatusSubmit = () => {
    if (!selectedStatus || !id) return;
    scanMutation.mutate({
      status: selectedStatus,
      note: scanNote
    });
  };

  // Compile and sort history
  const historyItems: HistoryItem[] = [
    ...logs.map((l) => ({ id: `log-${l.id}`, type: "log" as const, timestamp: l.timestamp, data: l })),
    ...transfers.map((t) => ({ id: `transfer-${t.id}`, type: "transfer" as const, timestamp: t.timestamp, data: t }))
  ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // Render Loading State
  if (isLoadingEquipment) {
    return (
      <Layout>
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-10 w-2/3" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Layout>
    );
  }

  // Render Not Found
  if (!equipment) {
    return (
      <Layout>
        <div className="p-20 text-center flex flex-col items-center gap-4">
          <AlertTriangle className="w-12 h-12 text-muted-foreground" />
          <h2 className="text-xl font-semibold">Asset Not Found</h2>
          <Link href="/" className="text-blue-600 hover:underline">Return to Dashboard</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto flex flex-col gap-8 p-6 pb-24">

        {/* Header */}
        <div>
          <Link href="/" className="inline-flex items-center text-muted-foreground hover:text-foreground transition-colors mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> 
            Back to Dashboard
          </Link>
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h1 className="text-3xl font-bold text-gray-900">{equipment.name}</h1>
            <StatusBadge status={equipment.status as Status} />
          </div>
        </div>

        {/* Action Panel - Scan Flow */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">Update Status</h2>

          {scanState === "idle" && (
            <Button onClick={() => setScanState("selecting")} className="w-full sm:w-auto">
              New Scan / Status Update
            </Button>
          )}

          {scanState === "selecting" && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Select the new status for this equipment:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {(Object.keys(STATUS_CONFIG) as Status[]).map((status) => {
                  const cfg = STATUS_CONFIG[status];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={status}
                      onClick={() => {
                        setSelectedStatus(status);
                        setScanState("note");
                      }}
                      className={`flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all ${
                        selectedStatus === status 
                          ? `${cfg.border} ${cfg.bg}` 
                          : "border-gray-100 hover:border-gray-300 bg-gray-50"
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${cfg.color}`} />
                      <span className="text-sm font-medium">{cfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {scanState === "note" && selectedStatus && (
            <div className="space-y-4 max-w-md animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm text-muted-foreground">Selected Status:</span>
                <StatusBadge status={selectedStatus} />
              </div>
              <Textarea
                placeholder="Add a note (optional)..."
                value={scanNote}
                onChange={(e) => setScanNote(e.target.value)}
                className="min-h-[100px]"
              />
              <div className="flex gap-3">
                <Button 
                  onClick={handleStatusSubmit} 
                  disabled={scanMutation.isPending}
                  className="flex-1"
                >
                  {scanMutation.isPending ? "Saving..." : "Confirm Update"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setScanState("idle");
                    setSelectedStatus(null);
                  }}
                  disabled={scanMutation.isPending}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Settings Panel - Maintenance Interval */}
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4">Settings</h2>
          <div className="flex items-end gap-4 max-w-xs">
            <div className="space-y-2 flex-1">
              <label className="text-sm font-medium text-gray-700">Maintenance Interval (Days)</label>
              <Input
                type="number"
                min="0"
                value={intervalInput}
                onChange={(e) => setIntervalInput(e.target.value)}
                placeholder="e.g. 30"
              />
            </div>
            <Button 
              variant="secondary" 
              onClick={handleSaveInterval}
              disabled={updateMutation.isPending || intervalInput === String(equipment.maintenanceInterval)}
            >
              <Save className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>
        </div>

        {/* History Timeline */}
        <div>
          <h2 className="text-xl font-bold mb-6">Activity History</h2>
          {historyItems.length === 0 ? (
             <p className="text-muted-foreground bg-gray-50 rounded-lg p-6 text-center border border-dashed">
               No activity history found for this equipment.
             </p>
          ) : (
            <div className="space-y-4">
              {historyItems.map((item) => (
                <div key={item.id} className="flex gap-4 p-4 rounded-xl border border-gray-100 bg-white shadow-sm">
                  <div className="mt-1">
                    {item.type === "log" ? (
                      <Activity className="w-5 h-5 text-gray-400" />
                    ) : (
                      <ArrowRightLeft className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="font-medium text-sm">
                        {item.type === "log" ? (
                          <div className="flex items-center gap-2">
                            Status changed to <StatusBadge status={item.data.status} />
                          </div>
                        ) : (
                          <span>Location Transfer</span>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(item.timestamp), "MMM dd, yyyy HH:mm")}
                      </span>
                    </div>
                    {item.type === "log" && item.data.note && (
                      <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded-md mt-2">
                        "{item.data.note}"
                      </p>
                    )}
                    {item.type === "transfer" && (
                      <p className="text-sm text-gray-600 mt-1">
                        From: {item.data.fromLocation || 'Unknown'} → To: {item.data.toLocation || 'Unknown'}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </Layout>
  );
}
