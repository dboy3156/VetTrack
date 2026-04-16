import { Router, type Response } from "express";
import { z } from "zod";
import { and, eq, isNull, or } from "drizzle-orm";
import { db, shifts, users } from "../db.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { toServiceTask, type AppointmentLike } from "../domain/service-task.adapter.js";
import { isServiceTaskModeForUser } from "../lib/feature-flags.js";
import { logServiceChange } from "../lib/service-change-log.js";
import {
  AppointmentServiceError,
  cancelAppointment,
  createAppointment,
  getAppointmentsByDay,
  getAppointmentsByVet,
  listAppointmentsByRange,
  updateAppointment,
} from "../services/appointments.service.js";

const router = Router();

const statusSchema = z.enum([
  "pending",
  "assigned",
  "scheduled",
  "arrived",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]);
const prioritySchema = z.enum(["critical", "high", "normal"]);
const taskTypeSchema = z.enum(["maintenance", "repair", "inspection"]);

const createAppointmentSchema = z.object({
  animalId: z.string().trim().min(1).optional().nullable(),
  ownerId: z.string().trim().min(1).optional().nullable(),
  vetId: z.string().trim().optional().nullable(),
  startTime: z.string().trim().min(1, "startTime is required"),
  endTime: z.string().trim().min(1, "endTime is required"),
  status: statusSchema.optional(),
  conflictOverride: z.boolean().optional(),
  overrideReason: z.string().max(4000).optional().nullable(),
  notes: z.string().max(4000).optional().nullable(),
  priority: prioritySchema.optional(),
  taskType: taskTypeSchema.optional().nullable(),
});

const updateAppointmentSchema = z
  .object({
    animalId: z.string().trim().min(1).optional().nullable(),
    ownerId: z.string().trim().min(1).optional().nullable(),
    vetId: z.string().trim().optional().nullable(),
    startTime: z.string().trim().min(1).optional(),
    endTime: z.string().trim().min(1).optional(),
    status: statusSchema.optional(),
    conflictOverride: z.boolean().optional(),
    overrideReason: z.string().max(4000).optional().nullable(),
    notes: z.string().max(4000).optional().nullable(),
    priority: prioritySchema.optional(),
    taskType: taskTypeSchema.optional().nullable(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

const deleteAppointmentSchema = z.object({
  reason: z.string().max(4000).optional(),
});

const listQuerySchema = z
  .object({
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    vetId: z.string().trim().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.day) return;
    if (!data.start || !data.end) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide either day=YYYY-MM-DD or both start/end in UTC format",
      });
    }
  });

const metaQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function sendServiceError(res: Response, err: unknown) {
  if (err instanceof AppointmentServiceError) {
    res.status(err.status).json({
      error: err.code,
      message: err.message,
      details: err.details ?? null,
    });
    return true;
  }
  return false;
}

router.post("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const parsed = createAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Invalid request body",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const appointment = await createAppointment(
      req.clinicId!,
      parsed.data,
      req.authUser ? { userId: req.authUser.id, email: req.authUser.email } : undefined,
    );
    const uid = req.authUser?.id;
    if (uid && isServiceTaskModeForUser(uid)) {
      logServiceChange("appointment_created", {
        userId: uid,
        clinicId: req.clinicId,
        appointmentId: appointment.id,
        serviceTask: toServiceTask(appointment as AppointmentLike),
      });
    }
    return res.status(201).json({ appointment });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("appointments:create", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create appointment" });
  }
});

router.get("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Invalid query params",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const clinicId = req.clinicId!;
    const { day, start, end, vetId } = parsed.data;

    const appointments = day
      ? await getAppointmentsByDay(clinicId, day)
      : vetId
        ? await getAppointmentsByVet(clinicId, vetId, start!, end!)
        : await listAppointmentsByRange(clinicId, start!, end!);

    return res.json({ appointments });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("appointments:list", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list appointments" });
  }
});

router.get("/meta", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const parsed = metaQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Invalid query params",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const clinicId = req.clinicId!;
    const day = parsed.data.day;

    const clinicVets = await db
      .select({
        id: users.id,
        name: users.name,
        displayName: users.displayName,
        role: users.role,
      })
      .from(users)
      .where(
        and(
          eq(users.clinicId, clinicId),
          isNull(users.deletedAt),
          or(eq(users.role, "vet"), eq(users.role, "admin")),
        ),
      )
      .orderBy(users.displayName, users.name);

    const dayShifts = await db
      .select({
        id: shifts.id,
        employeeName: shifts.employeeName,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        role: shifts.role,
      })
      .from(shifts)
      .where(and(eq(shifts.clinicId, clinicId), eq(shifts.date, day)))
      .orderBy(shifts.startTime, shifts.employeeName);

    const vets = clinicVets.map((vet) => {
      const names = [vet.displayName?.trim() ?? "", vet.name?.trim() ?? ""].filter(Boolean);
      const vetShifts = dayShifts.filter((shift) => names.includes(shift.employeeName));
      return {
        ...vet,
        shifts: vetShifts,
      };
    });

    return res.json({ day, vets });
  } catch (err) {
    console.error("appointments:meta", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to load scheduling metadata" });
  }
});

router.patch("/:id", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  if (!req.params.id || !req.params.id.trim()) {
    return res.status(400).json({ error: "VALIDATION_FAILED", message: "id param is required" });
  }

  const parsed = updateAppointmentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Invalid request body",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const appointment = await updateAppointment(
      req.clinicId!,
      req.params.id,
      parsed.data,
      req.authUser ? { userId: req.authUser.id, email: req.authUser.email } : undefined,
    );
    const uid = req.authUser?.id;
    if (uid && isServiceTaskModeForUser(uid)) {
      logServiceChange("appointment_updated", {
        userId: uid,
        clinicId: req.clinicId,
        appointmentId: appointment.id,
        serviceTask: toServiceTask(appointment as AppointmentLike),
      });
    }
    return res.json({ appointment });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("appointments:update", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to update appointment" });
  }
});

router.delete("/:id", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  if (!req.params.id || !req.params.id.trim()) {
    return res.status(400).json({ error: "VALIDATION_FAILED", message: "id param is required" });
  }

  const parsed = deleteAppointmentSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "VALIDATION_FAILED",
      message: "Invalid request body",
      details: parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    });
  }

  try {
    const appointment = await cancelAppointment(
      req.clinicId!,
      req.params.id,
      parsed.data.reason,
      req.authUser ? { userId: req.authUser.id, email: req.authUser.email } : undefined,
    );
    const uid = req.authUser?.id;
    if (uid && isServiceTaskModeForUser(uid)) {
      logServiceChange("appointment_cancelled", {
        userId: uid,
        clinicId: req.clinicId,
        appointmentId: appointment.id,
        serviceTask: toServiceTask(appointment as AppointmentLike),
      });
    }
    return res.json({ appointment });
  } catch (err) {
    if (sendServiceError(res, err)) return;
    console.error("appointments:cancel", err);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to cancel appointment" });
  }
});

export default router;
