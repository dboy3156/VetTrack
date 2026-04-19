import type { ShiftRole, User, UserRole } from "@/types";
import { serverSideVetIdGuard } from "../../shared/medication-calculator-rbac";

export type MedicationTaskRole = "allowed" | "blocked";

export interface MedicationRbacResult {
  canExecute: MedicationTaskRole;
  permittedVetId: string | null;
  blockReason: string | null;
}

export interface MedicationRbacUser {
  id?: User["id"] | null;
  role?: User["role"] | null;
  effectiveRole?: UserRole | ShiftRole | null;
}

function blocked(reason: string): MedicationRbacResult {
  return {
    canExecute: "blocked",
    permittedVetId: null,
    blockReason: reason,
  };
}

export function evaluateMedicationRbac(
  user: MedicationRbacUser | null | undefined,
): MedicationRbacResult {
  if (!user) return blocked("No authenticated user.");
  if (!user.id) return blocked("User has no ID.");

  const roleSource = user.effectiveRole ?? user.role;
  if (!roleSource) return blocked("User has no role assigned.");
  const role = String(roleSource).toLowerCase();

  if (role === "technician" || role === "vet" || role === "admin" || role === "senior_technician") {
    return {
      canExecute: "allowed",
      permittedVetId: user.id,
      blockReason: null,
    };
  }

  return blocked(`Role "${role}" is not permitted to execute medication tasks.`);
}

export { serverSideVetIdGuard };
