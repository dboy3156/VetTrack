import { Router } from "express";
import { randomUUID } from "crypto";
import { getNotificationsDlq, getNotificationsQueue } from "../lib/queue.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

function resolveRequestId(
  res: { getHeader: (name: string) => unknown; setHeader?: (name: string, value: string) => void },
  incomingHeader: unknown,
): string {
  const incoming = typeof incomingHeader === "string" ? incomingHeader.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incoming || fromRes || randomUUID();
  if (typeof res.setHeader === "function") {
    res.setHeader("x-request-id", requestId);
  }
  return requestId;
}

function apiError(params: { code: string; reason: string; message: string; requestId: string }) {
  return {
    code: params.code,
    error: params.code,
    reason: params.reason,
    message: params.message,
    requestId: params.requestId,
  };
}

router.get("/dlq", requireAuth, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
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
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "QUEUE_DLQ_FETCH_FAILED",
        message: "Failed to fetch DLQ jobs",
        requestId,
      }),
    );
  }
});

router.post("/dlq/:jobId/replay", requireAuth, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const jobId = String(req.params.jobId ?? "").trim();
  if (!jobId) {
    res.status(400).json(
      apiError({
        code: "VALIDATION_FAILED",
        reason: "MISSING_JOB_ID",
        message: "DLQ job id is required",
        requestId,
      }),
    );
    return;
  }

  try {
    const dlq = getNotificationsDlq();
    const queue = getNotificationsQueue();
    if (!dlq || !queue) {
      res.status(503).json(
        apiError({
          code: "SERVICE_UNAVAILABLE",
          reason: "QUEUE_UNAVAILABLE",
          message: "Queue service unavailable",
          requestId,
        }),
      );
      return;
    }

    const job = await dlq.getJob(jobId);
    if (!job) {
      res.status(404).json(
        apiError({
          code: "NOT_FOUND",
          reason: "DLQ_JOB_NOT_FOUND",
          message: "DLQ job not found",
          requestId,
        }),
      );
      return;
    }

    const sourceName = typeof job.data?.sourceJobName === "string" ? job.data.sourceJobName : "";
    if (!sourceName) {
      res.status(422).json(
        apiError({
          code: "VALIDATION_FAILED",
          reason: "DLQ_SOURCE_JOB_NAME_MISSING",
          message: "DLQ job does not contain a source job name",
          requestId,
        }),
      );
      return;
    }

    await queue.add(sourceName, job.data?.data ?? {}, {
      attempts: 3,
      backoff: { type: "exponential", delay: 2000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    });
    await job.remove();

    res.status(200).json({
      status: "ok",
      replayedJobId: jobId,
      replayedAs: sourceName,
      requestId,
    });
  } catch (err) {
    console.error("[queue-route] failed to replay DLQ job", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "QUEUE_DLQ_REPLAY_FAILED",
        message: "Failed to replay DLQ job",
        requestId,
      }),
    );
  }
});

export default router;
