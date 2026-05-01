import { and, eq, inArray } from "drizzle-orm";
import { db, users } from "../db.js";
import type { ErAssigneesResponse } from "../../shared/er-types.js";

const ASSIGNABLE_ROLES = ["vet", "senior_technician", "technician"] as const;

export async function listErAssignees(clinicId: string): Promise<ErAssigneesResponse> {
  const rows = await db
    .select({
      id: users.id,
      name: users.displayName,
      fallback: users.name,
      role: users.role,
    })
    .from(users)
    .where(
      and(
        eq(users.clinicId, clinicId),
        eq(users.status, "active"),
        inArray(users.role, [...ASSIGNABLE_ROLES]),
      ),
    );

  return {
    assignees: rows.map((r) => ({
      id: r.id,
      name: (r.name?.trim() || r.fallback?.trim() || r.id).slice(0, 120),
      role: r.role,
    })),
  };
}
