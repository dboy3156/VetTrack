import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { MoveRoomSheet } from "@/components/move-room-sheet";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  AlertTriangle,
  DoorOpen,
  Package,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  ShieldCheck,
  MapPin,
  MoveRight,
  Eye,
  EyeOff,
  Radar,
  Activity,
  User,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { statusToBadgeVariant } from "@/lib/design-tokens";
import { STATUS_LABELS } from "@/types";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Equipment, Room, RoomActivityEntry } from "@/types";

function toInitials(name: string | null | undefined): string {
  if (!name?.trim()) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase() + ".";
  return parts[0][0].toUpperCase() + "." + parts[parts.length - 1][0].toUpperCase() + ".";
}

function activityActionLabel(entry: RoomActivityEntry): string {
  if (entry.note?.startsWith("Room verified:")) return "verified (room reset)";
  if (entry.status === "ok") return "scanned — OK";
  if (entry.status === "issue") return "flagged issue on";
  if (entry.status === "maintenance") return "logged maintenance for";
  return `scanned (${entry.status})`;
}

function SyncBadge({ status }: { status: string }) {
  if (status === "synced") {
    return (
      <div className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300 rounded-full px-2.5 py-1">
        <CheckCircle2 className="w-3 h-3" />
        Synced
      </div>
    );
  }
  if (status === "requires_audit") {
    return (
      <div className="flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-50 border border-red-200 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300 rounded-full px-2.5 py-1">
        <AlertTriangle className="w-3 h-3" />
        Needs Audit
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300 rounded-full px-2.5 py-1">
      <Clock className="w-3 h-3" />
      Stale
    </div>
  );
}

function AvailabilityPill({ checkedOut }: { checkedOut: boolean }) {
  if (checkedOut) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-muted-foreground bg-muted border border-border rounded-full px-2 py-0.5">
        In Use
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-full px-2 py-0.5">
      Available
    </span>
  );
}

interface RadarEquipmentCardProps {
  equipment: Equipment;
  justVerified?: boolean;
}

function RadarEquipmentCard({ equipment: eq, justVerified }: RadarEquipmentCardProps) {
  const [moveOpen, setMoveOpen] = useState(false);
  const queryClient = useQueryClient();
  const isCheckedOut = !!eq.checkedOutById;
  const statusVariant = statusToBadgeVariant(eq.status);

  const verifierInitials = justVerified ? null : toInitials(eq.lastVerifiedByName);
  const verifiedLabel = justVerified
    ? "Verified just now"
    : eq.lastVerifiedAt
    ? `Verified ${formatRelativeTime(eq.lastVerifiedAt)}${verifierInitials ? ` · ${verifierInitials}` : ""}`
    : null;

  return (
    <>
      <Card
        className={cn(
          "border-border/60 shadow-sm transition-all",
          justVerified && "border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20"
        )}
        data-testid={`radar-item-${eq.id}`}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            {/* Icon */}
            {eq.imageUrl ? (
              <img
                src={eq.imageUrl}
                alt={eq.name}
                className="w-10 h-10 rounded-lg object-cover shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <Package className="w-5 h-5 text-muted-foreground" />
              </div>
            )}

            {/* Main info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/equipment/${eq.id}`}>
                  <p className="font-bold text-sm truncate leading-snug hover:text-primary transition-colors">
                    {eq.name}
                  </p>
                </Link>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <AvailabilityPill checkedOut={isCheckedOut} />
                <Badge variant={statusVariant} className="text-[10px] py-0 px-2 h-5">
                  {STATUS_LABELS[eq.status as keyof typeof STATUS_LABELS] ?? eq.status}
                </Badge>
              </div>
              {verifiedLabel ? (
                <p className={cn(
                  "text-[10px] mt-1 flex items-center gap-1",
                  justVerified ? "text-emerald-600 dark:text-emerald-400 font-semibold" : "text-muted-foreground"
                )}>
                  {justVerified && <CheckCircle2 className="w-2.5 h-2.5" />}
                  {verifiedLabel}
                </p>
              ) : (
                <p className="text-[10px] text-muted-foreground/60 mt-1">Not yet verified</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMoveOpen(true); }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-border text-[11px] font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-colors min-h-[36px]"
                title={`Move ${eq.name} to a different room`}
              >
                <MoveRight className="w-3 h-3" />
                Move
              </button>
              <Link href={`/equipment/${eq.id}`}>
                <div className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <ChevronRight className="w-4 h-4 text-muted-foreground" />
                </div>
              </Link>
            </div>
          </div>
        </CardContent>
      </Card>

      <MoveRoomSheet
        equipment={eq}
        open={moveOpen}
        onOpenChange={setMoveOpen}
        onMoved={() => {
          queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
          queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
        }}
      />
    </>
  );
}

export default function RoomRadarPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const [availableOnly, setAvailableOnly] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [verifyState, setVerifyState] = useState<"idle" | "verifying" | "done">("idle");
  const [verifiedCount, setVerifiedCount] = useState(0);
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => { if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current); };
  }, []);

  const { data: activityEntries, isLoading: activityLoading } = useQuery({
    queryKey: ["/api/rooms", id, "activity"],
    queryFn: () => api.rooms.activity(id!),
    enabled: !!id && activityOpen,
    staleTime: 30_000,
  });

  const { data: room, isLoading: roomLoading } = useQuery({
    queryKey: ["/api/rooms", id],
    queryFn: () => api.rooms.get(id!),
    enabled: !!id,
    staleTime: 15_000,
  });

  const { data: allEquipment, isLoading: equipLoading } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
    staleTime: 30_000,
  });

  const roomEquipment = allEquipment?.filter((e) => e.roomId === id) ?? [];

  const filtered = availableOnly
    ? roomEquipment.filter((e) => !e.checkedOutById)
    : roomEquipment;

  const availableCount = roomEquipment.filter((e) => !e.checkedOutById).length;
  const inUseCount = roomEquipment.filter((e) => !!e.checkedOutById).length;
  const issueCount = roomEquipment.filter((e) => e.status === "issue" || e.status === "maintenance").length;

  const verifyMut = useMutation({
    mutationFn: () => api.rooms.bulkVerify(id!),
    onSuccess: (result) => {
      setVerifiedCount(result.affected);
      setVerifyState("done");
      navigator.vibrate?.([50, 30, 100]);
      queryClient.invalidateQueries({ queryKey: ["/api/rooms", id] });
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      verifyTimerRef.current = setTimeout(() => {
        setVerifyState("idle");
      }, 4000);
    },
    onError: (err: Error) => {
      setVerifyState("idle");
      toast.error(err.message || "Verification failed");
    },
  });

  const handleVerifyAll = () => {
    if (verifyState !== "idle") return;
    setVerifyState("verifying");
    verifyMut.mutate();
  };

  const isLoading = roomLoading || equipLoading;

  return (
    <Layout>
      <Helmet>
        <title>{room ? `${room.name} — Asset Radar` : "Asset Radar"} — VetTrack</title>
      </Helmet>

      <div className="flex flex-col gap-5 pb-20 animate-fade-in">
        {/* Back + Header */}
        <div className="pt-1">
          <Link href="/rooms">
            <button className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3 -ml-1">
              <ArrowLeft className="w-4 h-4" />
              All Rooms
            </button>
          </Link>

          {roomLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-7 w-40" />
              <Skeleton className="h-5 w-28" />
            </div>
          ) : room ? (
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold leading-tight">{room.name}</h1>
                  <SyncBadge status={room.syncStatus} />
                </div>
                {room.floor && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />
                    {room.floor}
                  </p>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Stats row */}
        {!isLoading && roomEquipment.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-full px-3 py-1.5">
              <span className="font-bold">{availableCount}</span>
              <span className="text-[11px]">Available</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-muted border border-border text-muted-foreground rounded-full px-3 py-1.5">
              <span className="font-bold">{inUseCount}</span>
              <span className="text-[11px]">In Use</span>
            </div>
            {issueCount > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-full px-3 py-1.5">
                <AlertTriangle className="w-3 h-3" />
                <span className="font-bold">{issueCount}</span>
                <span className="text-[11px]">Issue{issueCount !== 1 ? "s" : ""}</span>
              </div>
            )}
          </div>
        )}

        {/* Controls row: filter toggle + verify all */}
        {!isLoading && roomEquipment.length > 0 && (
          <div className="flex items-center gap-3">
            {/* Available-only toggle */}
            <button
              onClick={() => setAvailableOnly((v) => !v)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all min-h-[44px]",
                availableOnly
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-card text-foreground border-border hover:bg-muted"
              )}
            >
              {availableOnly ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              Available Only
            </button>

            {/* Verify all button */}
            <button
              onClick={handleVerifyAll}
              disabled={verifyState !== "idle"}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all min-h-[44px] border",
                verifyState === "done"
                  ? "bg-emerald-600 text-white border-emerald-600 shadow-md"
                  : "bg-primary text-primary-foreground border-primary hover:bg-primary/90 active:scale-[0.98] shadow-sm"
              )}
            >
              {verifyState === "verifying" ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Verifying…
                </>
              ) : verifyState === "done" ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  {verifiedCount} Item{verifiedCount !== 1 ? "s" : ""} Verified
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Verify All in {room?.name ?? "Room"}
                </>
              )}
            </button>
          </div>
        )}

        {/* Equipment list */}
        {isLoading ? (
          <div className="flex flex-col gap-3">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        ) : roomEquipment.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            message="No equipment in this room"
            subMessage="Assign equipment to this room using the Move button on any equipment card."
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={Radar}
            message="No available equipment"
            subMessage="All items in this room are currently checked out."
            action={
              <Button variant="outline" size="sm" onClick={() => setAvailableOnly(false)}>
                Show All Items
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((eq) => (
              <RadarEquipmentCard
                key={eq.id}
                equipment={eq}
                justVerified={verifyState === "done"}
              />
            ))}
          </div>
        )}

        {/* Filter hint when active */}
        {availableOnly && roomEquipment.length > 0 && filtered.length < roomEquipment.length && (
          <p className="text-xs text-center text-muted-foreground">
            Showing {filtered.length} of {roomEquipment.length} items ·{" "}
            <button className="text-primary font-medium" onClick={() => setAvailableOnly(false)}>
              Show all
            </button>
          </p>
        )}

        {/* Activity Feed — collapsible */}
        {!isLoading && (
          <div className="border border-border/60 rounded-xl overflow-hidden">
            <button
              onClick={() => setActivityOpen((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-3 bg-muted/50 hover:bg-muted transition-colors text-left"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">Room Activity</span>
                <span className="text-[10px] font-medium text-muted-foreground bg-background border border-border rounded-full px-2 py-0.5">
                  Last 5 scans
                </span>
              </div>
              {activityOpen
                ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                : <ChevronDown className="w-4 h-4 text-muted-foreground" />
              }
            </button>

            {activityOpen && (
              <div className="divide-y divide-border/60 bg-card">
                {activityLoading ? (
                  <div className="flex flex-col gap-3 p-4">
                    {[...Array(3)].map((_, i) => (
                      <Skeleton key={i} className="h-10 rounded-lg" />
                    ))}
                  </div>
                ) : !activityEntries || activityEntries.length === 0 ? (
                  <div className="px-4 py-6 text-center">
                    <p className="text-sm text-muted-foreground">No scan activity for this room yet.</p>
                  </div>
                ) : (
                  activityEntries.map((entry) => {
                    const name = entry.userName || entry.userEmail.split("@")[0];
                    const initials = toInitials(entry.userName || name);
                    const action = activityActionLabel(entry);
                    return (
                      <div key={entry.id} className="flex items-start gap-3 px-4 py-3">
                        {/* Avatar */}
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-primary">{initials}</span>
                        </div>
                        {/* Text */}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs leading-snug text-foreground">
                            <span className="font-semibold">{name}</span>
                            {" "}<span className="text-muted-foreground">{action}</span>
                            {entry.equipmentName && !entry.note?.startsWith("Room verified:") && (
                              <>{" "}<span className="font-medium">{entry.equipmentName}</span></>
                            )}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {formatRelativeTime(entry.timestamp)}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
