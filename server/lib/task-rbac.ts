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
  const normalized = (role ?? "").trim().toLowerCase();
  // Backward compatibility for legacy role values after Viewer -> Student rename.
  return normalized === "viewer" ? "student" : normalized;
}

/**
 * Task/appointment authorization policy.
 * Keep this small and explicit so route-level intent is easy to audit.
 *
 * DUAL-ROLE SAFETY CONTRACT:
 * Medication creation (med.task.create) is explicitly allow-listed to vet only.
 * Permission checks here use exact role strings — NOT numeric hierarchy levels — so no
 * role combination can accidentally inherit vet/physician-level permissions. A user with
 * a combined or shift-elevated role must still be explicitly "vet" to create tasks.
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

  if (role === "student") {
    return action === "task.read";
  }

  return false;
}

export function canPerformMedicationTaskAction(
  roleInput: string | null | undefined,
  action: MedicationTaskAction,
): boolean {
  const role = normalizedRole(roleInput);

  // Clinical safety policy: only veterinarians can create medication tasks.
  if (action === "med.task.create") {
    return role === "vet";
  }

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

  // senior_technician can execute tasks (start/complete) but NOT create.
  // Safety: med.task.create is intentionally excluded — only vet can initiate.
  if (role === "senior_technician") {
    return action === "med.read" || action === "med.start" || action === "med.complete";
  }

  if (role === "technician") {
    return action === "med.read" || action === "med.start" || action === "med.complete";
  }

  if (role === "student") {
    return action === "med.read";
  }

  return false;
}
