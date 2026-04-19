export type TaskAction =
  | "task.read"
  | "task.create"
  | "task.assign"
  | "task.reassign"
  | "task.cancel"
  | "task.start"
  | "task.complete";

export type MedicationTaskAction =
  | "med.read"
  | "med.task.create"
  | "med.task.cancel"
  | "med.dose.edit"
  | "med.start"
  | "med.complete";

function normalizedRole(role: string | null | undefined): string {
  return (role ?? "").trim().toLowerCase();
}

/**
 * Task/appointment authorization policy.
 * Keep this small and explicit so route-level intent is easy to audit.
 */
export function canPerformTaskAction(roleInput: string | null | undefined, action: TaskAction): boolean {
  const role = normalizedRole(roleInput);

  if (role === "admin") return true;

  if (role === "vet" || role === "senior_technician") {
    return (
      action === "task.read" ||
      action === "task.create" ||
      action === "task.assign" ||
      action === "task.reassign" ||
      action === "task.cancel"
    );
  }

  if (role === "technician") {
    return action === "task.read" || action === "task.start" || action === "task.complete";
  }

  if (role === "viewer") {
    return action === "task.read";
  }

  return false;
}

export function canPerformMedicationTaskAction(
  roleInput: string | null | undefined,
  action: MedicationTaskAction,
): boolean {
  const role = normalizedRole(roleInput);

  if (role === "admin") return true;

  if (role === "vet") {
    return (
      action === "med.read" ||
      action === "med.task.create" ||
      action === "med.task.cancel" ||
      action === "med.dose.edit" ||
      action === "med.start" ||
      action === "med.complete"
    );
  }

  if (role === "technician") {
    return action === "med.read" || action === "med.start" || action === "med.complete";
  }

  if (role === "viewer") {
    return action === "med.read";
  }

  return false;
}
