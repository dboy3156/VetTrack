import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, CheckCircle2, Clock3, Plus, User, Zap } from "lucide-react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { ErrorCard } from "@/components/ui/error-card";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useRealtime } from "@/hooks/useRealtime";
import { useTaskRecommendations } from "@/hooks/useTaskRecommendations";
import type { Appointment, AppointmentStatus, CreateAppointmentRequest, TaskPriority } from "@/types";
import { toast } from "sonner";
import {
  justificationTier,
  minimumJustificationLength,
  requiresDoseJustification,
} from "../../shared/medication-justification";
import { MED_JUSTIFICATION_PRESETS } from "../../shared/medication-justification-presets";

const DAY_START_HOUR = 8;
const DAY_END_HOUR = 20;
const SLOT_MINUTES = 15;
const PIXELS_PER_MINUTE = 1.2;
const HOUR_ROW_HEIGHT = 60;
const DASHBOARD_REFETCH_MS = 45_000;

const DURATION_PRESETS = [
  { key: "quick-inspection", label: "Quick inspection (10m)", minutes: 10 },
  { key: "urgent-response", label: "Urgent response (20m)", minutes: 20 },
  { key: "preventive-maintenance", label: "Preventive maintenance (30m)", minutes: 30 },
  { key: "repair-visit", label: "Repair visit (45m)", minutes: 45 },
  { key: "calibration", label: "Calibration (60m)", minutes: 60 },
] as const;

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  pending: "bg-slate-100 border-slate-300 text-slate-900",
  assigned: "bg-indigo-100 border-indigo-300 text-indigo-900",
  scheduled: "bg-blue-100 border-blue-300 text-blue-900",
  arrived: "bg-cyan-100 border-cyan-300 text-cyan-900",
  in_progress: "bg-amber-100 border-amber-300 text-amber-900",
  completed: "bg-emerald-100 border-emerald-300 text-emerald-900",
  cancelled: "bg-rose-100 border-rose-300 text-rose-900",
  no_show: "bg-zinc-200 border-zinc-400 text-zinc-900",
};

const PRIORITY_BADGE: Record<string, string> = {
  critical: "bg-destructive text-destructive-foreground border-transparent",
  high: "bg-accent text-accent-foreground border-transparent",
  normal: "bg-muted text-foreground border-border",
};

const SUGGESTION_SEVERITY_STYLES: Record<"high" | "medium" | "low", string> = {
  high: "border-red-300 bg-red-50 text-red-900",
  medium: "border-amber-300 bg-amber-50 text-amber-900",
  low: "border-zinc-300 bg-zinc-50 text-zinc-800",
};

const PRIORITY_COLORS: Record<TaskPriority, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  high: "bg-accent text-accent-foreground border-border",
  normal: "bg-muted text-foreground border-border",
};

const URGENT_BADGE_STYLES = {
  overdue: "text-[10px] bg-red-100 text-red-900 border-red-300",
  critical: "text-[10px] bg-orange-100 text-orange-900 border-orange-300",
} as const;

const TASK_CARD_STYLES = {
  overdue: "border-red-300 bg-red-50/70",
  critical: "border-orange-300 bg-orange-50/70",
  soon: "border-yellow-300 bg-yellow-50/70",
  normal: "border-border/70 bg-background/80",
};

const ACTION_BUTTON_BASE = "h-8 px-3 text-xs";
const MEDICATION_CUSTOM_JUSTIFICATION = "__custom__";

type MedicationMetadata = {
  createdBy?: string;
  acknowledgedBy?: string;
  prescribedByName?: string;
  doseJustification?: string;
  [key: string]: unknown;
};

function ActionTooltip({
  content,
  children,
}: {
  content?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();
  const wrapperRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (!content) {
    return <>{children}</>;
  }

  return (
    <span
      ref={wrapperRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
      tabIndex={0}
      aria-describedby={open ? tooltipId : undefined}
    >
      {children}
      {open ? (
        <span
          id={tooltipId}
          role="tooltip"
          className="absolute bottom-full left-1/2 z-50 mb-2 w-72 -translate-x-1/2 rounded-lg border border-border bg-popover px-3 py-2 text-xs leading-relaxed text-popover-foreground shadow-xl"
        >
          {content}
        </span>
      ) : null}
    </span>
  );
}

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
  if (err.message === "UNAUTHORIZED" || err.message === "Session expired") return "Your session expired. Please sign in again.";
  if (err.message === "INSUFFICIENT_ROLE") return "You do not have permission to create or assign this task.";
  if (err.message === "VALIDATION_FAILED") return "Please review required fields and time values.";
  if (err.message === "TASK_NOT_OWNED_BY_TECH") return "Only the assigned technician can perform this action.";
  if (err.message === "TASK_NOT_ASSIGNED") return "Assign a technician before starting.";
  return err.message;
}

function canStartTask(a: Appointment, meId: string | undefined): boolean {
  if (!meId || !a.vetId || a.vetId !== meId) return false;
  return ["scheduled", "assigned", "arrived"].includes(a.status);
}

function medicationMetadata(appointment: Appointment): MedicationMetadata | null {
  if (!appointment.metadata || typeof appointment.metadata !== "object") return null;
  return appointment.metadata as MedicationMetadata;
}

function getScheduledIso(appointment: Appointment): string | null {
  if (appointment.scheduledAt) return appointment.scheduledAt;
  const metadata = medicationMetadata(appointment);
  if (metadata && typeof metadata.scheduled_at === "string") return metadata.scheduled_at;
  return appointment.startTime ?? null;
}

function isDelayedMedicationTask(appointment: Appointment): boolean {
  if (appointment.taskType !== "medication") return false;
  if (appointment.status !== "pending") return false;
  const scheduledIso = getScheduledIso(appointment);
  if (!scheduledIso) return false;
  const scheduledMs = new Date(scheduledIso).getTime();
  if (!Number.isFinite(scheduledMs)) return false;
  return Date.now() > scheduledMs + 15 * 60 * 1000;
}

function formatScheduledLabel(appointment: Appointment): string | null {
  const scheduledIso = getScheduledIso(appointment);
  if (!scheduledIso) return null;
  return `Scheduled ${formatTimeHHMM(new Date(scheduledIso))}`;
}

function formatPrescribedByLabel(appointment: Appointment): string | null {
  if (appointment.taskType !== "medication") return null;
  const metadata = medicationMetadata(appointment);
  const prescribedBy = typeof metadata?.prescribedByName === "string"
    ? metadata.prescribedByName
    : typeof metadata?.createdBy === "string"
      ? metadata.createdBy
      : null;
  if (!prescribedBy) return null;
  return `Prescribed by ${prescribedBy}`;
}

function completeButtonState(args: {
  appointment: Appointment;
  meId?: string;
  meClerkId?: string | null;
  effectiveRole?: string;
  role?: string;
}) {
  const { appointment, meId, meClerkId, effectiveRole, role } = args;
  if (appointment.status !== "in_progress") {
    return { visible: false, disabled: true, tooltip: "" };
  }

  const resolvedRole = (effectiveRole || role || "").toLowerCase();
  const isVetOrAdmin = resolvedRole === "vet" || resolvedRole === "admin";
  if (isVetOrAdmin) {
    return { visible: true, disabled: false, tooltip: "" };
  }

  if (!meId || !appointment.vetId || appointment.vetId !== meId) {
    return { visible: false, disabled: true, tooltip: "" };
  }

  if (appointment.taskType !== "medication") {
    return { visible: true, disabled: false, tooltip: "" };
  }

  const metadata = medicationMetadata(appointment);
  const acknowledgedBy = typeof metadata?.acknowledgedBy === "string" ? metadata.acknowledgedBy : "";
  const meIdentifier = (meClerkId ?? "").trim() || meId;
  if (!acknowledgedBy || acknowledgedBy !== meIdentifier) {
    return {
      visible: true,
      disabled: true,
      tooltip: "Only the technician who acknowledged this task can complete it. Please contact the prescriber or admin for override.",
    };
  }

  return { visible: true, disabled: false, tooltip: "" };
}

function validateCustomJustification(text: string, minLength: number): string | null {
  const normalized = text.trim().replace(/\s+/g, " ");
  if (normalized.length < minLength) {
    return `Justification must be at least ${minLength} characters.`;
  }
  if (/(.)\1{4,}/u.test(normalized)) {
    return "Justification looks repetitive. Please enter a meaningful reason.";
  }
  const chars = Array.from(normalized);
  const maxCount = Math.max(...chars.map((char) => normalized.split(char).length - 1));
  if (maxCount / normalized.length > 0.4) {
    return "Justification looks repetitive. Please enter a meaningful reason.";
  }
  const letterCount = chars.filter((char) => /\p{L}/u.test(char)).length;
  if (letterCount / chars.length < 0.5 || !/\p{L}{2,}/u.test(normalized)) {
    return "Justification must include meaningful words.";
  }
  return null;
}

const STATUS_LABEL: Record<AppointmentStatus, string> = {
  pending: "Pending",
  assigned: "Assigned",
  scheduled: "Scheduled",
  arrived: "Arrived",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No show",
};

function looksLikeUuid(s: string): boolean {
  return s.includes("-") && s.length > 20;
}

function formatDevice(animalId: string | null | undefined): string {
  if (!animalId) return "Unassigned device";
  if (looksLikeUuid(animalId)) return `Device #${animalId.slice(0, 6)}`;
  return animalId;
}

function formatLocation(ownerId: string | null | undefined): string | null {
  if (!ownerId) return null;
  if (looksLikeUuid(ownerId)) return `#${ownerId.slice(0, 6)}`;
  return ownerId;
}

function compactMeta(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" \u2022 ");
}

function getTaskReasonBullets(scoreBreakdown: {
  overdue: number;
  critical: number;
  startsSoon: number;
  assigned: number;
  inProgress: number;
}): string[] {
  const bullets: string[] = [];
  if (scoreBreakdown.overdue > 0) bullets.push("Overdue");
  if (scoreBreakdown.critical > 0) bullets.push("Critical priority");
  if (scoreBreakdown.startsSoon > 0) bullets.push("Starting soon");
  if (scoreBreakdown.assigned > 0) bullets.push("Assigned to you");
  if (scoreBreakdown.inProgress > 0) bullets.push("Already in progress");
  return bullets;
}

export default function AppointmentsPage() {
  const queryClient = useQueryClient();
  const urgentRef = useRef<HTMLDivElement>(null);
  const myTasksRef = useRef<HTMLDivElement>(null);
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
  const [formTaskType, setFormTaskType] = useState<Appointment["taskType"]>("maintenance");
  const [formDoseMgPerKg, setFormDoseMgPerKg] = useState("");
  const [formDefaultDoseMgPerKg, setFormDefaultDoseMgPerKg] = useState("");
  const [formConcentrationMgPerMl, setFormConcentrationMgPerMl] = useState("");
  const [formJustificationPresetCode, setFormJustificationPresetCode] = useState("");
  const [formJustificationCustom, setFormJustificationCustom] = useState("");
  const [formStartLocal, setFormStartLocal] = useState<string>(() => toLocalDateTimeInputValue(new Date()));
  const [formEndLocal, setFormEndLocal] = useState<string>(() => toLocalDateTimeInputValue(new Date(Date.now() + 20 * 60 * 1000)));
  const [selectedDuration, setSelectedDuration] = useState<number>(20);
  const [manualEndOverride, setManualEndOverride] = useState(false);

  const isMedicationForm = formTaskType === "medication";
  const dose = Number.parseFloat(formDoseMgPerKg);
  const defaultDose = Number.parseFloat(formDefaultDoseMgPerKg);
  const doseInputsValid = Number.isFinite(dose) && Number.isFinite(defaultDose) && defaultDose > 0;
  const doseDeviation = doseInputsValid ? Math.abs(dose - defaultDose) / defaultDose : 0;
  const requiresJustification = doseInputsValid ? requiresDoseJustification(dose, defaultDose) : false;
  const justificationMinLength = minimumJustificationLength(justificationTier(doseDeviation));

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

  const dashboardQuery = useQuery({
    queryKey: ["/api/tasks/dashboard", meQuery.data?.id],
    queryFn: () => api.tasks.dashboard(),
    enabled: !!meQuery.data?.id,
    refetchInterval: 90_000,
    refetchOnWindowFocus: false,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
  const recommendationsQuery = useTaskRecommendations(Boolean(meQuery.data?.id));

  const vetNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const vet of metaQuery.data?.vets ?? []) {
      map.set(vet.id, vet.displayName || vet.name);
    }
    return map;
  }, [metaQuery.data?.vets]);

  function resolveVet(vetId: string | null | undefined): string {
    if (!vetId) return "Unassigned";
    return vetNameMap.get(vetId) ?? vetId.slice(0, 8);
  }

  const createMutation = useMutation({
    mutationFn: (payload: CreateAppointmentRequest) => api.appointments.create(payload),
    onSuccess: () => {
      toast.success("Task created");
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", day], exact: true });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/dashboard", meQuery.data?.id], exact: true });
      setBookingOpen(false);
      setFormNotes("");
      setFormAnimalId("");
      setFormOwnerId("");
      setFormTaskType("maintenance");
      setFormDoseMgPerKg("");
      setFormDefaultDoseMgPerKg("");
      setFormConcentrationMgPerMl("");
      setFormJustificationPresetCode("");
      setFormJustificationCustom("");
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
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", day], exact: true });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/dashboard", meQuery.data?.id], exact: true });
    },
    onError: (error: Error) => {
      toast.error(toErrorMessage(error));
    },
  });

  const startTaskMutation = useMutation({
    mutationFn: (id: string) => api.tasks.start(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", day], exact: true });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/dashboard", meQuery.data?.id], exact: true });
      toast.success("Task started");
    },
    onError: (error: Error) => {
      toast.error(toErrorMessage(error));
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: (id: string) => api.tasks.complete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", day], exact: true });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/dashboard", meQuery.data?.id], exact: true });
      toast.success("Task completed");
    },
    onError: (error: Error) => {
      toast.error(toErrorMessage(error));
    },
  });

  const handleRealtimeEvent = useCallback((event: { type: string; payload: unknown }) => {
    if (
      event.type === "TASK_CREATED" ||
      event.type === "TASK_STARTED" ||
      event.type === "TASK_COMPLETED" ||
      event.type === "TASK_UPDATED"
    ) {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments", day], exact: true });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/dashboard", meQuery.data?.id], exact: true });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/recommendations"], exact: true });
      return;
    }
    if (event.type === "AUTOMATION_TRIGGERED") {
      toast.info("Task auto-updated by automation rule");
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/dashboard", meQuery.data?.id], exact: true });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/recommendations"], exact: true });
      return;
    }
    if (event.type === "NOTIFICATION_SENT") return;
  }, [day, meQuery.data?.id, queryClient]);

  useRealtime(handleRealtimeEvent);

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
    if (!formVetId.trim()) {
      toast.error("Select a technician before creating a task.");
      return;
    }
    if (!formAnimalId.trim()) {
      toast.error("Device / Asset is required.");
      return;
    }

    const start = new Date(formStartLocal);
    const end = new Date(formEndLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      toast.error("Please enter valid start and end times.");
      return;
    }
    if (end.getTime() <= start.getTime()) {
      toast.error("Expected end time must be after scheduled time.");
      return;
    }

    let metadata: Record<string, unknown> | undefined;
    if (isMedicationForm) {
      const meIdentifier = (meQuery.data?.clerkId ?? "").trim() || meQuery.data?.id;
      if (!doseInputsValid || dose <= 0) {
        toast.error("Enter valid dose and default dose values for medication tasks.");
        return;
      }
      if (doseDeviation > 0.5) {
        toast.error("Dose deviation above 50% is not allowed.");
        return;
      }

      const concentration = Number.parseFloat(formConcentrationMgPerMl);
      const selectedPreset = MED_JUSTIFICATION_PRESETS.find((preset) => preset.code === formJustificationPresetCode);
      const isCustomJustification = formJustificationPresetCode === MEDICATION_CUSTOM_JUSTIFICATION;
      let justificationPayload: {
        doseJustification: string;
        doseJustificationKind: "preset" | "custom";
        doseJustificationPresetCode?: string;
      } | null = null;

      if (requiresJustification) {
        if (selectedPreset) {
          justificationPayload = {
            doseJustification: selectedPreset.label,
            doseJustificationKind: "preset",
            doseJustificationPresetCode: selectedPreset.code,
          };
        } else if (isCustomJustification) {
          const validationError = validateCustomJustification(formJustificationCustom, justificationMinLength);
          if (validationError) {
            toast.error(validationError);
            return;
          }
          justificationPayload = {
            doseJustification: formJustificationCustom.trim().replace(/\s+/g, " "),
            doseJustificationKind: "custom",
          };
        } else {
          toast.error("Choose a justification preset or provide a custom reason.");
          return;
        }
      }

      metadata = {
        kind: "medication",
        createdBy: meIdentifier ?? null,
        scheduled_at: start.toISOString(),
        doseMgPerKg: dose,
        defaultDoseMgPerKg: defaultDose,
        concentrationMgPerMl: Number.isFinite(concentration) && concentration > 0 ? concentration : null,
        ...justificationPayload,
      };
    }

    const payload: CreateAppointmentRequest = {
      vetId: formVetId.trim(),
      animalId: formAnimalId.trim() || null,
      ownerId: formOwnerId.trim() || null,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      notes: formNotes.trim() || null,
      status: "scheduled",
      taskType: formTaskType,
      scheduledAt: start.toISOString(),
      metadata,
      conflictOverride,
      overrideReason: overrideReason?.trim() || null,
    };
    createMutation.mutate(payload);
  }

  return (
    <Layout title="Tasks">
      <div dir="rtl" className="flex flex-col gap-4 pb-24 text-right">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="w-6 h-6" />
            Tasks
          </h1>
          <p className="text-sm text-muted-foreground">
            Your tasks for today, prioritized by urgency and schedule.
          </p>
        </div>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">What should I do now?</CardTitle>
          </CardHeader>
          <CardContent>
            {recommendationsQuery.isError ? (
              <ErrorCard
                message="Unable to load recommendations."
                onRetry={() => recommendationsQuery.refetch()}
              />
            ) : recommendationsQuery.isLoading && !recommendationsQuery.data ? (
              <div className="space-y-3">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : !recommendationsQuery.data?.nextBestTask ? (
              <EmptyState
                icon={CheckCircle2}
                message="You're all caught up"
                subMessage="No next best task is pending right now."
                action={(
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={() => openQuickBooking(new Date())}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Create task
                  </Button>
                )}
              />
            ) : (() => {
              const nbt = recommendationsQuery.data.nextBestTask;
              const nbtCompleteState = completeButtonState({
                appointment: nbt,
                meId: meQuery.data?.id,
                meClerkId: meQuery.data?.clerkId,
                role: meQuery.data?.role,
                effectiveRole: meQuery.data?.effectiveRole,
              });
              const timeRange = `${formatTimeHHMM(new Date(nbt.startTime))}\u2009\u2013\u2009${formatTimeHHMM(new Date(nbt.endTime))}`;
              return (
                <div className="rounded-xl border border-border/70 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{formatDevice(nbt.animalId)}</div>
                      <div className="text-xs text-muted-foreground">
                        {compactMeta(formatLocation(nbt.ownerId), resolveVet(nbt.vetId), timeRange)}
                      </div>
                      {formatScheduledLabel(nbt) || formatPrescribedByLabel(nbt) ? (
                        <div className="text-xs text-muted-foreground">
                          {compactMeta(formatScheduledLabel(nbt), formatPrescribedByLabel(nbt))}
                        </div>
                      ) : null}
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${PRIORITY_COLORS[nbt.priority ?? "normal"]}`}
                    >
                      {nbt.priority ?? "normal"}
                    </Badge>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
                    <div className="text-xs font-semibold text-foreground mb-2">Why this task?</div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {getTaskReasonBullets(nbt.scoreBreakdown).map((reason) => (
                        <li key={reason}>{"\u2022"} {reason}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {isDelayedMedicationTask(nbt) ? (
                      <Badge variant="outline" className="text-[10px] bg-red-100 border-red-300 text-red-900">
                        Delayed
                      </Badge>
                    ) : null}
                    {canStartTask(nbt, meQuery.data?.id) ? (
                      <Button
                        size="sm"
                        variant="default"
                        className={ACTION_BUTTON_BASE}
                        disabled={startTaskMutation.isPending}
                        onClick={() => startTaskMutation.mutate(nbt.id)}
                      >
                        Start now
                      </Button>
                    ) : null}
                    {nbtCompleteState.visible ? (
                      <ActionTooltip content={nbtCompleteState.disabled ? nbtCompleteState.tooltip : undefined}>
                        <Button
                          size="sm"
                          variant="secondary"
                          className={ACTION_BUTTON_BASE}
                          disabled={completeTaskMutation.isPending || nbtCompleteState.disabled}
                          onClick={() => completeTaskMutation.mutate(nbt.id)}
                        >
                          Mark complete
                        </Button>
                      </ActionTooltip>
                    ) : null}
                  </div>
                </div>
              );
            })()}
          </CardContent>
        </Card>

        <Card ref={urgentRef} className="bg-card border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Urgent</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {dashboardQuery.isError ? (
              <ErrorCard
                message="Unable to load urgent tasks."
                onRetry={() => dashboardQuery.refetch()}
              />
            ) : dashboardQuery.isLoading && !dashboardQuery.data ? (
              <div className="space-y-2">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-14 w-full" />
              </div>
            ) : (
              <>
                <ul className="space-y-2">
                  {(dashboardQuery.data?.overdue ?? []).map((t) => (
                    <li key={t.id} className={`rounded-lg border p-3 text-sm ${TASK_CARD_STYLES.overdue}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{formatDevice(t.animalId)}</span>
                        <Badge variant="outline" className={URGENT_BADGE_STYLES.overdue}>
                          overdue
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {compactMeta(
                          formatLocation(t.ownerId),
                          resolveVet(t.vetId),
                          `${formatTimeHHMM(new Date(t.startTime))}\u2009\u2013\u2009${formatTimeHHMM(new Date(t.endTime))}`,
                        )}
                      </div>
                      {formatScheduledLabel(t) || formatPrescribedByLabel(t) ? (
                        <div className="text-xs text-muted-foreground mt-1">
                          {compactMeta(formatScheduledLabel(t), formatPrescribedByLabel(t))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                  {(recommendationsQuery.data?.urgentTasks ?? []).map((t) => (
                    <li key={`urgent-${t.id}`} className={`rounded-lg border p-3 text-sm ${TASK_CARD_STYLES.critical}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{formatDevice(t.animalId)}</span>
                        <Badge variant="outline" className={URGENT_BADGE_STYLES.critical}>
                          critical
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {compactMeta(
                          formatLocation(t.ownerId),
                          resolveVet(t.vetId),
                          `${formatTimeHHMM(new Date(t.startTime))}\u2009\u2013\u2009${formatTimeHHMM(new Date(t.endTime))}`,
                        )}
                      </div>
                      {formatScheduledLabel(t) || formatPrescribedByLabel(t) ? (
                        <div className="text-xs text-muted-foreground mt-1">
                          {compactMeta(formatScheduledLabel(t), formatPrescribedByLabel(t))}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
                {(dashboardQuery.data?.overdue.length ?? 0) === 0 && (recommendationsQuery.data?.urgentTasks.length ?? 0) === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    message="Nothing urgent right now"
                    subMessage="Everything is currently on track."
                  action={(
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      onClick={() => myTasksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      View my tasks
                    </Button>
                  )}
                  />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <Zap className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
              <CardTitle className="text-sm font-semibold">
                Today
                {dashboardQuery.data ? (
                  <span className="text-muted-foreground font-normal"> ({dashboardQuery.data.counts.today})</span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[min(320px,45vh)] overflow-y-auto">
              {dashboardQuery.isError ? (
                <ErrorCard
                  message="Unable to load today's tasks."
                  onRetry={() => dashboardQuery.refetch()}
                />
              ) : dashboardQuery.isLoading && !dashboardQuery.data ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (dashboardQuery.data?.today.length ?? 0) === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  message="You're all caught up"
                  subMessage="No tasks are due today."
                  action={(
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      onClick={() => openQuickBooking(new Date())}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Create task
                    </Button>
                  )}
                />
              ) : (
                <ul className="space-y-2">
                  {dashboardQuery.data!.today.map((t) => {
                    const completeState = completeButtonState({
                      appointment: t,
                      meId: meQuery.data?.id,
                      meClerkId: meQuery.data?.clerkId,
                      role: meQuery.data?.role,
                      effectiveRole: meQuery.data?.effectiveRole,
                    });
                    return (
                    <li key={t.id} className={`flex flex-col gap-1.5 rounded-lg border p-3 text-sm ${TASK_CARD_STYLES.soon}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{formatDevice(t.animalId)}</span>
                        <div className="flex items-center gap-1">
                          {isDelayedMedicationTask(t) ? (
                            <Badge variant="outline" className="text-[10px] bg-red-100 border-red-300 text-red-900">
                              Delayed
                            </Badge>
                          ) : null}
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${PRIORITY_COLORS[t.priority ?? "normal"]}`}
                          >
                            {t.priority ?? "normal"}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {compactMeta(
                          formatLocation(t.ownerId),
                          resolveVet(t.vetId),
                          `${formatTimeHHMM(new Date(t.startTime))}\u2009\u2013\u2009${formatTimeHHMM(new Date(t.endTime))}`,
                        )}
                      </div>
                      {formatScheduledLabel(t) || formatPrescribedByLabel(t) ? (
                        <div className="text-xs text-muted-foreground">
                          {compactMeta(formatScheduledLabel(t), formatPrescribedByLabel(t))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {canStartTask(t, meQuery.data?.id) ? (
                          <Button
                            size="sm"
                            variant="default"
                            className={ACTION_BUTTON_BASE}
                            disabled={startTaskMutation.isPending}
                            onClick={() => startTaskMutation.mutate(t.id)}
                          >
                            Start this task
                          </Button>
                        ) : null}
                        {completeState.visible ? (
                          <ActionTooltip content={completeState.disabled ? completeState.tooltip : undefined}>
                            <Button
                              size="sm"
                              variant="secondary"
                              className={ACTION_BUTTON_BASE}
                              disabled={completeTaskMutation.isPending || completeState.disabled}
                              onClick={() => completeTaskMutation.mutate(t.id)}
                            >
                              Mark complete
                            </Button>
                          </ActionTooltip>
                        ) : null}
                      </div>
                    </li>
                  );})}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card ref={myTasksRef} className="bg-card border-border/60 shadow-sm">
            <CardHeader className="flex flex-row items-center gap-2 space-y-0 pb-2">
              <User className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
              <CardTitle className="text-sm font-semibold">
                My tasks
                {dashboardQuery.data ? (
                  <span className="text-muted-foreground font-normal"> ({dashboardQuery.data.counts.myTasks})</span>
                ) : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 max-h-[min(320px,45vh)] overflow-y-auto">
              {dashboardQuery.isError ? (
                <ErrorCard
                  message="Unable to load assigned tasks."
                  onRetry={() => dashboardQuery.refetch()}
                />
              ) : dashboardQuery.isLoading && !dashboardQuery.data ? (
                <div className="space-y-2">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : (dashboardQuery.data?.myTasks.length ?? 0) === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  message="No tasks assigned"
                  subMessage="Pick a task from the queue when ready."
                  action={(
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-3 text-xs"
                      onClick={() => urgentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    >
                      Review urgent
                    </Button>
                  )}
                />
              ) : (
                <ul className="space-y-2">
                  {dashboardQuery.data!.myTasks.map((t) => {
                    const completeState = completeButtonState({
                      appointment: t,
                      meId: meQuery.data?.id,
                      meClerkId: meQuery.data?.clerkId,
                      role: meQuery.data?.role,
                      effectiveRole: meQuery.data?.effectiveRole,
                    });
                    return (
                    <li key={t.id} className={`flex flex-col gap-1.5 rounded-lg border p-3 text-sm ${TASK_CARD_STYLES.normal}`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{formatDevice(t.animalId)}</span>
                        <div className="flex items-center gap-1">
                          {isDelayedMedicationTask(t) ? (
                            <Badge variant="outline" className="text-[10px] bg-red-100 border-red-300 text-red-900">
                              Delayed
                            </Badge>
                          ) : null}
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${PRIORITY_COLORS[t.priority ?? "normal"]}`}
                          >
                            {t.priority ?? "normal"}
                          </Badge>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {compactMeta(
                          formatLocation(t.ownerId),
                          resolveVet(t.vetId),
                          `${formatTimeHHMM(new Date(t.startTime))}\u2009\u2013\u2009${formatTimeHHMM(new Date(t.endTime))}`,
                        )}
                      </div>
                      {formatScheduledLabel(t) || formatPrescribedByLabel(t) ? (
                        <div className="text-xs text-muted-foreground">
                          {compactMeta(formatScheduledLabel(t), formatPrescribedByLabel(t))}
                        </div>
                      ) : null}
                      <div className="flex flex-wrap gap-2 mt-1">
                        {canStartTask(t, meQuery.data?.id) ? (
                          <Button
                            size="sm"
                            variant="default"
                            className={ACTION_BUTTON_BASE}
                            disabled={startTaskMutation.isPending}
                            onClick={() => startTaskMutation.mutate(t.id)}
                          >
                            Start this task
                          </Button>
                        ) : null}
                        {completeState.visible ? (
                          <ActionTooltip content={completeState.disabled ? completeState.tooltip : undefined}>
                            <Button
                              size="sm"
                              variant="secondary"
                              className={ACTION_BUTTON_BASE}
                              disabled={completeTaskMutation.isPending || completeState.disabled}
                              onClick={() => completeTaskMutation.mutate(t.id)}
                            >
                              Mark complete
                            </Button>
                          </ActionTooltip>
                        ) : null}
                      </div>
                    </li>
                  );})}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Suggestions</CardTitle>
          </CardHeader>
          <CardContent>
            {(recommendationsQuery.data?.suggestions.length ?? 0) === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                message="No suggestions"
                subMessage="Everything looks good right now."
                action={(
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-3 text-xs"
                    onClick={() => openQuickBooking(new Date())}
                  >
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    Create task
                  </Button>
                )}
              />
            ) : (
              <ul className="space-y-2">
                {recommendationsQuery.data?.suggestions.map((suggestion, idx) => (
                  <li
                    key={`${suggestion.type}-${idx}`}
                    className={`rounded-md border p-3 text-sm ${SUGGESTION_SEVERITY_STYLES[suggestion.severity]}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {suggestion.type === "OVERDUE_WARNING"
                          ? `${dashboardQuery.data?.counts.overdue ?? 0} overdue — review now`
                          : suggestion.type === "START_NOW"
                            ? "Next task is ready — start now"
                            : suggestion.type === "OVERLOADED"
                              ? "High workload — review urgent tasks"
                              : "Queue is open — pick a task"}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className={ACTION_BUTTON_BASE}
                        onClick={() => {
                          if (suggestion.type === "START_NOW" && recommendationsQuery.data?.nextBestTask) {
                            startTaskMutation.mutate(recommendationsQuery.data.nextBestTask.id);
                          } else if (suggestion.type === "OVERDUE_WARNING" || suggestion.type === "OVERLOADED") {
                            urgentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          } else if (suggestion.type === "PICK_FROM_QUEUE") {
                            myTasksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                          }
                        }}
                      >
                        {suggestion.type === "START_NOW"
                          ? "Start now"
                          : suggestion.type === "PICK_FROM_QUEUE"
                            ? "View queue"
                            : "Review urgent"}
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Plus className="w-4 h-4" />
                Task Controls
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-3 items-end">
            <div>
              <label className="text-xs text-muted-foreground block text-right">Day</label>
              <Input dir="ltr" className="text-left" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block text-right">Technician</label>
              <select
                dir="ltr"
                value={selectedVetId}
                onChange={(e) => setSelectedVetId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-left"
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
              <label className="text-xs text-muted-foreground block text-right">Hours</label>
              <div className="h-10 px-3 rounded-md border flex items-center text-sm">
                {DAY_START_HOUR}:00 - {DAY_END_HOUR}:00
              </div>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block text-right">Interval</label>
              <div className="h-10 px-3 rounded-md border flex items-center text-sm">{SLOT_MINUTES} min</div>
            </div>
            <div>
              <Button className="w-full" onClick={() => openQuickBooking(new Date())}>
                <Plus className="w-4 h-4 mr-1" />
                Quick task
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
            {listQuery.isError ? (
              <ErrorCard
                message="Unable to load the day view."
                onRetry={() => {
                  void listQuery.refetch();
                  void metaQuery.refetch();
                }}
              />
            ) : listQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-8 w-48" />
                <Skeleton className="h-64 w-full" />
              </div>
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
                          aria-label={`Schedule task ${formatTimeHHMM(slot)}`}
                        />
                      );
                    })}

                    {appointmentBlocks.map(({ appointment, top, height, start, end }) => {
                      const completeState = completeButtonState({
                        appointment,
                        meId: meQuery.data?.id,
                        meClerkId: meQuery.data?.clerkId,
                        role: meQuery.data?.role,
                        effectiveRole: meQuery.data?.effectiveRole,
                      });
                      return (
                      <div
                        key={appointment.id}
                        className={`absolute left-24 right-3 rounded-lg border shadow-sm p-2 ${STATUS_COLORS[appointment.status]}`}
                        style={{ top: top + 1, height }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-semibold truncate">
                            {formatDevice(appointment.animalId)}
                          </div>
                          <div className="flex gap-1">
                            {isDelayedMedicationTask(appointment) ? (
                              <Badge variant="outline" className="text-[10px] bg-red-100 border-red-300 text-red-900">
                                Delayed
                              </Badge>
                            ) : null}
                            <Badge variant="secondary" className="text-[10px]">
                              {STATUS_LABEL[appointment.status]}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${PRIORITY_BADGE[appointment.priority ?? "normal"] ?? PRIORITY_BADGE.normal}`}
                            >
                              {appointment.priority ?? "normal"}
                            </Badge>
                          </div>
                        </div>
                        <div className="text-[11px] mt-1 truncate text-muted-foreground">
                          {compactMeta(
                            formatLocation(appointment.ownerId),
                            resolveVet(appointment.vetId),
                            `${formatTimeHHMM(start)}\u2009\u2013\u2009${formatTimeHHMM(end)}`,
                          )}
                        </div>
                        {formatScheduledLabel(appointment) || formatPrescribedByLabel(appointment) ? (
                          <div className="text-[11px] mt-1 truncate text-muted-foreground">
                            {compactMeta(formatScheduledLabel(appointment), formatPrescribedByLabel(appointment))}
                          </div>
                        ) : null}
                        {appointment.conflictOverride ? (
                          <div className="text-[10px] mt-1 font-medium">Override applied</div>
                        ) : null}
                        <div className="flex gap-1 mt-2 flex-wrap">
                          {canStartTask(appointment, meQuery.data?.id) ? (
                            <Button
                              size="sm"
                              variant="default"
                              className="h-7 text-[11px] px-2"
                              disabled={startTaskMutation.isPending}
                              onClick={() => startTaskMutation.mutate(appointment.id)}
                            >
                              Start now
                            </Button>
                          ) : null}
                          {completeState.visible ? (
                            <ActionTooltip content={completeState.disabled ? completeState.tooltip : undefined}>
                              <Button
                                size="sm"
                                variant="secondary"
                                className="h-7 text-[11px] px-2"
                                disabled={completeTaskMutation.isPending || completeState.disabled}
                                onClick={() => completeTaskMutation.mutate(appointment.id)}
                              >
                                Mark complete
                              </Button>
                            </ActionTooltip>
                          ) : null}
                          {statusActions(appointment.status).map((nextStatus) => (
                            <Button
                              key={`${appointment.id}-${nextStatus}`}
                              size="sm"
                              variant="outline"
                              className="h-7 text-[11px] px-2"
                              onClick={() => updateStatusMutation.mutate({ id: appointment.id, status: nextStatus })}
                              disabled={updateStatusMutation.isPending}
                            >
                              {STATUS_LABEL[nextStatus]}
                            </Button>
                          ))}
                        </div>
                      </div>
                    );})}

                    {appointmentBlocks.length === 0 ? (
                      <div className="absolute inset-0 flex items-center justify-center px-4">
                        <div className="w-full max-w-md">
                          <EmptyState
                            icon={CheckCircle2}
                            message="No tasks scheduled"
                            subMessage="Tap a slot to create one."
                          />
                        </div>
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
        <DialogContent dir="rtl" className="text-right max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>New Task</DialogTitle>
            <DialogDescription>
              Assign a device and technician.{" "}
              <span dir="ltr" className="inline-block text-left">
                Tap a slot to prefill the time.
              </span>
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
              <label className="text-xs text-muted-foreground block text-right">Technician (required)</label>
              <select
                dir="ltr"
                value={formVetId}
                onChange={(e) => setFormVetId(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-left"
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
              <label className="text-xs text-muted-foreground block text-right">Device / Asset (required)</label>
              <Input
                dir="ltr"
                className="text-left"
                value={formAnimalId}
                onChange={(e) => setFormAnimalId(e.target.value)}
                placeholder="e.g. Ventilator, Autoclave"
              />
              </div>
              <div>
              <label className="text-xs text-muted-foreground block text-right">Location / Department (optional)</label>
              <Input
                dir="ltr"
                className="text-left"
                value={formOwnerId}
                onChange={(e) => setFormOwnerId(e.target.value)}
                placeholder="ICU / ER / Ward"
              />
              </div>
              <div>
              <label className="text-xs text-muted-foreground block text-right">Task type</label>
              <select
                dir="ltr"
                value={formTaskType ?? "maintenance"}
                onChange={(e) => {
                  const nextType = (e.target.value || "maintenance") as Appointment["taskType"];
                  setFormTaskType(nextType);
                  if (nextType !== "medication") {
                    setFormDoseMgPerKg("");
                    setFormDefaultDoseMgPerKg("");
                    setFormConcentrationMgPerMl("");
                    setFormJustificationPresetCode("");
                    setFormJustificationCustom("");
                  }
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-left"
              >
                <option value="maintenance">Maintenance</option>
                <option value="repair">Repair</option>
                <option value="inspection">Inspection</option>
                <option value="medication">Medication</option>
              </select>
              </div>
              <div>
              <label className="text-xs text-muted-foreground block text-right">Duration preset</label>
              <select
                dir="ltr"
                value={String(selectedDuration)}
                onChange={(e) => {
                  setSelectedDuration(Number.parseInt(e.target.value, 10));
                  setManualEndOverride(false);
                }}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-left"
              >
                {DURATION_PRESETS.map((preset) => (
                  <option key={preset.key} value={preset.minutes}>
                    {preset.label}
                  </option>
                ))}
              </select>
              </div>
              <div>
              <label className="text-xs text-muted-foreground block text-right">Scheduled time</label>
              <Input
                dir="ltr"
                className="text-left"
                type="datetime-local"
                value={formStartLocal}
                onChange={(e) => setFormStartLocal(e.target.value)}
              />
              </div>
              <div>
              <label className="text-xs text-muted-foreground block text-right">Expected end (manual override allowed)</label>
              <Input
                dir="ltr"
                className="text-left"
                type="datetime-local"
                value={formEndLocal}
                onChange={(e) => {
                  setManualEndOverride(true);
                  setFormEndLocal(e.target.value);
                }}
              />
              </div>
              <div className="md:col-span-2">
              <label className="text-xs text-muted-foreground block text-right">Notes</label>
              <Textarea dir="ltr" className="text-left" value={formNotes} onChange={(e) => setFormNotes(e.target.value)} rows={3} />
              </div>
              {isMedicationForm ? (
                <>
                  <div>
                  <label className="text-xs text-muted-foreground block text-right">Dose (mg/kg)</label>
                  <Input
                    dir="ltr"
                    className="text-left"
                    inputMode="decimal"
                    value={formDoseMgPerKg}
                    onChange={(e) => setFormDoseMgPerKg(e.target.value)}
                    placeholder="e.g. 2.5"
                  />
                  </div>
                  <div>
                  <label className="text-xs text-muted-foreground block text-right">Default dose (mg/kg)</label>
                  <Input
                    dir="ltr"
                    className="text-left"
                    inputMode="decimal"
                    value={formDefaultDoseMgPerKg}
                    onChange={(e) => setFormDefaultDoseMgPerKg(e.target.value)}
                    placeholder="e.g. 2.0"
                  />
                  </div>
                  <div>
                  <label className="text-xs text-muted-foreground block text-right">Concentration (mg/ml)</label>
                  <Input
                    dir="ltr"
                    className="text-left"
                    inputMode="decimal"
                    value={formConcentrationMgPerMl}
                    onChange={(e) => setFormConcentrationMgPerMl(e.target.value)}
                    placeholder="optional"
                  />
                  </div>
                  <div className="flex items-end">
                  <div className="text-xs text-muted-foreground">
                    {doseInputsValid ? `Deviation: ${(doseDeviation * 100).toFixed(1)}%` : "Enter dose values to calculate deviation"}
                  </div>
                  </div>
                  {requiresJustification ? (
                    <>
                      <div className="md:col-span-2">
                      <label className="text-xs text-muted-foreground block text-right">Dose justification (required)</label>
                      <select
                        dir="ltr"
                        value={formJustificationPresetCode}
                        onChange={(e) => setFormJustificationPresetCode(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-left"
                      >
                        <option value="">Select a reason</option>
                        {MED_JUSTIFICATION_PRESETS.map((preset) => (
                          <option key={preset.code} value={preset.code}>{preset.label}</option>
                        ))}
                        <option value={MEDICATION_CUSTOM_JUSTIFICATION}>Other (specify)</option>
                      </select>
                      </div>
                      {formJustificationPresetCode === MEDICATION_CUSTOM_JUSTIFICATION ? (
                        <div className="md:col-span-2">
                        <label className="text-xs text-muted-foreground block text-right">
                          Custom justification (minimum {justificationMinLength} chars)
                        </label>
                        <Textarea
                          dir="ltr"
                          className="text-left"
                          value={formJustificationCustom}
                          onChange={(e) => setFormJustificationCustom(e.target.value)}
                          rows={3}
                        />
                        </div>
                      ) : null}
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
            <Button variant="outline" onClick={() => setBookingOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => submitCreate(false)}
              disabled={createMutation.isPending || !formVetId.trim() || !formAnimalId.trim() || !formStartLocal || !formEndLocal}
            >
              {createMutation.isPending ? "Saving..." : "Create Task"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <DialogContent dir="rtl" className="text-right max-h-[85vh] flex flex-col overflow-hidden p-0">
          <DialogHeader className="px-6 pt-6">
            <DialogTitle>Scheduling conflict</DialogTitle>
            <DialogDescription>
              This time overlaps an existing task. Provide a reason to override.
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4">
              <label className="text-xs text-muted-foreground block text-right">Reason for override</label>
            <Textarea dir="ltr" className="text-left" value={conflictReason} onChange={(e) => setConflictReason(e.target.value)} rows={3} />
          </div>
          <DialogFooter className="shrink-0 border-t bg-background px-6 py-4">
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
