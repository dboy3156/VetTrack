import { Router } from "express";
import { randomUUID } from "crypto";
import { db, equipment, folders, scanLogs } from "../db.js";
import { eq } from "drizzle-orm";
import { subDays } from "date-fns";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

const DEMO_FOLDER_NAME = "ICU / Demo";

type DemoStatus = "ok" | "issue";

interface DemoItem {
  name: string;
  serialNumber: string;
  model: string;
  manufacturer: string;
  location: string;
  status: DemoStatus;
  issueNote?: string;
  checkOutToICU?: boolean;
}

const DEMO_ITEMS: DemoItem[] = [
  {
    name: "IV Pump #3",
    serialNumber: "IVP-003",
    model: "Baxter Sigma",
    manufacturer: "Baxter",
    location: "ICU",
    status: "ok",
  },
  {
    name: "Monitor #2",
    serialNumber: "MON-002",
    model: "Mindray PM-9000",
    manufacturer: "Mindray",
    location: "Room 4",
    status: "issue",
    issueNote: "Screen flickering — needs service",
  },
  {
    name: "Cardiac Monitor",
    serialNumber: "CAR-001",
    model: "Philips IntelliVue",
    manufacturer: "Philips",
    location: "ICU",
    status: "ok",
    checkOutToICU: true,
  },
  {
    name: "Ventilator #1",
    serialNumber: "VEN-001",
    model: "Dräger Primus",
    manufacturer: "Dräger",
    location: "Surgery",
    status: "ok",
  },
];

router.post("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const actorId = req.authUser!.id;
    const actorEmail = req.authUser!.email;

    const existingRows = await db
      .select({ id: equipment.id, name: equipment.name })
      .from(equipment);
    const existingByName = new Map(existingRows.map((e) => [e.name, e.id]));

    const [existingFolder] = await db
      .select()
      .from(folders)
      .where(eq(folders.name, DEMO_FOLDER_NAME))
      .limit(1);

    let folderId: string;
    if (existingFolder) {
      folderId = existingFolder.id;
    } else {
      const [newFolder] = await db
        .insert(folders)
        .values({ id: randomUUID(), name: DEMO_FOLDER_NAME, type: "manual" })
        .returning();
      folderId = newFolder.id;
    }

    const added: string[] = [];
    const patched: string[] = [];

    for (const item of DEMO_ITEMS) {
      const lastSeen = subDays(now, item.status === "issue" ? 1 : 0);
      const checkoutFields = item.checkOutToICU
        ? {
            checkedOutById: actorId,
            checkedOutByEmail: actorEmail,
            checkedOutAt: now,
            checkedOutLocation: "ICU",
          }
        : {
            checkedOutById: null,
            checkedOutByEmail: null,
            checkedOutAt: null,
            checkedOutLocation: null,
          };

      const existingId = existingByName.get(item.name);

      if (existingId) {
        // Patch the existing item to canonical demo state
        await db
          .update(equipment)
          .set({
            status: item.status,
            lastSeen,
            lastStatus: item.status,
            location: item.location,
            folderId,
            ...checkoutFields,
          })
          .where(eq(equipment.id, existingId));

        patched.push(item.name);
      } else {
        // Insert missing item
        const equipmentId = randomUUID();

        await db.insert(equipment).values({
          id: equipmentId,
          name: item.name,
          serialNumber: item.serialNumber,
          model: item.model,
          manufacturer: item.manufacturer,
          location: item.location,
          folderId,
          status: item.status,
          lastSeen,
          lastStatus: item.status,
          maintenanceIntervalDays: 30,
          ...checkoutFields,
        });

        await db.insert(scanLogs).values({
          id: randomUUID(),
          equipmentId,
          userId: actorId,
          userEmail: actorEmail,
          status: item.status,
          note: item.issueNote ?? null,
          timestamp: lastSeen,
        });

        added.push(item.name);
      }
    }

    const totalPatched = patched.length;
    const totalAdded = added.length;
    const message =
      totalAdded === 0 && totalPatched === 0
        ? "No changes made"
        : `Demo data ready — ${totalAdded} added, ${totalPatched} patched to canonical state`;

    return res.json({ message, added, patched });
  } catch (err) {
    console.error("Demo seed error:", err);
    res.status(500).json({ error: "Failed to seed demo data" });
  }
});

export default router;
