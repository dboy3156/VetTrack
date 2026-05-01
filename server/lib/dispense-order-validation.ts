import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { appointments, hospitalizations, inventoryItems } from "../db.js";
import type { AuditDbExecutor } from "./audit.js";

const ACTIVE_APPOINTMENT_STATUSES = [
  "pending",
  "assigned",
  "scheduled",
  "arrived",
  "in_progress",
] as const;

export type OrphanReasonCode =
  | "NO_PATIENT_LINKED"
  | "NO_ACTIVE_HOSPITALIZATION"
  | "NO_ACTIVE_ORDER"
  | "QUANTITY_EXCEEDS_ORDER";

export type OrphanLineDetail = {
  itemId: string;
  quantity: number;
  label: string;
  reasons: OrphanReasonCode[];
  matchingOrderIds: string[];
};

function normalizeStr(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Match calculator/task medication metadata to physical inventory label/code (best-effort). */
export function medicationMetaMatchesInventoryItem(
  meta: Record<string, unknown>,
  itemLabel: string,
  itemCode: string,
): boolean {
  const drugName = typeof meta.drugName === "string" ? normalizeStr(meta.drugName) : "";
  const medName = typeof meta.medicationName === "string" ? normalizeStr(meta.medicationName) : "";
  const drugIdMeta = typeof meta.drugId === "string" ? meta.drugId.trim().toLowerCase() : "";
  const lab = normalizeStr(itemLabel);
  const cod = normalizeStr(itemCode);
  const token =
    drugName.length > 0
      ? drugName
      : medName.length > 0
        ? medName
        : "";
  if (!token) return false;
  if (lab.includes(token) || token.includes(lab)) return true;
  if (cod.length > 0 && (lab.includes(cod) || token.includes(cod) || cod.includes(token))) return true;
  if (drugIdMeta.length > 0 && (cod === drugIdMeta || lab.includes(drugIdMeta))) return true;
  return false;
}

function maxDispenseUnitsFromMetadata(meta: Record<string, unknown>): number | null {
  const keys = ["maxDispenseUnits", "orderedUnits", "dispenseUnitsMax"] as const;
  for (const k of keys) {
    const u = meta[k];
    if (typeof u === "number" && Number.isFinite(u) && u >= 0) return Math.floor(u);
  }
  return null;
}

export type DispenseLineForValidation = {
  itemId: string;
  quantity: number;
  label: string;
  code: string;
};

/**
 * Cross-check cabinet dispense lines against active medication appointments + inpatient stay.
 * Flags potential “orphan” use when billing patient ≠ ordered drug context (Smart Cop).
 */
export async function evaluateDispenseAgainstOrders(
  tx: AuditDbExecutor,
  params: {
    clinicId: string;
    animalId: string | null;
    containerId: string;
    lines: DispenseLineForValidation[];
  },
): Promise<{ orphanLines: OrphanLineDetail[] }> {
  const { clinicId, animalId, containerId, lines } = params;
  const orphanLines: OrphanLineDetail[] = [];

  if (lines.length === 0) {
    return { orphanLines };
  }

  if (!animalId) {
    for (const line of lines) {
      orphanLines.push({
        itemId: line.itemId,
        quantity: line.quantity,
        label: line.label,
        reasons: ["NO_PATIENT_LINKED"],
        matchingOrderIds: [],
      });
    }
    return { orphanLines };
  }

  const [hosp] = await tx
    .select({ id: hospitalizations.id })
    .from(hospitalizations)
    .where(
      and(
        eq(hospitalizations.clinicId, clinicId),
        eq(hospitalizations.animalId, animalId),
        isNull(hospitalizations.dischargedAt),
      ),
    )
    .limit(1);
  const hasActiveHospitalization = Boolean(hosp);

  const medRows = await tx
    .select({
      id: appointments.id,
      metadata: appointments.metadata,
      containerIdCol: appointments.containerId,
      inventoryItemId: appointments.inventoryItemId,
    })
    .from(appointments)
    .where(
      and(
        eq(appointments.clinicId, clinicId),
        eq(appointments.animalId, animalId),
        eq(appointments.taskType, "medication"),
        inArray(appointments.status, [...ACTIVE_APPOINTMENT_STATUSES]),
        or(
          eq(appointments.containerId, containerId),
          sql`coalesce(${appointments.metadata}->>'containerId','') = ${containerId}`,
        ),
      ),
    );

  for (const line of lines) {
    const reasons: OrphanReasonCode[] = [];

    if (!hasActiveHospitalization) {
      reasons.push("NO_ACTIVE_HOSPITALIZATION");
    }

    const explicitRows = medRows.filter(
      (row) =>
        typeof row.inventoryItemId === "string" &&
        row.inventoryItemId.trim().length > 0 &&
        row.inventoryItemId.trim() === line.itemId,
    );
    const metaMatches =
      explicitRows.length > 0
        ? explicitRows
        : medRows.filter((row) => {
            const raw = row.metadata;
            const meta =
              raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
            return medicationMetaMatchesInventoryItem(meta, line.label, line.code);
          });

    if (metaMatches.length === 0) {
      reasons.push("NO_ACTIVE_ORDER");
    } else {
      const caps = metaMatches
        .map((m) => {
          const raw = m.metadata;
          const meta =
            raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
          return maxDispenseUnitsFromMetadata(meta);
        })
        .filter((x): x is number => x != null);
      const maxUnits = caps.length > 0 ? Math.max(...caps) : null;
      const allowed = maxUnits ?? 1;
      if (line.quantity > allowed) {
        reasons.push("QUANTITY_EXCEEDS_ORDER");
      }
    }

    if (reasons.length > 0) {
      orphanLines.push({
        itemId: line.itemId,
        quantity: line.quantity,
        label: line.label,
        reasons,
        matchingOrderIds: metaMatches.map((m) => m.id),
      });
    }
  }

  return { orphanLines };
}

/** Load inventory item label + code for validation within an existing transaction. */
export async function loadInventoryItemLabelCode(
  tx: AuditDbExecutor,
  clinicId: string,
  itemId: string,
): Promise<{ label: string; code: string } | null> {
  const [row] = await tx
    .select({ label: inventoryItems.label, code: inventoryItems.code })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.id, itemId)))
    .limit(1);
  if (!row) return null;
  return { label: row.label ?? "", code: row.code ?? "" };
}
