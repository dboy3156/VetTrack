export type OrphanReasonCode =
  | "NO_PATIENT_LINKED"
  | "NO_ACTIVE_HOSPITALIZATION"
  | "NO_ACTIVE_ORDER"
  | "QUANTITY_EXCEEDS_ORDER";

/** Payload subset mirrored from server `POTENTIAL_ORPHAN_USE` outbox events (client-safe). */
export type OrphanLineClient = {
  itemId: string;
  quantity: number;
  label: string;
  reasons: OrphanReasonCode[];
  matchingOrderIds: string[];
};

export type PotentialOrphanUsePayload = {
  animalId: string | null;
  /** Resolved patient display name when `animalId` is set (best-effort). */
  animalDisplayName?: string | null;
  sourceContainerId: string;
  technicianId: string;
  orphanLines: OrphanLineClient[];
  dispenseKind: string;
  emergencyEventId?: string;
};

export type SuspectedOrphanStockPayload = {
  billingLedgerId: string;
  inventoryLogId: string;
  animalId: string;
  animalDisplayName?: string | null;
  inventoryItemId: string;
  dispensedAt: string;
  windowHours: number;
};

export type ProbableOrphanUsagePayload = {
  taskId: string;
  animalId: string;
  animalDisplayName?: string | null;
  inventoryItemId: string;
  containerId: string;
  completedAt: string;
  lookbackHours: number;
};

export type CopAlertEntry =
  | (PotentialOrphanUsePayload & {
      variant: "order_mismatch";
      eventId: number;
      receivedAt: string;
      dismissable: true;
    })
  | (SuspectedOrphanStockPayload & {
      variant: "charged_no_admin";
      eventId: number;
      receivedAt: string;
      dismissable: false;
    })
  | (ProbableOrphanUsagePayload & {
      variant: "admin_no_dispense";
      eventId: number;
      receivedAt: string;
      dismissable: false;
    });

/** @deprecated Use CopAlertEntry — kept for gradual migration in components. */
export type OrphanDrugAlertEntry = CopAlertEntry;
