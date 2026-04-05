import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import type { EquipmentStatus } from "@/types";
import {
  ArrowLeft,
  QrCode,
  Scan,
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
  ImageIcon,
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
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { QRCodeSVG } from "qrcode.react";

const STATUS_CONFIG = {
  ok: { icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50" },
  issue: { icon: AlertTriangle, color: "text-red-500", bg: "bg-red-50" },
  maintenance: { icon: Wrench, color: "text-amber-500", bg: "bg-amber-50" },
  sterilized: { icon: Droplets, color: "text-teal-500", bg: "bg-teal-50" },
};

export default function EquipmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { isAdmin, email, userId } = useAuth();
  const queryClient = useQueryClient();
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [scanStatus, setScanStatus] = useState<EquipmentStatus>("ok");
  const [scanNote, setScanNote] = useState("");
  const [scanPhoto, setScanPhoto] = useState<string | null>(null);
  const [noteError, setNoteError] = useState("");
  const [showQR, setShowQR] = useState(false);
  const [checkoutLocation, setCheckoutLocation] = useState("");
  const photoInputRef = useRef<HTMLInputElement>(null);

  const { data: equipment, isLoading } = useQuery({
    queryKey: [`/api/equipment/${id}`],
    queryFn: () => api.equipment.get(id!),
    enabled: !!id,
  });

  const { data: scanLogs } = useQuery({
    queryKey: [`/api/equipment/${id}/logs`],
    queryFn: () => api.equipment.logs(id!),
    enabled: !!id,
  });

  const { data: transfers } = useQuery({
    queryKey: [`/api/equipment/${id}/transfers`],
    queryFn: () => api.equipment.transfers(id!),
    enabled: !!id,
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}`] });
    queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
    queryClient.invalidateQueries({ queryKey: ["/api/equipment/my"] });
  }

  const scanMut = useMutation({
    mutationFn: () =>
      api.equipment.scan(id!, {
        status: scanStatus,
        note: scanNote,
        photoUrl: scanPhoto || undefined,
        userEmail: email || "",
      }),
    onSuccess: ({ equipment: updated }) => {
      queryClient.setQueryData([`/api/equipment/${id}`], updated);
      invalidateAll();
      queryClient.invalidateQueries({ queryKey: [`/api/equipment/${id}/logs`] });
      toast.success(`Status updated to ${STATUS_LABELS[scanStatus]}`);
      setScanDialogOpen(false);
      setScanNote("");
      setScanPhoto(null);
      setNoteError("");

      if (scanStatus === "issue") {
        setTimeout(() => {
          toast("Send WhatsApp alert?", {
            action: {
              label: "Open WhatsApp",
              onClick: () => {
                const waUrl = buildWhatsAppUrl(undefined, updated.name, scanStatus, scanNote);
                window.open(waUrl, "_blank");
              },
            },
          });
        }, 500);
      }
    },
    onError: (err: Error) => toast.error(err.message || "Scan failed"),
  });

  const checkoutMut = useMutation({
    mutationFn: () => api.equipment.checkout(id!, checkoutLocation || undefined),
    onSuccess: (updated) => {
      queryClient.setQueryData([`/api/equipment/${id}`], updated);
      invalidateAll();
      toast.success("Checked out successfully");
      setCheckoutLocation("");
    },
    onError: (err: Error) => toast.error(err.message || "Checkout failed"),
  });

  const returnMut = useMutation({
    mutationFn: () => api.equipment.return(id!),
    onSuccess: (updated) => {
      queryClient.setQueryData([`/api/equipment/${id}`], updated);
      invalidateAll();
      toast.success("Returned — equipment is now available");
    },
    onError: (err: Error) => toast.error(err.message || "Return failed"),
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

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setScanPhoto(ev.target?.result as string);
    reader.readAsDataURL(file);
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
          {isAdmin && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => navigate(`/equipment/${id}/edit`)}
                data-testid="btn-edit"
              >
                <Pencil className="w-4 h-4" />
              </Button>
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
            </div>
          )}
        </div>

        {/* Checkout / Ownership banner */}
        {isCheckedOut ? (
          <Card className="border-2 border-blue-200 bg-blue-50">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <User className="w-4 h-4 text-blue-600 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-blue-900">
                      {checkedOutByMe ? "Checked out by you" : `In use by ${equipment.checkedOutByEmail}`}
                    </p>
                    {equipment.checkedOutLocation && (
                      <p className="text-xs text-blue-700 truncate">
                        {equipment.checkedOutLocation}
                      </p>
                    )}
                    <p className="text-xs text-blue-600">
                      Since {formatRelativeTime(equipment.checkedOutAt)}
                    </p>
                  </div>
                </div>
                {(checkedOutByMe || isAdmin) && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-300 text-blue-700 hover:bg-blue-100 shrink-0"
                    onClick={() => returnMut.mutate()}
                    disabled={returnMut.isPending}
                    data-testid="btn-return"
                  >
                    {returnMut.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <LogOut className="w-4 h-4 mr-1" />
                    )}
                    Return
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-2 border-emerald-200 bg-emerald-50">
            <CardContent className="p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm font-semibold text-emerald-800">Available for use</p>
                </div>
                <Button
                  size="sm"
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                  onClick={() => checkoutMut.mutate()}
                  disabled={checkoutMut.isPending}
                  data-testid="btn-checkout"
                >
                  {checkoutMut.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <LogIn className="w-4 h-4 mr-1" />
                  )}
                  Check Out
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Status card */}
        <Card className={`border-2 ${statusConf?.bg || ""}`}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-white/50 flex items-center justify-center">
                  <StatusIcon className={`w-6 h-6 ${statusConf?.color || ""}`} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Current Status</p>
                  <p className="text-xl font-bold">
                    {STATUS_LABELS[equipment.status as keyof typeof STATUS_LABELS] || equipment.status}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last scan: {formatRelativeTime(equipment.lastSeen?.toString())}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                onClick={openScanDialog}
                data-testid="btn-scan"
                className="shrink-0"
              >
                <Scan className="w-4 h-4 mr-1" />
                Scan
              </Button>
            </div>

            {(overdue || sterilizationDue) && (
              <div className="mt-3 pt-3 border-t border-white/30 flex flex-col gap-1">
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

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setShowQR(true)} data-testid="btn-show-qr">
            <QrCode className="w-4 h-4 mr-2" />
            View QR Code
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              const waUrl = buildWhatsAppUrl(
                undefined,
                equipment.name,
                equipment.status as EquipmentStatus,
                `Status report for ${equipment.name}`
              );
              window.open(waUrl, "_blank");
            }}
            className="text-green-700 border-green-200 hover:bg-green-50"
            data-testid="btn-whatsapp"
          >
            <MessageCircle className="w-4 h-4 mr-2" />
            WhatsApp
          </Button>
        </div>

        {/* Info tabs */}
        <Tabs defaultValue="details">
          <TabsList className="w-full">
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="history" className="flex-1">
              History ({scanLogs?.length ?? 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="details">
            <Card>
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
              {!scanLogs || scanLogs.length === 0 ? (
                <Card>
                  <CardContent className="p-8 text-center">
                    <p className="text-muted-foreground text-sm">No scan history yet</p>
                  </CardContent>
                </Card>
              ) : (
                scanLogs.map((log) => (
                  <Card key={log.id}>
                    <CardContent className="p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant={log.status as any} className="text-[10px]">
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
                        <p className="text-[10px] text-muted-foreground shrink-0">
                          {formatRelativeTime(log.timestamp.toString())}
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

      {/* Scan dialog */}
      <Dialog open={scanDialogOpen} onOpenChange={setScanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan Equipment</DialogTitle>
            <DialogDescription>Update status for: {equipment.name}</DialogDescription>
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
                    className="flex flex-col items-center justify-center gap-2 w-full h-24 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors"
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
                <Scan className="w-4 h-4 mr-2" />
              )}
              Update Status
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
    </Layout>
  );
}
