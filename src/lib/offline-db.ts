import Dexie, { type Table } from "dexie";
import type { Equipment, ScanLog, Folder } from "@/types";

interface PendingSync {
  id?: number;
  type: "scan" | "create" | "update" | "delete";
  endpoint: string;
  method: string;
  body: string;
  createdAt: Date;
  retries: number;
}

class VetTrackDB extends Dexie {
  equipment!: Table<Equipment>;
  scanLogs!: Table<ScanLog>;
  folders!: Table<Folder>;
  pendingSync!: Table<PendingSync>;

  constructor() {
    super("vettrack");
    this.version(1).stores({
      equipment: "id, name, status, folderId, lastSeen, createdAt",
      scanLogs: "id, equipmentId, timestamp",
      folders: "id, name, type",
      pendingSync: "++id, type, createdAt",
    });
  }
}

export const offlineDb = new VetTrackDB();

export async function cacheEquipment(items: Equipment[]) {
  await offlineDb.equipment.bulkPut(items);
}

export async function getCachedEquipment(): Promise<Equipment[]> {
  return offlineDb.equipment.toArray();
}

export async function addPendingSync(op: Omit<PendingSync, "id">) {
  return offlineDb.pendingSync.add(op);
}

export async function getPendingSync(): Promise<PendingSync[]> {
  return offlineDb.pendingSync.orderBy("createdAt").toArray();
}

export async function removePendingSync(id: number) {
  return offlineDb.pendingSync.delete(id);
}
