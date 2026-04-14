import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { DoorOpen, Check, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import type { Equipment } from "@/types";
import { t } from "@/lib/i18n";

interface MoveRoomSheetProps {
  equipment: Equipment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onMoved?: (newRoomId: string | null) => void;
}

export function MoveRoomSheet({ equipment, open, onOpenChange, onMoved }: MoveRoomSheetProps) {
  const queryClient = useQueryClient();
  const [movingToId, setMovingToId] = useState<string | null | "none">(null);

  const { data: rooms } = useQuery({
    queryKey: ["/api/rooms"],
    queryFn: api.rooms.list,
    staleTime: 60_000,
  });

  const moveMut = useMutation({
    mutationFn: (roomId: string | null) => api.equipment.update(equipment.id, { roomId }),
    onSuccess: (_, roomId) => {
      const room = rooms?.find((r) => r.id === roomId);
      queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rooms"] });
      toast.success(roomId ? t.moveRoom.toast.movedTo(room?.name ?? t.moveRoom.toast.defaultRoomName) : t.moveRoom.toast.removedFromRoom);
      setMovingToId(null);
      onOpenChange(false);
      onMoved?.(roomId);
    },
    onError: () => {
      toast.error(t.moveRoom.toast.moveFailed);
      setMovingToId(null);
    },
  });

  const handleMove = (roomId: string | null) => {
    const key = roomId ?? "none";
    setMovingToId(key);
    moveMut.mutate(roomId);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl max-h-[75vh] overflow-y-auto">
        <SheetHeader className="pb-3 border-b border-border/60 mb-2">
          <SheetTitle className="text-base">Move to Room</SheetTitle>
          <p className="text-xs text-muted-foreground truncate">{equipment.name}</p>
        </SheetHeader>

        <div className="flex flex-col gap-0.5 pb-safe">
          {/* Unassign option */}
          <button
            onClick={() => !moveMut.isPending && equipment.roomId && handleMove(null)}
            disabled={moveMut.isPending || !equipment.roomId}
            className={`flex items-center justify-between gap-3 w-full px-3 py-3 rounded-xl transition-colors min-h-[52px] text-left ${
              !equipment.roomId ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
            } disabled:opacity-50`}
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <X className="w-4 h-4 text-muted-foreground" />
              </div>
              <span className="text-sm font-medium">No Room (Unassigned)</span>
            </div>
            {movingToId === "none" ? (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
            ) : !equipment.roomId ? (
              <Check className="w-4 h-4 text-primary shrink-0" />
            ) : null}
          </button>

          {rooms?.map((room) => {
            const isCurrent = room.id === equipment.roomId;
            const isMoving = movingToId === room.id;
            return (
              <button
                key={room.id}
                onClick={() => !moveMut.isPending && !isCurrent && handleMove(room.id)}
                disabled={moveMut.isPending || isCurrent}
                className={`flex items-center justify-between gap-3 w-full px-3 py-3 rounded-xl transition-colors min-h-[52px] text-left ${
                  isCurrent ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                } disabled:opacity-60`}
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isCurrent ? "bg-primary/20" : "bg-muted"}`}>
                    <DoorOpen className={`w-4 h-4 ${isCurrent ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{room.name}</p>
                    {room.floor && (
                      <p className="text-[11px] text-muted-foreground truncate">{room.floor}</p>
                    )}
                  </div>
                </div>
                {isMoving ? (
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground shrink-0" />
                ) : isCurrent ? (
                  <Check className="w-4 h-4 text-primary shrink-0" />
                ) : null}
              </button>
            );
          })}

          {!rooms && (
            <p className="text-sm text-muted-foreground text-center py-6">Loading rooms…</p>
          )}
          {rooms?.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">No rooms created yet</p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
