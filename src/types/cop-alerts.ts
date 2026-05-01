export type CopAlertVariant = "order_mismatch" | "charged_no_admin" | "admin_no_dispense";

/** Payload from `POTENTIAL_ORPHAN_USE` realtime events (union-friendly). */
export interface PotentialOrphanUsePayload {
  billingLedgerId?: string;
  inventoryLogId?: string;
  taskId?: string;
  animalId?: string;
  medicationLabel?: string;
  hoursSinceCharge?: number;
}

export interface SuspectedOrphanStockPayload {
  billingLedgerId?: string;
  inventoryLogId?: string;
  animalId?: string;
  hoursSinceCharge?: number;
}

export interface ProbableOrphanUsagePayload {
  taskId?: string;
  animalId?: string;
  medicationLabel?: string;
  hoursSinceAdmin?: number;
}

export interface CopAlertEntry {
  variant: CopAlertVariant;
  dismissable: boolean;
  eventId: number;
  receivedAt: string;
  billingLedgerId?: string;
  inventoryLogId?: string;
  taskId?: string;
  animalId?: string;
  medicationLabel?: string;
  hoursSinceCharge?: number;
  hoursSinceAdmin?: number;
}
