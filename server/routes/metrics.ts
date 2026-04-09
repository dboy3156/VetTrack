import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { getSyncMetrics } from "../lib/sync-metrics.js";

const router = Router();

router.get("/", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const uptimeSeconds = Math.floor(process.uptime());
    const memUsage = process.memoryUsage();

    let activeSessions = 0;
    try {
      const sessionResult = await pool.query(
        `SELECT COUNT(*) as count FROM vt_sessions WHERE expire > NOW()`
      );
      activeSessions = parseInt(sessionResult.rows[0]?.count ?? "0", 10);
    } catch {
      // vt_sessions table may not exist yet in dev; ignore
    }

    const syncMetrics = getSyncMetrics();

    res.json({
      uptime: uptimeSeconds,
      memoryMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      memoryTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      activeSessions,
      syncMetrics,
    });
  } catch (err) {
    console.error("Metrics error:", err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

export default router;
