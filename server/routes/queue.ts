import { Router } from "express";
import { getNotificationsDlq } from "../lib/queue.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

router.get("/dlq", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const dlq = getNotificationsDlq();
    if (!dlq) {
      res.json({ queue: "notifications_dlq", jobs: [] });
      return;
    }
    const jobs = await dlq.getJobs(["waiting", "active", "completed", "failed", "delayed"], 0, 100, true);
    res.json({
      queue: "notifications_dlq",
      jobs: jobs.map((job) => ({
        id: String(job.id ?? ""),
        name: job.name,
        attemptsMade: job.attemptsMade,
        timestamp: job.timestamp,
        failedReason: job.failedReason ?? null,
        data: job.data,
      })),
    });
  } catch (err) {
    console.error("[queue-route] failed to fetch DLQ jobs", err);
    res.status(500).json({ error: "Failed to fetch DLQ jobs" });
  }
});

export default router;
