import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Helmet } from "react-helmet-async";
import { api } from "@/lib/api";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorCard } from "@/components/ui/error-card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  DoorOpen,
  Plus,
  ChevronRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  MapPin,
  Loader2,
  Radar,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import type { CreateRoomRequest, Room } from "@/types";

function SyncBadge({ status }: { status: string }) {
  if (status === "synced") {
    return (
      <div className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-emerald-700 bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/50 dark:border-emerald-800 dark:text-emerald-300 rounded-full px-2 py-0.5 shrink-0">
        <CheckCircle2 className="w-2.5 h-2.5" />
        Synced
      </div>
    );
  }
  if (status === "requires_audit") {
    return (
      <div className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-red-700 bg-red-50 border border-red-200 dark:bg-red-950/50 dark:border-red-800 dark:text-red-300 rounded-full px-2 py-0.5 shrink-0">
        <AlertTriangle className="w-2.5 h-2.5" />
        Audit
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1 text-[10px] font-bold tracking-wide text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-950/50 dark:border-amber-800 dark:text-amber-300 rounded-full px-2 py-0.5 shrink-0">
      <Clock className="w-2.5 h-2.5" />
      Stale
    </div>
  );
}

function RoomCard({ room }: { room: Room }) {
  const available = room.availableCount ?? 0;
  const total = room.totalEquipment ?? 0;
  const inUse = room.inUseCount ?? 0;
  const issues = room.issueCount ?? 0;
  const utilPct = total > 0 ? (available / total) * 100 : 0;

  return (
    <Link href={`/rooms/${room.id}`}>
      <Card className="bg-card border-border/60 shadow-sm hover:shadow-md active:scale-[0.98] transition-all cursor-pointer h-full">
        <CardContent className="p-4 flex flex-col gap-3">
          {/* Top row */}
          <div className="flex items-start justify-between gap-1">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <DoorOpen className="w-5 h-5 text-primary" />
            </div>
            <SyncBadge status={room.syncStatus} />
          </div>

          {/* Room name */}
          <div className="flex-1">
            <p className="font-bold text-sm leading-snug truncate">{room.name}</p>
            {room.floor ? (
              <p className="text-[11px] text-muted-foreground flex items-center gap-0.5 mt-0.5">
                <MapPin className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate">{room.floor}</span>
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground mt-0.5">{total} item{total !== 1 ? "s" : ""}</p>
            )}
          </div>

          {/* Availability */}
          <div>
            <div className="flex items-end justify-between mb-1.5">
              <div>
                <span className="text-xl font-bold text-blue-600 dark:text-blue-400">{available}</span>
                <span className="text-xs text-muted-foreground font-medium">/{total} avail.</span>
              </div>
              {issues > 0 && (
                <span className="flex items-center gap-0.5 text-[10px] font-semibold text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-800 rounded-md px-1.5 py-0.5">
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {issues}
                </span>
              )}
            </div>
            {/* Utilization bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full transition-all duration-500"
                style={{ width: `${utilPct}%` }}
              />
            </div>
            {inUse > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1">{inUse} in use</p>
            )}
          </div>

          <div className="flex justify-end">
            <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function RoomCardSkeleton() {
  return <Skeleton className="h-48 rounded-xl" />;
}

export default function RoomsListPage() {
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [roomName, setRoomName] = useState("");
  const [roomFloor, setRoomFloor] = useState("");

  const { data: rooms, isLoading, isError } = useQuery({
    queryKey: ["/api/rooms"],
    queryFn: api.rooms.list,
    staleTime: 30_000,
  });

  const createMut = useMutation({
    mutationFn: (data: CreateRoomRequest) => api.rooms.create(data),
    onSuccess: (room) => {
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast.success(`"${room.name}" created`);
      setCreateOpen(false);
      setRoomName("");
      setRoomFloor("");
    },
    onError: (err: Error) => toast.error(err.message || "Failed to create room"),
  });

  const handleCreate = () => {
    if (!roomName.trim()) return;
    createMut.mutate({ name: roomName.trim(), floor: roomFloor.trim() || undefined });
  };

  const totalAvailable = rooms?.reduce((a, r) => a + (r.availableCount ?? 0), 0) ?? 0;
  const totalInUse = rooms?.reduce((a, r) => a + (r.inUseCount ?? 0), 0) ?? 0;
  const totalIssues = rooms?.reduce((a, r) => a + (r.issueCount ?? 0), 0) ?? 0;
  const syncedCount = rooms?.filter((r) => r.syncStatus === "synced").length ?? 0;

  return (
    <Layout>
      <Helmet>
        <title>Asset Radar — VetTrack</title>
        <meta name="description" content="Room-by-room equipment inventory. Verify all items in a room with one tap." />
      </Helmet>

      <div className="flex flex-col gap-5 pb-20 animate-fade-in">
        {/* Header */}
        <div className="flex items-start justify-between pt-1 gap-3">
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Radar className="w-4 h-4 text-primary" />
              </div>
              <h1 className="text-2xl font-bold leading-tight">Asset Radar</h1>
            </div>
            <p className="text-sm text-muted-foreground">
              {rooms ? `${rooms.length} room${rooms.length !== 1 ? "s" : ""} · tap a card to inspect` : "Room-by-room inventory"}
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" className="h-11 gap-1.5 shrink-0" onClick={() => setCreateOpen(true)}>
              <Plus className="w-4 h-4" />
              Add Room
            </Button>
          )}
        </div>

        {/* Summary pills */}
        {rooms && rooms.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 rounded-full px-3 py-1.5">
              <span className="font-bold text-sm">{totalAvailable}</span>
              <span className="text-[11px]">Available</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-muted border border-border text-muted-foreground rounded-full px-3 py-1.5">
              <span className="font-bold text-sm">{totalInUse}</span>
              <span className="text-[11px]">In Use</span>
            </div>
            {totalIssues > 0 && (
              <div className="flex items-center gap-1.5 text-xs font-semibold bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-full px-3 py-1.5">
                <AlertTriangle className="w-3 h-3" />
                <span className="font-bold text-sm">{totalIssues}</span>
                <span className="text-[11px]">Issue{totalIssues !== 1 ? "s" : ""}</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 rounded-full px-3 py-1.5">
              <CheckCircle2 className="w-3 h-3" />
              <span className="font-bold text-sm">{syncedCount}/{rooms.length}</span>
              <span className="text-[11px]">Synced</span>
            </div>
          </div>
        )}

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => <RoomCardSkeleton key={i} />)}
          </div>
        ) : isError ? (
          <ErrorCard message="Failed to load rooms" />
        ) : !rooms || rooms.length === 0 ? (
          <EmptyState
            icon={DoorOpen}
            message="No rooms yet"
            subMessage={
              isAdmin
                ? "Create your first room to start organising equipment by location."
                : "No rooms have been created yet. Ask an admin to set them up."
            }
            action={
              isAdmin ? (
                <Button size="sm" onClick={() => setCreateOpen(true)} className="gap-2 h-11">
                  <Plus className="w-4 h-4" />
                  Add First Room
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {rooms.map((room) => (
              <RoomCard key={room.id} room={room} />
            ))}
          </div>
        )}
      </div>

      {/* Create Room dialog */}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) { setRoomName(""); setRoomFloor(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Room</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="room-name">Room Name *</Label>
              <Input
                id="room-name"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="e.g. Surgery A"
                autoFocus
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="room-floor">Floor / Area (optional)</Label>
              <Input
                id="room-floor"
                value={roomFloor}
                onChange={(e) => setRoomFloor(e.target.value)}
                placeholder="e.g. Level 2"
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!roomName.trim() || createMut.isPending}
              className="gap-2"
            >
              {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Create Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
