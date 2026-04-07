import Dexie, { type Table } from "dexie";
import type { Equipment, ScanLog, Folder } from "@/types";

export type PendingSyncStatus = "pending" | "synced" | "failed";
export type PendingSyncType = "scan" | "create" | "update" | "delete" | "checkout" | "return";

export interface PendingSync {
  id?: number;
  type: PendingSyncType;
  endpoint: string;
  method: string;
  body: string;
  authHeaders: Record<string, string>;
  createdAt: Date;
  retries: number;
  status: PendingSyncStatus;
  clientTimestamp: number;
  optimisticData?: string;
  errorMessage?: string;
  equipmentName?: string;
}

class VetTrackDB extends Dexie {
  equipment!: Table<Equipment>;
  scanLogs!: Table<ScanLog>;
  folders!: Table<Folder>;
  pendingSync!: Table<PendingSync>;

  constructor() {
    super("vettrack");
    this.version(3).stores({
      equipment: "id, name, status, folderId, lastSeen, createdAt",
      scanLogs: "id, equipmentId, timestamp",
      folders: "id, name, type",
      pendingSync: "++id, type, createdAt, status, clientTimestamp",
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

export async function getCachedEquipmentById(id: string): Promise<Equipment | undefined> {
  return offlineDb.equipment.get(id);
}

export async function updateCachedEquipment(id: string, updates: Partial<Equipment>) {
  await offlineDb.equipment.update(id, updates);
}

export async function cacheScanLogs(equipmentId: string, logs: ScanLog[]) {
  await offlineDb.scanLogs.bulkPut(logs);
}

export async function getCachedScanLogs(equipmentId: string): Promise<ScanLog[]> {
  return offlineDb.scanLogs
    .where("equipmentId")
    .equals(equipmentId)
    .reverse()
    .sortBy("timestamp");
}

export async function cacheFolders(items: Folder[]) {
  await offlineDb.folders.bulkPut(items);
}

export async function getCachedFolders(): Promise<Folder[]> {
  return offlineDb.folders.toArray();
}

export async function addPendingSync(op: Omit<PendingSync, "id">) {
  return offlineDb.pendingSync.add(op);
}

export async function getPendingSync(): Promise<PendingSync[]> {
  return offlineDb.pendingSync
    .where("status")
    .equals("pending")
    .sortBy("clientTimestamp");
}

export async function getAllPendingSync(): Promise<PendingSync[]> {
  return offlineDb.pendingSync.orderBy("createdAt").toArray();
}

export async function updatePendingSync(id: number, updates: Partial<PendingSync>) {
  return offlineDb.pendingSync.update(id, updates);
}

export async function removePendingSync(id: number) {
  return offlineDb.pendingSync.delete(id);
}

export async function getPendingCount(): Promise<number> {
  return offlineDb.pendingSync.where("status").equals("pending").count();
}

export async function getFailedCount(): Promise<number> {
  return offlineDb.pendingSync.where("status").equals("failed").count();
}

export async function runStartupCleanup(): Promise<void> {
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const failedOld = await offlineDb.pendingSync
      .where("status")
      .equals("failed")
      .and((item) => item.createdAt < sevenDaysAgo)
      .primaryKeys();
    if (failedOld.length > 0) {
      await offlineDb.pendingSync.bulkDelete(failedOld as number[]);
    }

    const syncedIds = await offlineDb.pendingSync
      .where("status")
      .equals("synced")
      .primaryKeys();
    if (syncedIds.length > 0) {
      await offlineDb.pendingSync.bulkDelete(syncedIds as number[]);
    }

    const allEquipmentIds = await offlineDb.equipment
      .toCollection()
      .primaryKeys() as string[];
    const equipmentIdSet = new Set(allEquipmentIds);

    const allLogs = await offlineDb.scanLogs.toArray();
    const toDeleteLogs: string[] = [];

    const byEquipment = new Map<string, typeof allLogs>();
    for (const log of allLogs) {
      if (!equipmentIdSet.has(log.equipmentId)) {
        toDeleteLogs.push(log.id);
        continue;
      }
      const group = byEquipment.get(log.equipmentId) ?? [];
      group.push(log);
      byEquipment.set(log.equipmentId, group);
    }

    for (const [, logs] of byEquipment) {
      if (logs.length > 200) {
        logs.sort((a, b) => (a.timestamp < b.timestamp ? -1 : 1));
        const excess = logs.slice(0, logs.length - 200);
        for (const l of excess) toDeleteLogs.push(l.id);
      }
    }

    if (toDeleteLogs.length > 0) {
      await offlineDb.scanLogs.bulkDelete(toDeleteLogs);
    }
  } catch {
  }
}
