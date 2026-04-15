import { Router, type NextFunction, type Request, type Response } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import {
  runAllTests,
  getReport,
  isTestRunning,
  setTestMode,
  setSchedule,
  getScheduleHours,
  testModeEnabled,
} from "../lib/test-runner.js";
import { getActionLogs, clearActionLogs, logAction } from "../lib/stability-log.js";

const router = Router();

function requireNotProduction(_req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === "production") {
    return res.status(403).json({ error: "Not available in production" });
  }
  next();
}

router.get("/status", requireAuth, requireAdmin, (_req, res) => {
  const report = getReport();
  const running = isTestRunning();
  const scheduleHours = getScheduleHours();
  res.json({
    running,
    testModeEnabled,
    scheduleHours,
    lastRun: report.runId ? report : null,
  });
});

router.post("/run", requireAuth, requireAdmin, (_req, res) => {
  if (isTestRunning()) {
    return res.status(409).json({ error: "A test run is already in progress" });
  }
  runAllTests().catch((err) =>
    logAction("error", "runner", "Test run failed", String(err))
  );
  res.json({ message: "Test run started", runId: `run-${Date.now()}` });
});

router.get("/results", requireAuth, requireAdmin, (_req, res) => {
  res.json(getReport());
});

router.get("/logs", requireAuth, requireAdmin, (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 500);
  const search = (req.query.search as string | undefined) || undefined;
  res.json(getActionLogs(limit, search));
});

router.delete("/logs", requireAuth, requireAdmin, (_req, res) => {
  clearActionLogs();
  logAction("info", "system", "Action logs cleared by admin");
  res.json({ message: "Logs cleared" });
});

router.post("/test-mode", requireAuth, requireAdmin, requireNotProduction, (req, res) => {
  const { enabled } = req.body as { enabled: boolean };
  if (typeof enabled !== "boolean") {
    return res.status(400).json({ error: "enabled must be a boolean" });
  }
  setTestMode(enabled);
  res.json({ testModeEnabled: enabled });
});

router.post("/schedule", requireAuth, requireAdmin, requireNotProduction, (req, res) => {
  const { hours } = req.body as { hours: number };
  const h = Number(hours);
  if (!Number.isFinite(h) || h < 0) {
    return res.status(400).json({ error: "hours must be a non-negative number" });
  }
  setSchedule(h);
  res.json({ scheduleHours: h, message: h > 0 ? `Tests scheduled every ${h} hour(s)` : "Schedule disabled" });
});

export default router;
