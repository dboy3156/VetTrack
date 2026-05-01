import { and, eq, inArray } from "drizzle-orm";
import { db, users } from "../db.js";
import type { ErAssigneesResponse } from "../../shared/er-types.js";

const ASSIGNABLE_ROLES = ["admin", "vet", "senior_technician", "technician"] as const;

export async function listErAssignees(clinicId: string): Promise<ErAssigneesResponse> {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      role: users.role,
    })
    .from(users)
    .where(and(eq(users.clinicId, clinicId), inArray(users.role, [...ASSIGNABLE_ROLES])));

  return {
    assignees: rows.map((r) => ({
      id: r.id,
      name: r.displayName.trim() || r.id,
      role: r.role,
    })),
  };
}
