import { Router } from "express";
import { db, scanLogs, transferLogs, equipment } from "../db.js";
import { desc, eq, count } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { sql } from "drizzle-orm";

const router = Router();

const PAGE_SIZE = 30;

router.get("/", requireAuth, async (req, res) => {
  try {
    const scans = await db
      .select({
        id: scanLogs.id,
        equipmentId: scanLogs.equipmentId,
        equipmentName: equipment.name,
        userId: scanLogs.userId,
        userEmail: scanLogs.userEmail,
        status: scanLogs.status,
        note: scanLogs.note,
        timestamp: scanLogs.timestamp,
        type: sql<string>`'scan'`,
        fromFolder: sql<string>`null::text`,
        toFolder: sql<string>`null::text`,
      })
      .from(scanLogs)
      .leftJoin(equipment, eq(scanLogs.equipmentId, equipment.id))
      .orderBy(desc(scanLogs.timestamp))
      .limit(PAGE_SIZE);

    const transfers = await db
      .select({
        id: transferLogs.id,
        equipmentId: transferLogs.equipmentId,
        equipmentName: equipment.name,
        userId: transferLogs.userId,
        userEmail: sql<string>`''`,
        status: sql<string>`null::text`,
        note: sql<string>`null::text`,
        timestamp: transferLogs.timestamp,
        type: sql<string>`'transfer'`,
        fromFolder: transferLogs.fromFolderName,
        toFolder: transferLogs.toFolderName,
      })
      .from(transferLogs)
      .leftJoin(equipment, eq(transferLogs.equipmentId, equipment.id))
      .orderBy(desc(transferLogs.timestamp))
      .limit(PAGE_SIZE);

    const combined = [
      ...scans.map((s) => ({
        id: s.id,
        type: "scan" as const,
        equipmentId: s.equipmentId,
        equipmentName: s.equipmentName || "Unknown",
        status: s.status,
        note: s.note,
        userId: s.userId,
        userEmail: s.userEmail,
        timestamp: new Date(s.timestamp).toISOString(),
      })),
      ...transfers.map((t) => ({
        id: t.id,
        type: "transfer" as const,
        equipmentId: t.equipmentId,
        equipmentName: t.equipmentName || "Unknown",
        fromFolder: t.fromFolder,
        toFolder: t.toFolder,
        userId: t.userId,
        userEmail: "",
        timestamp: new Date(t.timestamp).toISOString(),
      })),
    ]
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )
      .slice(0, PAGE_SIZE + 1);

    const hasMore = combined.length > PAGE_SIZE;
    const items = combined.slice(0, PAGE_SIZE);
    const nextCursor = hasMore ? items[items.length - 1].timestamp : null;

    res.json({ items, nextCursor });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get activity" });
  }
});

// GET /api/activity/my-scan-count — reliable check for onboarding eligibility
router.get("/my-scan-count", requireAuth, async (req, res) => {
  try {
    const [row] = await db
      .select({ scanCount: count() })
      .from(scanLogs)
      .where(eq(scanLogs.userId, req.authUser!.id));
    res.json({ count: row?.scanCount ?? 0 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get scan count" });
  }
});

export default router;
