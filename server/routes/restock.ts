/**
 * /api/restock/scan — Optimized Route
 * VetTrack · Node.js + Express + Drizzle ORM + PostgreSQL
 *
 * ─── BOTTLENECKS FOUND ──────────────────────────────────
 * 1. Sequential awaits  — lookups run one-after-another instead of parallel
 * 2. Missing indexes    — scans on qrCode / assetTag without B-tree index
 * 3. Full table reads   — no .limit(1) on item lookup → Postgres scans all rows
 * 4. Per-request auth   — re-fetching user row on every scan (no cache)
 * 5. Implicit lock      — UPDATE inside long transaction holds row lock ~4-5s
 * 6. No early-exit      — validation happens AFTER all DB reads
 * ─────────────────────────────────────────────────────────
 */

import { Router, Request, Response } from "express";
import { db } from "../db";
import { equipment, restockLog, users } from "../db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth";
import { logger } from "../lib/logger";

const router = Router();

// ── Timing helper ────────────────────────────────────────
function mark(label: string, start: number) {
  const ms = Date.now() - start;
  logger.info({ step: label, ms }, `[restock/scan] ${label} → ${ms}ms`);
  return ms;
}

// ── POST /api/restock/scan ───────────────────────────────
router.post("/scan", requireAuth, async (req: Request, res: Response) => {
  const t0 = Date.now();

  // ── 1. Validate input immediately (no DB hit yet) ─────
  const { qrCode, locationId, quantity } = req.body as {
    qrCode?: string;
    locationId?: string;
    quantity?: number;
  };

  if (!qrCode || !locationId) {
    return res.status(400).json({ error: "חסר qrCode או locationId" });
  }
  mark("input-validation", t0);

  const userId = req.auth?.userId; // from Clerk middleware

  try {
    // ── 2. Parallel fetch — item + user in one round-trip ─
    const t1 = Date.now();

    const [itemRows, userRows] = await Promise.all([
      db
        .select({
          id: equipment.id,
          name: equipment.name,
          currentStock: equipment.currentStock,
          minStock: equipment.minStock,
          locationId: equipment.locationId,
        })
        .from(equipment)
        .where(eq(equipment.qrCode, qrCode))
        .limit(1), // ← critical: stop after first match

      db
        .select({ id: users.id, role: users.role, displayName: users.displayName })
        .from(users)
        .where(eq(users.clerkId, userId!))
        .limit(1),
    ]);

    mark("parallel-fetch", t1);

    // ── 3. Early exits after fetch ────────────────────────
    const item = itemRows[0];
    if (!item) {
      return res.status(404).json({ error: "ציוד לא נמצא" });
    }

    const user = userRows[0];
    if (!user) {
      return res.status(403).json({ error: "משתמש לא מורשה" });
    }

    // ── 4. Single atomic UPDATE + INSERT (one transaction) ─
    const t2 = Date.now();

    const newStock = (item.currentStock ?? 0) + (quantity ?? 1);

    // Use a short, tight transaction — no awaits inside except the SQL itself
    await db.transaction(async (tx) => {
      await tx
        .update(equipment)
        .set({
          currentStock: newStock,
          locationId: locationId,
          updatedAt: new Date(),
        })
        .where(eq(equipment.id, item.id));

      await tx.insert(restockLog).values({
        equipmentId: item.id,
        userId: user.id,
        locationId,
        quantity: quantity ?? 1,
        newStock,
        scannedAt: new Date(),
      });
    });

    mark("db-write", t2);

    // ── 5. Respond immediately — fire notifications async ─
    const total = Date.now() - t0;
    logger.info({ totalMs: total, qrCode, userId }, "[restock/scan] DONE");

    res.json({
      ok: true,
      item: { id: item.id, name: item.name, newStock },
      ms: total,
    });

    // ── 6. Post-response side-effects (non-blocking) ──────
    setImmediate(() => {
      if (newStock < (item.minStock ?? 0)) {
        // trigger low-stock notification without delaying response
        import("../services/notifications")
          .then(({ sendLowStockAlert }) =>
            sendLowStockAlert(item.id, newStock, item.minStock ?? 0)
          )
          .catch((err) => logger.error(err, "notification failed"));
      }
    });
  } catch (err) {
    logger.error(err, "[restock/scan] error");
    res.status(500).json({ error: "שגיאת שרת" });
  }
});

export default router;
