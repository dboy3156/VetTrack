import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Clock3, Plus } from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { Appointment, AppointmentStatus, CreateAppointmentRequest } from "@/types";
import { toast } from "sonner";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const SLOT_MINUTES = 15;
const PIXELS_PER_MINUTE = 1.2;
const HOUR_ROW_HEIGHT = 60;

const DURATION_PRESETS = [
  { key: "checkup", label: "Checkup (20m)", minutes: 20 },
  { key: "vaccination", label: "Vaccination (15m)", minutes: 15 },
  { key: "surgery", label: "Surgery (60m)", minutes: 60 },
  { key: "consult", label: "Consult (30m)", minutes: 30 },
] as const;

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: "bg-blue-100 border-blue-300 text-blue-900",
  arrived: "bg-cyan-100 border-cyan-300 text-cyan-900",
  in_progress: "bg-amber-100 border-amber-300 text-amber-900",
  completed: "bg-emerald-100 border-emerald-300 text-emerald-900",
  cancelled: "bg-rose-100 border-rose-300 text-rose-900",
  no_show: "bg-zinc-200 border-zinc-400 text-zinc-900",
};

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

function dateAtLocalDay(dayIso: string, hour: number, minute: number): Date {
  return new Date(`${dayIso}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`);
}

function minutesSinceDayStart(dayIso: string, date: Date): number {
  const dayStart = dateAtLocalDay(dayIso, DAY_START_HOUR, 0).getTime();
  return Math.max(0, Math.floor((date.getTime() - dayStart) / 60000));
}

function formatTimeHHMM(date: Date): string {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function statusActions(status: AppointmentStatus): AppointmentStatus[] {
  if (status === "scheduled") return ["arrived", "in_progress", "completed", "cancelled", "no_show"];
  if (status === "arrived") return ["in_progress", "completed", "cancelled", "no_show"];
  if (status === "in_progress") return ["completed", "cancelled"];
  return [];
}

function toErrorMessage(err: Error): string {
  if (err.message === "APPOINTMENT_CONFLICT") return "This technician already has an overlapping task.";
  if (err.message === "OUTSIDE_SHIFT") return "Selected time is outside the technician shift.";
  if (err.message === "OVERRIDE_REASON_REQUIRED") return "Conflict override requires a reason.";
  if (err.message === "TIMEZONE_REQUIRED") return "Time input must include timezone information.";
  return err.message;
}

export default function AppointmentsPage() {
  const queryClient = useQueryClient();
  const [day, setDay] = useState<string>(todayIsoDate());
  const [selectedVetId, setSelectedVetId] = useState<string>("");
  const [bookingOpen, setBookingOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const [pendingConflictPayload, setPendingConflictPayload] = useState<CreateAppointmentRequest | null>(null);
  const [conflictReason, setConflictReason] = useState("");

  const [formVetId, setFormVetId] = useState("");
  const [formAnimalId, setFormAnimalId] = useState("");
  const [formOwnerId, setFormOwnerId] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formStartLocal, setFormStartLocal] = useState<string>(() => toLocalDateTimeInputValue(new Date()));
  const [formEndLocal, setFormEndLocal] = useState<string>(() => toLocalDateTimeInputValue(new Date(Date.now() + 20 * 60 * 1000)));
  const [selectedDuration, setSelectedDuration] = useState<number>(20);
  const [manualEndOverride, setManualEndOverride] = useState(false);

  const meQuery = useQuery({
    queryKey: ["/api/users/me"],
    queryFn: api.users.me,
  });

  const metaQuery = useQuery({
    queryKey: ["/api/appointments/meta", day],
    queryFn: () => api.appointments.meta(day),
  });

  useEffect(() => {
    if (!selectedVetId && meQuery.data?.id) {
      setSelectedVetId(meQuery.data.id);
    }
    if (!formVetId && meQuery.data?.id) {
      setFormVetId(meQuery.data.id);
    }
  }, [meQuery.data?.id, selectedVetId, formVetId]);

  useEffect(() => {
    if (!manualEndOverride) {
      const computedEnd = new Date(new Date(formStartLocal).getTime() + selectedDuration * 60 * 1000);
      setFormEndLocal(toLocalDateTimeInputValue(computedEnd));
    }
  }, [formStartLocal, selectedDuration, manualEndOverride]);

  const listQuery = useQuery({
    queryKey: ["/api/appointments", day],
    queryFn: () => api.appointments.list({ day }),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateAppointmentRequest) => api.appointments.create(payload),
    onSuccess: () => {
      toast.success("Task created");
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setBookingOpen(false);
      setFormNotes("");
      setFormAnimalId("");
      setFormOwnerId("");
    },
    onError: (error: Error) => {
      if (error.message === "APPOINTMENT_CONFLICT") {
        const payload: CreateAppointmentRequest = {
          vetId: formVetId.trim(),
          animalId: formAnimalId.trim() || null,
          ownerId: formOwnerId.trim() || null,
          startTime: new Date(formStartLocal).toISOString(),
          endTime: new Date(formEndLocal).toISOString(),
          notes: formNotes.trim() || null,
          status: "scheduled",
        };
        setPendingConflictPayload(payload);
        setConflictReason("");
        setConflictOpen(true);
        return;
      }
      toast.error(toErrorMessage(error));
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: AppointmentStatus }) =>
      api.appointments.update(id, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
    },
    onError: (error: Error) => {
      toast.error(toErrorMessage(error));
    },
  });

  const filteredAppointments = useMemo(() => {
    const all = [...(listQuery.data ?? [])].sort((a, b) => {
      return new Date(a.startTime).getTime() - new Date(b.startTime).getTime();
    });
    if (!selectedVetId) return all;
    return all.filter((appointment) => appointment.vetId === selectedVetId);
  }, [listQuery.data, selectedVetId]);

  const appointmentBlocks = useMemo(() => {
    return filteredAppointments.map((appointment) => {
      const start = new Date(appointment.startTime);
      const end = new Date(appointment.endTime);
      const top = minutesSinceDayStart(day, start) * PIXELS_PER_MINUTE;
      const height = Math.max(24, (end.getTime() - start.getTime()) / 60000 * PIXELS_PER_MINUTE);
      return { appointment, top, height, start, end };
    });
  }, [filteredAppointments, day]);

  const totalGridMinutes = (DAY_END_HOUR - DAY_START_HOUR) * 60;
  const totalGridHeight = totalGridMinutes * PIXELS_PER_MINUTE;

  const slotStarts = useMemo(() => {
    const slots: Date[] = [];
    for (let mins = DAY_START_HOUR * 60; mins < DAY_END_HOUR * 60; mins += SLOT_MINUTES) {
      slots.push(dateAtLocalDay(day, Math.floor(mins / 60), mins % 60));
    }
    return slots;
  }, [day]);

  const selectedVetMeta = useMemo(
    () => metaQuery.data?.vets.find((vet) => vet.id === selectedVetId) ?? null,
    [metaQuery.data?.vets, selectedVetId],
  );

  const availableIntervals = useMemo(() => {
    const shifts = selectedVetMeta?.shifts ?? [];
    return shifts.map((shift) => ({
      start: shift.startTime.slice(0, 5),
      end: shift.endTime.slice(0, 5),
    }));
  }, [selectedVetMeta?.shifts]);

  const slotAvailability = useMemo(() => {
    if (!selectedVetId) {
      return slotStarts.map((slot) => ({ slot, available: true }));
    }
    return slotStarts.map((slot) => {
      const hhmm = `${String(slot.getHours()).padStart(2, "0")}:${String(slot.getMinutes()).padStart(2, "0")}`;
      const available = availableIntervals.some((window) => hhmm >= window.start && hhmm < window.end);
      return { slot, available };
    });
  }, [slotStarts, availableIntervals, selectedVetId]);

  function openQuickBooking(slotDate: Date) {
    const start = slotDate;
    const end = new Date(start.getTime() + selectedDuration * 60 * 1000);
    setFormStartLocal(toLocalDateTimeInputValue(start));
    setFormEndLocal(toLocalDateTimeInputValue(end));
    setManualEndOverride(false);
    setFormVetId(selectedVetId || formVetId || meQuery.data?.id || "");
    setBookingOpen(true);
  }

  function submitCreate(conflictOverride = false, overrideReason?: string) {
    const payload: CreateAppointmentRequest = {
      vetId: formVetId.trim(),
      animalId: formAnimalId.trim() || null,
      ownerId: formOwnerId.trim() || null,
      startTime: new Date(formStartLocal).toISOString(),
      endTime: new Date(formEndLocal).toISOString(),
      notes: formNotes.trim() || null,
      status: "scheduled",
      conflictOverride,
      overrideReason: overrideReason?.trim() || null,
    };
    createMutation.mutate(payload);
  }

  return (
    <Layout title="Tasks">
      <div className="flex flex-col gap-4 pb-24">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-6 h-6" />
            Tasks
          </h1>
          <p className="text-sm text-muted-foreground">Calendar workflow with shift-aware, conflict-safe booking.</p>
        </div>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Booking Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground">Day</label>
              <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Technician</label>
              <select
                value={selectedVetId}
                onChange={(e) => setSelectedVetId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">All technicians</option>
                {(metaQuery.data?.vets ?? []).map((vet) => (
                  <option key={vet.id} value={vet.id}>
                    {vet.displayName || vet.name || vet.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Hours</label>
              <div className="h-10 px-3 rounded-md border flex items-center text-sm">
                {DAY_START_HOUR}:00 - {DAY_END_HOUR}:00
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Interval</label>
              <div className="h-10 px-3 rounded-md border flex items-center text-sm">{SLOT_MINUTES} min</div>
            </div>
            <div>
              <Button className="w-full" onClick={() => openQuickBooking(new Date())}>
                <Plus className="w-4 h-4 mr-1" />
                Fast Book
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
          <CardContent className="space-y-3">
            {selectedVetMeta ? (
              <div className="text-xs text-muted-foreground">
                Shift windows for {selectedVetMeta.displayName || selectedVetMeta.name}:{" "}
                {selectedVetMeta.shifts.length > 0
                  ? selectedVetMeta.shifts.map((s) => `${s.startTime.slice(0, 5)}-${s.endTime.slice(0, 5)}`).join(", ")
                  : "No shift imported for this day"}
              </div>
            ) : null}
            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading tasks...</p>
            ) : (
              <div className="relative border rounded-xl overflow-hidden">
                <div className="max-h-[70vh] overflow-auto">
                  <div className="relative" style={{ height: `${Math.max(totalGridHeight, HOUR_ROW_HEIGHT * (DAY_END_HOUR - DAY_START_HOUR))}px` }}>
                    {Array.from({ length: DAY_END_HOUR - DAY_START_HOUR + 1 }).map((_, idx) => {
                      const hour = DAY_START_HOUR + idx;
                      const y = idx * 60 * PIXELS_PER_MINUTE;
                      return (
                        <div key={hour} className="absolute left-0 right-0 border-t border-dashed border-border/70" style={{ top: y }}>
                          <span className="absolute -top-2 left-2 text-[10px] text-muted-foreground bg-background px-1">
                            {String(hour).padStart(2, "0")}:00
                          </span>
                        </div>
                      );
                    })}

                    {slotAvailability.map(({ slot, available }) => {
                      const top = minutesSinceDayStart(day, slot) * PIXELS_PER_MINUTE;
                      return (
                        <button
                          key={slot.toISOString()}
                          type="button"
                          disabled={!available}
                          onClick={() => openQuickBooking(slot)}
                          className={`absolute left-0 right-0 text-left px-3 border-t ${
                            available
                              ? "hover:bg-emerald-50/60 focus:bg-emerald-50/80"
                              : "bg-muted/40 cursor-not-allowed"
                          }`}
                          style={{ top, height: SLOT_MINUTES * PIXELS_PER_MINUTE }}
                          aria-label={`Book ${formatTimeHHMM(slot)}`}
                        />
                      );
                    })}

                    {appointmentBlocks.map(({ appointment, top, height, start, end }) => (
                      <div
                        key={appointment.id}
                        className={`absolute left-24 right-3 rounded-lg border shadow-sm p-2 ${STATUS_COLORS[appointment.status]}`}
                        style={{ top: top + 1, height }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold">
                            {formatTimeHHMM(start)} - {formatTimeHHMM(end)}
                          </div>
                          <Badge variant="secondary" className="text-[10px]">
                            {appointment.status}
                          </Badge>
                        </div>
                        <div className="text-[11px] mt-1 truncate">
                          Animal: {appointment.animalId ?? "N/A"} | Technician: {appointment.vetId}
                        </div>
                        {appointment.conflictOverride ? (
                          <div className="text-[10px] mt-1 font-medium">Conflict override</div>
                        ) : null}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {statusActions(appointment.status).map((nextStatus) => (
                            <Button
                              key={`${appointment.id}-${nextStatus}`}
                              size="sm"
                              variant="outline"
                              className="h-6 text-[10px] px-2"
                              onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: nextStatus })}
                              disabled={updateStatusMutation.isPending}
                            >
                              {nextStatus}
                            </Button>
                          ))}
                        </div>
                      </div>
                    ))}

                    {appointmentBlocks.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                        No tasks for this day.
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={bookingOpen} onOpenChange={setBookingOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fast Booking</DialogTitle>
            <DialogDescription>Clicking an empty slot prefills time and duration.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">Technician (required)</label>
              <select
                value={formVetId}
                onChange={(e) => setFormVetId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value="">Select technician</option>
                {(metaQuery.data?.vets ?? []).map((vet) => (
                  <option key={vet.id} value={vet.id}>
                    {vet.displayName || vet.name || vet.id}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Animal ID (required)</label>
              <Input value={formAnimalId} onChange={(e) => setFormAnimalId(e.target.value)} placeholder="animal id" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Owner ID (optional)</label>
              <Input value={formOwnerId} onChange={(e) => setFormOwnerId(e.target.value)} placeholder="owner id" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Duration preset</label>
              <select
                value={String(selectedDuration)}
                onChange={(e) => {
                  setSelectedDuration(Number.parseInt(e.target.value, 10));
                  setManualEndOverride(false);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {DURATION_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.minutes}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Start time</label>
              <Input type="datetime-local" value={formStartLocal} onChange={(e) => setFormStartLocal(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">End time (manual override allowed)</label>
              <Input
                type="datetime-local"
                value={formEndLocal}
                onChange={(e) => {
                  setManualEndOverride(true);
                  setFormEndLocal(e.target.value);
                }}
              />
            </div>
            <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Textarea value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookingOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => submitCreate(false)}
              disabled={createMutation.isPending || !formVetId.trim() || !formAnimalId.trim() || !formStartLocal || !formEndLocal}
            >
              {createMutation.isPending ? "Saving..." : "Book Appointment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conflict detected</DialogTitle>
            <DialogDescription>
              Another task overlaps this slot. You can still override with a required reason.
            </DialogDescription>
          </DialogHeader>
          <div>
            <label className="text-xs text-muted-foreground">Override reason</label>
            <Textarea value={conflictReason} onChange={(e) => setConflictReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConflictOpen(false)}>
              Keep original
            </Button>
            <Button
              onClick={() => {
                if (!pendingConflictPayload) return;
                createMutation.mutate({
                  ...pendingConflictPayload,
                  conflictOverride: true,
                  overrideReason: conflictReason.trim() || null,
                });
                setConflictOpen(false);
              }}
              disabled={!conflictReason.trim()}
            >
              Confirm Override
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
