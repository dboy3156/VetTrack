import { useState, useEffect } from "react";
import { db, type Equipment } from "@/lib/db";
import { syncEngine } from "@/lib/sync";
import { v4 as uuidv4 } from "uuid";

export function useOfflineEquipment() {
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    // טען מ-IndexedDB מיד
    db.equipment.toArray().then(setEquipment);
  }, []);

  async function updateStatus(id: string, status: Equipment["status"]) {
    // עדכן locally מיד
    await db.equipment.update(id, {
      status,
      syncStatus: "pending",
      updatedAt: new Date().toISOString(),
    });

    // רענן UI
    const updated = await db.equipment.toArray();
    setEquipment(updated);

    // נסה sync
    setIsSyncing(true);
    await syncEngine.flush();
    setIsSyncing(false);

    // רענן שוב אחרי sync
    const synced = await db.equipment.toArray();
    setEquipment(synced);
  }

  async function addEquipment(data: Omit<Equipment, "id" | "syncStatus" | "updatedAt">) {
    const newItem: Equipment = {
      ...data,
      id: uuidv4(),
      syncStatus: "pending",
      updatedAt: new Date().toISOString(),
    };

    await db.equipment.add(newItem);
    setEquipment(await db.equipment.toArray());

    setIsSyncing(true);
    await syncEngine.flush();
    setIsSyncing(false);
  }

  return { equipment, isSyncing, updateStatus, addEquipment };
}
