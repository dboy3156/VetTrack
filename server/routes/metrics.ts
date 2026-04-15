import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { getSyncMetrics } from "../lib/sync-metrics.js";
import {
  getAccessDeniedLogSafetySnapshot,
  getAccessDeniedMetricsSnapshot,
  getAccessDeniedMetricsWindowSnapshot,
} from "../lib/access-denied.js";
import { getAlertEngineSnapshot } from "../lib/alert-engine.js";
import { getSystemWatchdogStatus } from "../lib/system-watchdog.js";

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
    const accessDeniedMetrics = getAccessDeniedMetricsSnapshot();
    const accessDeniedWindow = getAccessDeniedMetricsWindowSnapshot();
    const alertEngine = getAlertEngineSnapshot();
    const watchdog = getSystemWatchdogStatus();
    const accessDeniedLogSafety = getAccessDeniedLogSafetySnapshot();

    res.json({
      uptime: uptimeSeconds,
      memoryMb: Math.round(memUsage.heapUsed / 1024 / 1024),
      memoryTotalMb: Math.round(memUsage.heapTotal / 1024 / 1024),
      activeSessions,
      syncMetrics,
      accessDeniedMetrics,
      accessDeniedWindow,
      alertCounts: alertEngine.counts,
      lastAlertTimestamp: alertEngine.lastAlertAt,
      systemDegraded: alertEngine.isDegraded,
      watchdogStatus: watchdog,
      logSafety: {
        accessDenied: accessDeniedLogSafety,
        alerts: alertEngine.logSafety,
      },
    });
  } catch (err) {
    console.error("Metrics error:", err);
    res.status(500).json({ error: "Failed to fetch metrics" });
  }
});

export default router;
