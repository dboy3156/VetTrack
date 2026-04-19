export interface MedicationGuardUser {
  id?: string | null;
  role?: string | null;
}

export function serverSideVetIdGuard(
  requestingUser: MedicationGuardUser | null | undefined,
  payloadVetId: string | null | undefined,
): boolean {
  if (!requestingUser?.id) return false;
  if (!requestingUser?.role) return false;
  if (typeof payloadVetId !== "string" || payloadVetId.trim().length === 0) return false;

  const role = requestingUser.role.trim().toLowerCase();
  const requesterId = requestingUser.id;
  const requestedVetId = payloadVetId.trim();

  if (role === "technician") {
    return requestedVetId === requesterId;
  }

  if (role === "vet" || role === "admin" || role === "senior_technician") {
    return requestedVetId === requesterId;
  }

  return false;
}
