/**
 * Map imported schedule "shift" / תפקיד text to an operational role for doctor routing.
 * Complements account RBAC (vet) — see CONTEXT.md "Operational shift role (the job)".
 */
export type DoctorOperationalShiftRole =
  | "admission"
  | "ward"
  | "senior_lead"
  | "night_admission_only"
  | "night_senior_no_admission"
  | "unknown";

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function detectDoctorOperationalShiftRole(shiftName: string): DoctorOperationalShiftRole {
  const raw = normalizeWhitespace(shiftName);
  if (!raw) return "unknown";

  const n = raw.toLowerCase();
  const isNight = n.includes("night") || raw.includes("לילה");

  if (isNight) {
    const seniorish = n.includes("senior") || raw.includes("בכיר");
    const noAdmission =
      n.includes("no admission") || n.includes("no admissions") || n.includes("ללא קבלה");
    if (noAdmission && seniorish) {
      return "night_senior_no_admission";
    }
    if (
      n.includes("admissions only") ||
      n.includes("admission only") ||
      (raw.includes("לילה") && raw.includes("קבלה"))
    ) {
      return "night_admission_only";
    }
  }

  if (n.includes("admission") || n.includes("admissions")) {
    return "admission";
  }

  if (n.includes("ward") || n.includes("existing patients") || raw.includes("מחלקה")) {
    return "ward";
  }

  if (
    n.includes("senior doctor") ||
    (n.includes("senior") && n.includes("shift")) ||
    (raw.includes("בכיר") && !isNight)
  ) {
    return "senior_lead";
  }

  return "unknown";
}
