import { useState, useRef, useEffect } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { STATUS_LABELS } from "@/types";
import type { EquipmentStatus, Equipment } from "@/types";
import {
  ArrowLeft,
  QrCode,
  Scan,
  ClipboardEdit,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Droplets,
  MessageCircle,
  Package,
  MapPin,
  Calendar,
  Hash,
  Clock,
  FolderOpen,
  Loader2,
  LogIn,
  LogOut,
  User,
  Camera,
  Copy,
} from "lucide-react";
import {
  formatDate,
  formatDateTime,
  formatRelativeTime,
  buildWhatsAppUrl,
  generateQrUrl,
  isOverdue,
  isSterilizationDue,
} from "@/lib/utils";
import { statusToBadgeVariant } from "@/lib/design-tokens";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { QRCodeSVG } from "qrcode.react";
import { removePendingSync } from "@/lib/offline-db";
import { useSettings } from "@/hooks/use-settings";
import { playCriticalAlertTone } from "@/lib/sounds";

const STATUS_CONFIG = {
  ok: { icon: CheckCircle2, color: "text-emerald-600", iconBg: "bg-emerald-50" },
  issue: { icon: AlertTriangle, color: "text-red-500", iconBg: "bg-red-50" },
  maintenance: { icon: Wrench, color: "text-amber-500", iconBg: "bg-amber-50" },
  sterilized: { icon: Droplets, color: "text-teal-500", iconBg: "bg-teal-50" },
};

const UNDO_WINDOW_MS = 90_000;

interface UndoState {
  actionLabel: string;
  previousEquipment: Equipment;
  undoToken?: string;
  pendingSyncId?: number;
  timeoutId: ReturnType<typeof setTimeout>;
  toastId: string | number;
}

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const { isAdmin, email, userId, role } = useAuth();
  const ROLE_LEVEL: Record<string, number> = { admin: 40, vet: 30, technician: 20, viewer: 10 };
  const canDuplicate = (ROLE_LEVEL[role] ?? 0) >= 20;
  const { settings } = useSettings();
  const queryClient = useQueryClient();
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanActionSheetOpen, setScanActionSheetOpen] = useState(false);
  const [scanActionDone, setScanActionDone] = useState(false);
  const [scanStatus, setScanStatus] = useState<EquipmentStatus>("ok");
  const [scanNote, setScanNote] = useState("");
  const [scanPhoto, setScanPhoto] = useState<string | null>(null);
  const [noteError, setNoteError] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [checkoutLocation, setCheckoutLocation] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);
  const reportIssuePhotoRef = useRef<HTMLInputElement>(null);
  const undoStateRef = useRef<UndoState | null>(null);
  const [undoCountdown, setUndoCountdown] = useState(0);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const [reportIssueNote, setReportIssueNote] = useState("");
  const [reportIssuePhoto, setReportIssuePhoto] = useState<string | null>(null);
  const [reportIssueNoteError, setReportIssueNoteError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(searchStr);
    if (params.get("action") === "scan") {
      setScanActionSheetOpen(true);
    } else if (params.get("action") === "issue") {
      setReportIssueOpen(true);
    }
  }, [searchStr]);

  useEffect(() => {
    if (id) {
      localStorage.setItem("vettrack_last_equipment_id", id);
    }
    return () => {};
  }, [id]);

  function clearUndoState() {
    if (undoStateRef.current) {
      clearTimeout(undoStateRef.current.timeoutId);
      toast.dismiss(undoStateRef.current.toastId);
      undoStateRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setUndoCountdown(0);
  }

  async function handleUndo(state: UndoState) {
    clearUndoState();

    const prev = state.previousEquipment;

    if (state.pendingSyncId !== undefined) {
      await removePendingSync(state.pendingSyncId);
      queryClient.setQueryData([`/api/equipment/${id}`], prev);
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}/logs`] });
      toast.success("Action undone");
      return;
    }

    if (!state.undoToken) {
      // Offline action with no sync ID — restore optimistic state locally
      queryClient.setQueryData([`/api/equipment/${id}`], prev);
      invalidateAll();
      toast.success("Action undone");
      return;
    }

    try {
      const reverted = await api.equipment.revert(id!, state.undoToken);
      queryClient.setQueryData([`/api/equipment/${id}`], reverted);
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}/logs`] });
      toast.success("Action undone");
    } catch {
      toast.error("Undo failed — window may have expired");
    }
  }

  function startUndoTimer(state: Omit<UndoState, "timeoutId" | "toastId">) {
    clearUndoState();

    const startTime = Date.now();
    setUndoCountdown(Math.ceil(UNDO_WINDOW_MS / 1000));

    const toastId = `undo-${Date.now()}`;
    const getLabel = (secs: number) => `Undo (${secs}s)`;

    toast(`${state.actionLabel}`, {
      id: toastId,
      duration: UNDO_WINDOW_MS,
      action: {
        label: getLabel(Math.ceil(UNDO_WINDOW_MS / 1000)),
        onClick: () => {
          if (undoStateRef.current) {
            handleUndo(undoStateRef.current);
          }
        },
      },
    });

    const intervalId = setInterval(() => {
      const remaining = Math.ceil((UNDO_WINDOW_MS - (Date.now() - startTime)) / 1000);
      if (remaining <= 0) {
        clearInterval(intervalId);
        setUndoCountdown(0);
      } else {
        setUndoCountdown(remaining);
        toast(`${state.actionLabel}`, {
          id: toastId,
          duration: UNDO_WINDOW_MS - (Date.now() - startTime),
          action: {
            label: getLabel(remaining),
            onClick: () => {
              if (undoStateRef.current) {
                handleUndo(undoStateRef.current);
              }
            },
          },
        });
      }
    }, 1000);
    countdownIntervalRef.current = intervalId;

    const timeoutId = setTimeout(() => {
      clearInterval(intervalId);
      setUndoCountdown(0);
      if (undoStateRef.current) {
        toast.dismiss(undoStateRef.current.toastId);
        undoStateRef.current = null;
      }
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}/logs`] });
    }, UNDO_WINDOW_MS);

    undoStateRef.current = { ...state, timeoutId, toastId };
  }

  const { data: equipment, isLoading } = useQuery({
    queryKey: [`/api/equipment/${id}`],
    queryFn: () => api.equipment.get(id!),
    enabled: !!id,
  });

  const { data: scanLogs, isLoading: logsLoading } = useQuery({
    queryKey: [`/api/equipment/${id}/logs`],
    queryFn: () => api.equipment.logs(id!),
    enabled: !!id,
  });

  const { data: transfers, isLoading: transfersLoading } = useQuery({
    queryKey: [`/api/equipment/${id}/transfers`],
    queryFn: () => api.equipment.transfers(id!),
    enabled: !!id,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
    queryClient.invalidateQueries({ queryKey: ["/api/equipment/my"] });
  }

  const isOffline = !navigator.onLine;

  const scanMut = useMutation({
    mutationFn: async () => {
      const prev = queryClient.getQueryData<Equipment>([`/api/equipment/${id}`]);
      const capturedStatus = scanStatus;
      const capturedNote = scanNote;
      const capturedPhoto = scanPhoto;

      const result = await api.equipment.scan(id!, {
        status: capturedStatus,
        note: capturedNote,
        photoUrl: capturedPhoto || undefined,
        userEmail: email || "",
        userId: userId || "",
      });
      return { result, prev, capturedStatus, wasOffline: result.pendingSyncId !== undefined };
    },
    onSuccess: ({ result, prev, capturedStatus, wasOffline }) => {
      setScanDialogOpen(false);
      setScanNote("");
      setScanPhoto(null);
      setNoteError("");

      const { equipment: updated, scanLog, undoToken } = result;

      if (wasOffline) {
        if (prev) {
          queryClient.setQueryData([`/api/equipment/${id}`], updated);
          startUndoTimer({
            actionLabel: `Status updated to ${STATUS_LABELS[capturedStatus]}`,
            previousEquipment: prev,
            pendingSyncId: result.pendingSyncId,
          });
        }
        toast.info("Saved offline — will sync when connected");
        return;
      }

      queryClient.setQueryData([`/api/equipment/${id}`], updated);
      queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}/logs`] });

      if (prev) {
        startUndoTimer({
          actionLabel: `Status updated to ${STATUS_LABELS[capturedStatus]}`,
          previousEquipment: prev,
          undoToken,
        });
      }

      if (capturedStatus === "issue") {
        if (settings.soundEnabled && settings.criticalAlertsSound) {
          playCriticalAlertTone();
        }
        setTimeout(() => {
          if (isOffline) {
            toast.warning("Issue reported — alert will fire locally. WhatsApp will be sent when back online.");
          } else {
            const waUrl = buildWhatsAppUrl(undefined, updated.name, capturedStatus, scanLog?.note || "");
            window.open(waUrl, "_blank");
            toast("Issue reported — WhatsApp alert sent.", {
              duration: 10000,
              action: {
                label: "Cancel",
                onClick: () => {},
              },
            });
          }
        }, 300);
      }
    },
    onError: (err: Error) => {
      toast.error(err.message || "Scan failed");
    },
  });

  const checkoutMut = useMutation({
    mutationFn: async () => {
      const prev = queryClient.getQueryData<Equipment>([`/api/equipment/${id}`]);
      const capturedLocation = checkoutLocation;
      const result = await api.equipment.checkout(id!, capturedLocation || undefined);
      return { result, prev };
    },
    onSuccess: ({ result, prev }) => {
      setCheckoutLocation("");

      const { equipment: updated, undoToken } = result;
      const wasOffline = result.pendingSyncId !== undefined;

      queryClient.setQueryData([`/api/equipment/${id}`], updated);

      if (wasOffline) {
        toast.info("Saved offline — will sync when connected");
        if (prev) {
          startUndoTimer({
            actionLabel: "Checked out successfully",
            previousEquipment: prev,
            pendingSyncId: result.pendingSyncId,
          });
        }
        setScanActionDone(true);
        return;
      }

      if (prev) {
        startUndoTimer({
          actionLabel: "Checked out successfully",
          previousEquipment: prev,
          undoToken,
        });
      }
      setScanActionDone(true);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Checkout failed");
    },
  });

  const returnMut = useMutation({
    mutationFn: async () => {
      const prev = queryClient.getQueryData<Equipment>([`/api/equipment/${id}`]);
      const result = await api.equipment.return(id!);
      return { result, prev };
    },
    onSuccess: ({ result, prev }) => {
      const { equipment: updated, undoToken } = result;
      const wasOffline = result.pendingSyncId !== undefined;

      queryClient.setQueryData([`/api/equipment/${id}`], updated);

      if (wasOffline) {
        toast.info("Saved offline — will sync when connected");
        if (prev) {
          startUndoTimer({
            actionLabel: "Returned — equipment is now available",
            previousEquipment: prev,
            pendingSyncId: result.pendingSyncId,
          });
        }
        setScanActionDone(true);
        return;
      }

      invalidateAll();

      if (prev) {
        startUndoTimer({
          actionLabel: "Returned — equipment is now available",
          previousEquipment: prev,
          undoToken,
        });
      }
      setScanActionDone(true);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Return failed");
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => api.equipment.delete(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      toast.success("Equipment deleted");
      navigate("/equipment");
    },
    onError: () => toast.error("Delete failed"),
  });

  const reportIssueMut = useMutation({
    mutationFn: async () => {
      const prev = queryClient.getQueryData<Equipment>([`/api/equipment/${id}`]);
      const capturedNote = reportIssueNote;
      const capturedPhoto = reportIssuePhoto;
      const result = await api.equipment.scan(id!, {
        status: "issue",
        note: capturedNote,
        photoUrl: capturedPhoto || undefined,
        userEmail: email || "",
        userId: userId || "",
      });
      return { result, prev, capturedNote };
    },
    onSuccess: ({ result, prev, capturedNote }) => {
      setReportIssueOpen(false);
      setReportIssueNote("");
      setReportIssuePhoto(null);
      setReportIssueNoteError("");

      if (settings.soundEnabled && settings.criticalAlertsSound) {
        playCriticalAlertTone();
      }

      const { equipment: updated, scanLog, undoToken } = result;
      const wasOffline = result.pendingSyncId !== undefined;

      queryClient.setQueryData([`/api/equipment/${id}`], updated);
      queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}/logs`] });

      if (wasOffline) {
        toast.info("Saved offline — will sync when connected");
        if (prev) {
          startUndoTimer({
            actionLabel: "Issue reported",
            previousEquipment: prev,
            pendingSyncId: result.pendingSyncId,
          });
        }
        return;
      }

      if (prev) {
        startUndoTimer({
          actionLabel: "Issue reported",
          previousEquipment: prev,
          undoToken,
        });
      }

      setTimeout(() => {
        if (!navigator.onLine) {
          toast.warning("Issue reported — WhatsApp will be sent when back online.");
        } else {
          const waUrl = buildWhatsAppUrl(undefined, updated.name, "issue", scanLog?.note || capturedNote || "");
          window.open(waUrl, "_blank");
          toast("Issue reported — WhatsApp alert sent.", {
            duration: 10000,
            action: {
              label: "Cancel",
              onClick: () => {},
            },
          });
        }
      }, 300);
    },
    onError: (err: Error) => {
      toast.error(err.message || "Report failed");
    },
  });

  function handleDuplicate() {
    if (!equipment) return;
    const params = new URLSearchParams();
    if (equipment.name) params.set("copyName", equipment.name);
    if (equipment.model) params.set("copyModel", equipment.model);
    if (equipment.manufacturer) params.set("copyManuf", equipment.manufacturer);
    if (equipment.purchaseDate) params.set("copyPurchaseDate", equipment.purchaseDate);
    if (equipment.location) params.set("copyLocation", equipment.location);
    if (equipment.folderId) params.set("copyFolder", equipment.folderId);
    if (equipment.maintenanceIntervalDays)
      params.set("copyMaint", String(equipment.maintenanceIntervalDays));
    params.set("copiedFrom", equipment.name);
    navigate(`/equipment/new?${params.toString()}`);
  }

  const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Photo must be under 2 MB");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setScanPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleReportIssuePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES) {
      toast.error("Photo must be under 2 MB");
      e.target.value = "";
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setReportIssuePhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  function handleReportIssueSubmit() {
    if (!reportIssueNote.trim()) {
      setReportIssueNoteError("A note is required when reporting an issue.");
      return;
    }
    setReportIssueNoteError("");
    reportIssueMut.mutate();
  }

  function handleScanSubmit() {
    if (scanStatus === "issue" && !scanNote.trim()) {
      setNoteError("A note is required when reporting an issue.");
      return;
    }
    setNoteError("");
    scanMut.mutate();
  }

  function openScanDialog() {
    setScanStatus("ok");
    setScanNote("");
    setScanPhoto(null);
    setNoteError("");
    setScanDialogOpen(true);
  }

  if (isLoading) {
    return (
      <Layout>
        <div className="flex flex-col gap-4 pb-24">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </div>
      </Layout>
    );
  }

  if (!equipment) {
    return (
      <Layout>
        <div className="text-center py-20">
          <p className="text-muted-foreground">Equipment not found</p>
          <Button variant="ghost" onClick={() => navigate("/equipment")} className="mt-2">
            Back to list
          </Button>
        </div>
      </Layout>
    );
  }

  const statusConf = STATUS_CONFIG[equipment.status as keyof typeof STATUS_CONFIG];
  const StatusIcon = statusConf?.icon || Package;
  const overdue = isOverdue(equipment);
  const sterilizationDue = isSterilizationDue(equipment);
  const qrUrl = generateQrUrl(equipment.id);

  const isCheckedOut = !!equipment.checkedOutById;
  const checkedOutByMe = equipment.checkedOutById === userId;

  return (
    <Layout>
      <Helmet>
        <title>{equipment.name} — VetTrack</title>
        <meta name="description" content={`Equipment detail for ${equipment.name}. Status: ${equipment.status}${equipment.location ? `. Location: ${equipment.location}` : ""}. Update status, check out, report issues, and view full history.`} />
        <link rel="canonical" href={`https://vettrack.replit.app/equipment/${equipment.id}`} />
      </Helmet>
      <div className="flex flex-col gap-4 pb-24 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => navigate("/equipment")}
              data-testid="btn-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
            <div>
              <h1 className="text-xl font-bold leading-tight">{equipment.name}</h1>
              {equipment.folderName && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                  <FolderOpen className="w-3 h-3" />
                  {equipment.folderName}
                </span>
              )}
            </div>
          </div>
          <div className="flex gap-1">
            {canDuplicate && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={handleDuplicate}
                title="Duplicate equipment"
                data-testid="btn-duplicate"
              >
                <Copy className="w-4 h-4" />
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate(`/equipment/${id}/edit`)}
                data-testid="btn-edit"
              >
                <Pencil className="w-4 h-4" />
              </Button>
            )}
            {isAdmin && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-destructive hover:text-destructive"
                    data-testid="btn-delete"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {equipment.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This permanently deletes this equipment and all its scan history.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => deleteMut.mutate()}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>

        {/* Quick Action Bar — ICU-moment: 1–2 large, instantly tappable actions */}
        <div className="flex flex-col gap-2" data-testid="quick-action-bar">
          {/* Primary action based on checkout state */}
          {!isCheckedOut ? (
            <Button
              size="lg"
              className="w-full h-14 gap-3 text-base font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl active:scale-[0.98] transition-all shadow-sm"
              onClick={() => checkoutMut.mutate()}
              disabled={checkoutMut.isPending}
              data-testid="btn-checkout"
            >
              {checkoutMut.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              Mark In Use
            </Button>
          ) : (checkedOutByMe || isAdmin) ? (
            <Button
              size="lg"
              className="w-full h-14 gap-3 text-base font-bold rounded-2xl active:scale-[0.98] transition-all shadow-sm"
              variant="outline"
              onClick={() => returnMut.mutate()}
              disabled={returnMut.isPending}
              data-testid="btn-return"
            >
              {returnMut.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogOut className="w-5 h-5" />
              )}
              Check In / Return
            </Button>
          ) : null}

          {/* Secondary action row */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              variant="outline"
              className="h-12 gap-2 font-semibold rounded-xl border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 active:scale-[0.98] transition-all"
              onClick={() => {
                setReportIssueNote("");
                setReportIssuePhoto(null);
                setReportIssueNoteError("");
                setReportIssueOpen(true);
              }}
              data-testid="btn-report-issue"
            >
              <AlertTriangle className="w-4 h-4" />
              Report Issue
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 gap-2 font-semibold rounded-xl active:scale-[0.98] transition-all"
              onClick={openScanDialog}
              data-testid="btn-scan"
            >
              <ClipboardEdit className="w-4 h-4" />
              Update Status
            </Button>
          </div>

          {/* In-use context indicator */}
          {isCheckedOut && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/60 bg-muted/50 text-sm">
              <User className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold text-sm leading-tight">
                  {checkedOutByMe ? "Checked out by you" : `In use by ${equipment.checkedOutByEmail}`}
                </p>
                {equipment.checkedOutLocation && (
                  <p className="text-xs mt-0.5 opacity-80 truncate">{equipment.checkedOutLocation}</p>
                )}
                <p className="text-xs mt-0.5 opacity-70">Since {formatRelativeTime(equipment.checkedOutAt)}</p>
              </div>
            </div>
          )}
        </div>

        {/* Status card */}
        <Card className="bg-card border-border/60 shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${statusConf?.iconBg || "bg-muted"}`}>
                  <StatusIcon className={`w-5 h-5 ${statusConf?.color || ""}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Status</p>
                  <p className="text-lg font-bold">
                    {STATUS_LABELS[equipment.status as keyof typeof STATUS_LABELS] || equipment.status}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last scan: {formatRelativeTime(equipment.lastSeen?.toString())}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-1.5 items-end shrink-0">
                <Button variant="outline" size="sm" onClick={() => setShowQR(true)} data-testid="btn-show-qr" className="h-8">
                  <QrCode className="w-3.5 h-3.5 mr-1" />
                  QR Code
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const waUrl = buildWhatsAppUrl(
                      undefined,
                      equipment.name,
                      equipment.status as EquipmentStatus,
                      `Status report for ${equipment.name}`
                    );
                    window.open(waUrl, "_blank");
                  }}
                  className="h-8 text-green-700 border-green-200 hover:bg-green-50"
                  data-testid="btn-whatsapp"
                >
                  <MessageCircle className="w-3.5 h-3.5 mr-1" />
                  WhatsApp
                </Button>
              </div>
            </div>

            {undoCountdown > 0 && (
              <div className="mt-3 pt-3 border-t border-border/40">
                <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded-full transition-none"
                    style={{ width: `${(undoCountdown / (UNDO_WINDOW_MS / 1000)) * 100}%`, transition: "width 1s linear" }}
                  />
                </div>
              </div>
            )}

            {(overdue || sterilizationDue) && (
              <div className="mt-3 pt-3 border-t border-border/40 flex flex-col gap-1">
                {overdue && (
                  <div className="flex items-center gap-2 text-xs text-red-700 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Maintenance overdue!
                  </div>
                )}
                {sterilizationDue && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 font-medium">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Sterilization due (7+ days)
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info tabs */}
        <Tabs defaultValue="details">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              History ({scanLogs?.length ?? 0})
            </TabsTrigger>
            <TabsTrigger value="transfers" className="flex-1">
              Transfers ({transfers?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <Card className="bg-card border-border/60 shadow-sm">
              <CardContent className="p-4 flex flex-col gap-3">
                {[
                  { icon: Hash, label: "Serial Number", value: equipment.serialNumber },
                  { icon: Package, label: "Model", value: equipment.model },
                  { icon: Package, label: "Manufacturer", value: equipment.manufacturer },
                  { icon: Calendar, label: "Purchase Date", value: formatDate(equipment.purchaseDate) },
                  { icon: MapPin, label: "Location", value: equipment.location },
                  {
                    icon: Clock,
                    label: "Maintenance Interval",
                    value: equipment.maintenanceIntervalDays
                      ? `${equipment.maintenanceIntervalDays} days`
                      : undefined,
                  },
                  {
                    icon: Wrench,
                    label: "Last Maintenance",
                    value: formatDateTime(equipment.lastMaintenanceDate?.toString()),
                  },
                  {
                    icon: Droplets,
                    label: "Last Sterilization",
                    value: formatDateTime(equipment.lastSterilizationDate?.toString()),
                  },
                ]
                  .filter((r) => r.value && r.value !== "—")
                  .map((row, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <row.icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{row.label}</p>
                        <p className="text-sm font-medium">{row.value}</p>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <div className="flex flex-col gap-2">
              {logsLoading ? (
                <>
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </>
              ) : !scanLogs || scanLogs.length === 0 ? (
                <Card className="bg-card border-border/60 shadow-sm">
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground text-sm">No scan history yet</p>
                  </CardContent>
                </Card>
              ) : (
                scanLogs.map((log) => (
                  <Card key={log.id} className="bg-card border-border/60 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={statusToBadgeVariant(log.status)}>
                              {STATUS_LABELS[log.status as keyof typeof STATUS_LABELS] || log.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground truncate">
                              {log.userEmail}
                            </span>
                          </div>
                          {log.note && (
                            <p className="text-xs text-muted-foreground mt-1">{log.note}</p>
                          )}
                          {log.photoUrl && (
                            <img
                              src={log.photoUrl}
                              alt="Issue photo"
                              className="mt-2 rounded-lg w-24 h-24 object-cover border"
                            />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {formatRelativeTime(log.timestamp.toString())}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="transfers">
            <div className="flex flex-col gap-2">
              {transfersLoading ? (
                <>
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                  <Skeleton className="h-16 w-full rounded-xl" />
                </>
              ) : !transfers || transfers.length === 0 ? (
                <Card className="bg-card border-border/60 shadow-sm">
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground text-sm">No transfers recorded</p>
                  </CardContent>
                </Card>
              ) : (
                transfers.map((transfer) => (
                  <Card key={transfer.id} className="bg-card border-border/60 shadow-sm">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <FolderOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                            <span className="text-sm font-medium truncate">
                              {transfer.fromFolderName ?? "—"} → {transfer.toFolderName ?? "—"}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground shrink-0">
                          {formatRelativeTime(transfer.timestamp.toString())}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Update Status dialog */}
      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Status</DialogTitle>
            <DialogDescription>Log status for: {equipment.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["ok", "issue", "maintenance", "sterilized"] as EquipmentStatus[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setScanStatus(s);
                      if (s !== "issue") setNoteError("");
                    }}
                    className={`flex items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                      scanStatus === s
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border hover:border-primary/30"
                    }`}
                    data-testid={`scan-status-${s}`}
                  >
                    {s === "ok" && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                    {s === "issue" && <AlertTriangle className="w-4 h-4 text-red-500" />}
                    {s === "maintenance" && <Wrench className="w-4 h-4 text-amber-500" />}
                    {s === "sterilized" && <Droplets className="w-4 h-4 text-teal-500" />}
                    {STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="note">
                Note
                {scanStatus === "issue" && (
                  <span className="text-red-500 ml-1">*</span>
                )}
                {scanStatus !== "issue" && (
                  <span className="text-muted-foreground text-xs ml-1">(optional)</span>
                )}
              </Label>
              <Textarea
                id="note"
                placeholder={
                  scanStatus === "issue"
                    ? "Describe the issue clearly..."
                    : "Add any observations..."
                }
                value={scanNote}
                onChange={(e) => {
                  setScanNote(e.target.value);
                  if (e.target.value.trim()) setNoteError("");
                }}
                rows={3}
                data-testid="scan-note"
                className={noteError ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {noteError && (
                <p className="text-xs text-red-600 font-medium">{noteError}</p>
              )}
            </div>

            {/* Photo — shown prominently for issues, available for all */}
            {scanStatus === "issue" && (
              <div className="flex flex-col gap-1.5">
                <Label>
                  Photo
                  <span className="text-muted-foreground text-xs ml-1">(strongly recommended)</span>
                </Label>
                {scanPhoto ? (
                  <div className="relative">
                    <img
                      src={scanPhoto}
                      alt="Issue photo"
                      className="w-full h-36 object-cover rounded-xl border-2 border-primary/30"
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-1 right-1 bg-white/80 text-xs"
                      onClick={() => setScanPhoto(null)}
                    >
                      Remove
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="flex flex-col items-center justify-center gap-2 w-full h-24 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:bg-muted/50 transition-colors"
                    data-testid="btn-photo"
                  >
                    <Camera className="w-6 h-6" />
                    <span className="text-sm font-medium">Take / Upload Photo</span>
                  </button>
                )}
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoChange}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setScanDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleScanSubmit}
              disabled={scanMut.isPending}
              data-testid="btn-confirm-scan"
            >
              {scanMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <ClipboardEdit className="w-4 h-4 mr-2" />
              )}
              Log Status
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Report Issue dialog */}
      <Dialog open={reportIssueOpen} onOpenChange={setReportIssueOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Report Issue</DialogTitle>
            <DialogDescription>{equipment.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="report-issue-note">
                Describe the issue
                <span className="text-red-500 ml-1">*</span>
              </Label>
              <Textarea
                id="report-issue-note"
                placeholder="Describe the issue clearly..."
                value={reportIssueNote}
                onChange={(e) => {
                  setReportIssueNote(e.target.value);
                  if (e.target.value.trim()) setReportIssueNoteError("");
                }}
                rows={3}
                data-testid="report-issue-note"
                className={reportIssueNoteError ? "border-red-500 focus-visible:ring-red-500" : ""}
              />
              {reportIssueNoteError && (
                <p className="text-xs text-red-600 font-medium">{reportIssueNoteError}</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                Photo
                <span className="text-muted-foreground text-xs ml-1">(optional)</span>
              </Label>
              {reportIssuePhoto ? (
                <div className="relative">
                  <img
                    src={reportIssuePhoto}
                    alt="Issue photo"
                    className="w-full h-36 object-cover rounded-xl border-2 border-primary/30"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-1 right-1 bg-white/80 text-xs"
                    onClick={() => setReportIssuePhoto(null)}
                  >
                    Remove
                  </Button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => reportIssuePhotoRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 w-full h-24 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:bg-muted/50 transition-colors"
                  data-testid="btn-report-issue-photo"
                >
                  <Camera className="w-6 h-6" />
                  <span className="text-sm font-medium">Take / Upload Photo</span>
                </button>
              )}
              <input
                ref={reportIssuePhotoRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={handleReportIssuePhotoChange}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReportIssueOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleReportIssueSubmit}
              disabled={reportIssueMut.isPending}
              className="bg-red-600 hover:bg-red-700 text-white"
              data-testid="btn-confirm-report-issue"
            >
              {reportIssueMut.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <AlertTriangle className="w-4 h-4 mr-2" />
              )}
              Submit Issue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code dialog */}
      <Dialog open={showQR} onOpenChange={setShowQR}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>QR Code</DialogTitle>
            <DialogDescription>{equipment.name}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            <div className="p-4 bg-white rounded-2xl border-2 border-border">
              <QRCodeSVG value={qrUrl} size={200} level="M" includeMargin={false} />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all">{qrUrl}</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Scan quick-action sheet (opened from QR scanner via ?action=scan) */}
      {scanActionSheetOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 flex flex-col justify-end"
          data-testid="scan-action-sheet"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setScanActionSheetOpen(false);
              setScanActionDone(false);
            }
          }}
        >
          <div className="bg-white rounded-t-3xl px-5 pt-5 pb-8 max-w-2xl mx-auto w-full">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            {!scanActionDone ? (
              <>
                {/* Equipment info */}
                <div className="flex items-start gap-3 mb-5">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-lg leading-tight" data-testid="scan-action-equipment-name">
                      {equipment.name}
                    </p>
                    {equipment.serialNumber && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        #{equipment.serialNumber}
                      </p>
                    )}
                    {equipment.location && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {equipment.location}
                      </p>
                    )}
                  </div>
                  <Badge variant={equipment.status} className="shrink-0 text-xs" data-testid="scan-action-status-badge">
                    {STATUS_LABELS[equipment.status as keyof typeof STATUS_LABELS] || equipment.status}
                  </Badge>
                </div>

                {/* Checkout info if currently out */}
                {isCheckedOut && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4 text-sm">
                    <p className="font-medium text-blue-800">
                      {checkedOutByMe
                        ? "Checked out by you"
                        : `In use by ${equipment.checkedOutByEmail || "another user"}`}
                    </p>
                    {equipment.checkedOutLocation && (
                      <p className="text-blue-700 text-xs mt-0.5">
                        Location: {equipment.checkedOutLocation}
                      </p>
                    )}
                  </div>
                )}

                {/* Quick action buttons */}
                <div className="flex flex-col gap-2.5">
                  {!isCheckedOut && (
                    <Button
                      size="lg"
                      className="w-full gap-2.5"
                      onClick={() => checkoutMut.mutate()}
                      disabled={checkoutMut.isPending || returnMut.isPending}
                      data-testid="btn-scan-action-checkout"
                    >
                      {checkoutMut.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <LogIn className="w-5 h-5" />
                      )}
                      Check Out
                    </Button>
                  )}

                  {isCheckedOut && (checkedOutByMe || isAdmin) && (
                    <Button
                      variant="outline"
                      size="lg"
                      className="w-full gap-2.5"
                      onClick={() => returnMut.mutate()}
                      disabled={returnMut.isPending || checkoutMut.isPending}
                      data-testid="btn-scan-action-return"
                    >
                      {returnMut.isPending ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : (
                        <LogOut className="w-5 h-5" />
                      )}
                      Return
                    </Button>
                  )}

                  {isCheckedOut && !checkedOutByMe && !isAdmin && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm text-amber-800">
                      Only the person who checked this out (or an admin) can return it.
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full gap-2.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                    onClick={() => {
                      setScanActionSheetOpen(false);
                      openScanDialog();
                    }}
                    data-testid="btn-scan-action-report-issue"
                  >
                    <Wrench className="w-5 h-5" />
                    Report Issue / Update Status
                  </Button>

                  <Button
                    variant="ghost"
                    className="w-full text-sm text-muted-foreground"
                    onClick={() => {
                      setScanActionSheetOpen(false);
                      setScanActionDone(false);
                    }}
                    data-testid="btn-scan-action-dismiss"
                  >
                    View Full Details
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center gap-4 py-4 text-center">
                <CheckCircle2 className="w-14 h-14 text-emerald-500" />
                <p className="font-bold text-lg">Done!</p>
                <p className="text-muted-foreground text-sm">Action completed for {equipment.name}.</p>
                <Button
                  className="w-full gap-2"
                  onClick={() => {
                    setScanActionDone(false);
                    navigate("/?scan=1");
                  }}
                  data-testid="btn-scan-another-item"
                >
                  <Scan className="w-4 h-4" />
                  Scan Another Item
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={() => {
                    setScanActionSheetOpen(false);
                    setScanActionDone(false);
                  }}
                >
                  Stay Here
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
