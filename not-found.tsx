import Dexie, { type Table } from "dexie";

export interface Equipment {
  id: string;
  serverId?: string;
  qrCode: string;
  name: string;
  category: string;
  status: "available" | "in-use" | "maintenance" | "retired";
  location: string;
  assignedTo?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  updatedAt: string;
  syncStatus: "synced" | "pending" | "conflict";
}

export interface SyncOperation {
  id?: number;
  type: "create" | "update" | "delete";
  entityType: "equipment" | "activity";
  payload: unknown;
  createdAt: string;
  attempts: number;
}

class EquipmentTrackerDB extends Dexie {
  equipment!: Table<Equipment>;
  syncQueue!: Table<SyncOperation>;

  constructor() {
    super("EquipmentTrackerDB");
    this.version(1).stores({
      equipment: "id, qrCode, status, syncStatus, updatedAt",
      syncQueue: "++id, type, entityType, createdAt",
    });
  }
}

export const db = new EquipmentTrackerDB();
