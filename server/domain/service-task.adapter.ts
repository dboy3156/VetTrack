/**
 * Pure domain mapping: persisted appointments ↔ service-task vocabulary.
 * No DB imports; safe for serialized API objects.
 */

export type TaskPriority = "critical" | "high" | "normal";
export type TaskType = "maintenance" | "repair" | "inspection";

export type ServiceTaskStatus =
  | "scheduled"
  | "arrived"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "no_show";

export interface ServiceTask {
  id: string;
  clinicId: string;
  assetId: string | null;
  locationId: string | null;
  technicianId: string;
  startTime: string;
  endTime: string;
  status: ServiceTaskStatus;
  conflictOverride: boolean;
  overrideReason: string | null;
  notes: string | null;
  priority: TaskPriority;
  taskType: TaskType | null;
  createdAt: string;
  updatedAt: string;
}

/** Serialized appointment row (API / DB row shape). */
export type AppointmentLike = {
  id: string;
  clinicId: string;
  animalId?: string | null;
  ownerId?: string | null;
  vetId: string;
  startTime: string;
  endTime: string;
  status: ServiceTaskStatus;
  conflictOverride: boolean;
  overrideReason?: string | null;
  notes?: string | null;
  priority?: TaskPriority | null;
  taskType?: TaskType | null;
  createdAt: string;
  updatedAt: string;
};

export function toServiceTask(appointment: AppointmentLike): ServiceTask {
  return {
    id: appointment.id,
    clinicId: appointment.clinicId,
    assetId: appointment.animalId ?? null,
    locationId: appointment.ownerId ?? null,
    technicianId: appointment.vetId,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
    conflictOverride: appointment.conflictOverride,
    overrideReason: appointment.overrideReason ?? null,
    notes: appointment.notes ?? null,
    priority: appointment.priority ?? "normal",
    taskType: appointment.taskType ?? null,
    createdAt: appointment.createdAt,
    updatedAt: appointment.updatedAt,
  };
}

export function toAppointment(serviceTask: ServiceTask): AppointmentLike {
  return {
    id: serviceTask.id,
    clinicId: serviceTask.clinicId,
    animalId: serviceTask.assetId,
    ownerId: serviceTask.locationId,
    vetId: serviceTask.technicianId,
    startTime: serviceTask.startTime,
    endTime: serviceTask.endTime,
    status: serviceTask.status,
    conflictOverride: serviceTask.conflictOverride,
    overrideReason: serviceTask.overrideReason,
    notes: serviceTask.notes,
    priority: serviceTask.priority,
    taskType: serviceTask.taskType,
    createdAt: serviceTask.createdAt,
    updatedAt: serviceTask.updatedAt,
  };
}
