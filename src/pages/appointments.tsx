import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Plus, XCircle, CheckCircle2 } from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/api";
import type { Appointment, AppointmentStatus } from "@/types";
import { toast } from "sonner";

function todayIsoDate(): string {
  const now = new Date();
  return now.toISOString().slice(0, 10);
}

function toLocalDateTimeInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function statusBadgeVariant(status: AppointmentStatus): "default" | "secondary" | "issue" | "maintenance" {
  if (status === "completed") return "default";
  if (status === "cancelled") return "issue";
  if (status === "no_show") return "maintenance";
  return "secondary";
}

function parseApiErrorMessage(error: Error): string {
  if (error.message === "APPOINTMENT_CONFLICT") {
    return "This vet already has an overlapping appointment in that slot.";
  }
  if (error.message === "TIMEZONE_REQUIRED") {
    return "Time input must include timezone information.";
  }
  return error.message;
}

export default function AppointmentsPage() {
  const queryClient = useQueryClient();
  const [day, setDay] = useState<string>(todayIsoDate());
  const [vetId, setVetId] = useState<string>("");
  const [animalId, setAnimalId] = useState<string>("");
  const [ownerId, setOwnerId] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [startLocal, setStartLocal] = useState<string>(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 60 * 1000);
    return toLocalDateTimeInputValue(end);
  });
  const [endLocal, setEndLocal] = useState<string>(() => {
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    return toLocalDateTimeInputValue(end);
  });

  const meQuery = useQuery({
    queryKey: ["/api/users/me"],
    queryFn: api.users.me,
  });

  useEffect(() => {
    if (!vetId && meQuery.data?.id) {
      setVetId(meQuery.data.id);
    }
  }, [meQuery.data?.id, vetId]);

  const listQuery = useQuery({
    queryKey: ["/api/appointments", day],
    queryFn: () => api.appointments.list({ day }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      api.appointments.create({
        vetId: vetId.trim(),
        animalId: animalId.trim() || null,
        ownerId: ownerId.trim() || null,
        startTime: new Date(startLocal).toISOString(),
        endTime: new Date(endLocal).toISOString(),
        notes: notes.trim() || null,
        status: "scheduled",
      }),
    onSuccess: () => {
      toast.success("Appointment created");
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setNotes("");
    },
    onError: (error: Error) => {
      toast.error(parseApiErrorMessage(error));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      api.appointments.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error: Error) => {
      toast.error(parseApiErrorMessage(error));
    },
  });

  const sorted = useMemo(() => {
    return [...(listQuery.data ?? [])].sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
  }, [listQuery.data]);

  return (
    <Layout title="Appointments">
      <div className="flex flex-col gap-4 pb-24">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-6 h-6" />
            Appointments
          </h1>
          <p className="text-sm text-muted-foreground">Day view scheduling with overlap protection.</p>
        </div>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Quick Add
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Day</label>
              <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Vet ID</label>
              <Input value={vetId} onChange={(e) => setVetId(e.target.value)} placeholder="Vet user id" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Start (local)</label>
              <Input type="datetime-local" value={startLocal} onChange={(e) => setStartLocal(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End (local)</label>
              <Input type="datetime-local" value={endLocal} onChange={(e) => setEndLocal(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Animal ID (optional)</label>
              <Input value={animalId} onChange={(e) => setAnimalId(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Owner ID (optional)</label>
              <Input value={ownerId} onChange={(e) => setOwnerId(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Notes (optional)</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="md:col-span-2">
              <Button
                className="w-full"
                onClick={() => createMutation.mutate()}
                disabled={createMutation.isPending || !vetId || !startLocal || !endLocal}
              >
                {createMutation.isPending ? "Saving..." : "Create Appointment"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Clock3 className="w-4 h-4" />
              Day View
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading appointments...</p>
            ) : sorted.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments for this day.</p>
            ) : (
              sorted.map((appointment: Appointment) => {
                const start = new Date(appointment.startTime);
                const end = new Date(appointment.endTime);
                return (
                  <div key={appointment.id} className="rounded-lg border p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium">
                        {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} -{" "}
                        {end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <Badge variant={statusBadgeVariant(appointment.status)}>{appointment.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Vet: {appointment.vetId} | Animal: {appointment.animalId ?? "N/A"} | Owner: {appointment.ownerId ?? "N/A"}
                    </div>
                    {appointment.notes ? <div className="text-xs">{appointment.notes}</div> : null}
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "completed" })}
                        disabled={appointment.status === "completed" || updateStatusMutation.isPending}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Mark Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: "cancelled" })}
                        disabled={appointment.status === "cancelled" || updateStatusMutation.isPending}
                      >
                        <XCircle className="w-3.5 h-3.5 mr-1" />
                        Cancel
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
