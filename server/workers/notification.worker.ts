/**
 * BullMQ worker: notifications queue + overdue reminder scheduler.
 * Run as a separate process: pnpm run worker:notifications
 */
import "dotenv/config";

import { Worker } from "bullmq";
import { dispatchTaskNotificationSync } from "../lib/task-notification.js";
import {
  NOTIFICATION_DLQ_NAME,
  NOTIFICATION_QUEUE_NAME,
  enqueueDeadLetterJob,
  enqueueNotificationJob,
  getNotificationsDlq,
  getNotificationsQueue,
  queueMetrics,
  type AutomationExecutePayload,
  type NotificationJobData,
} from "../lib/queue.js";
import { createRedisConnection } from "../lib/redis.js";
import { incrementMetric } from "../lib/metrics.js";
import { checkIdempotentAsync, markIdempotentAsync } from "../lib/idempotency.js";
import { isCircuitOpen } from "../lib/circuit-breaker.js";
import { checkDedupe, initVapid, sendPushToRole, sendPushToUser } from "../lib/push.js";
import { withTimeout } from "../lib/timeout.js";
import { getUsersWithOverdueTaskCounts } from "../services/task-recall.service.js";
import { executeAutomationJob, scanAndEnqueueAutomationJobs } from "../services/task-automation.service.js";

const OVERDUE_SCAN_MS = 5 * 60 * 1000;
const AUTOMATION_TICK_MS = 90 * 1000;

async function handleOverdueReminder(d: { clinicId: string; userId: string; count: number }): Promise<void> {
  if (d.count <= 0) return;
  if (checkDedupe(d.userId, "OVERDUE_REMINDER", 3_600_000)) return;
  await sendPushToUser(d.clinicId, d.userId, {
    title: "Overdue tasks",
    body: `You have ${d.count} overdue tasks`,
    tag: "overdue-reminder",
    url: "/appointments",
  });
}

async function scanOverdueAndEnqueue(): Promise<void> {
  const rows = await getUsersWithOverdueTaskCounts();
  for (const row of rows) {
    await enqueueNotificationJob({
      type: "overdue_reminder",
      clinicId: row.clinicId,
      userId: row.userId,
      count: row.count,
    });
  }
  console.log("OVERDUE_SCAN_ENQUEUED", { users: rows.length });
}

async function processSendNotification(data: NotificationJobData): Promise<void> {
  if (isCircuitOpen("push")) {
    incrementMetric("circuit_breaker_opened");
    console.warn("[worker] push circuit open; skipping notification job");
    return;
  }
  if (data.type === "task_notification") {
    await withTimeout(dispatchTaskNotificationSync(data.event, data.task, data.actor), 5000, "task notification");
    return;
  }
  if (data.type === "overdue_reminder") {
    await withTimeout(handleOverdueReminder(data), 5000, "overdue reminder");
    return;
  }
  if (data.type === "automation_push_user") {
    await withTimeout(sendPushToUser(data.clinicId, data.userId, {
      title: data.title,
      body: data.body,
      tag: data.tag,
      url: "/appointments",
    }), 5000, "automation push user");
    return;
  }
  if (data.type === "automation_push_role") {
    await withTimeout(sendPushToRole(data.clinicId, data.role, {
      title: data.title,
      body: data.body,
      tag: data.tag,
      url: "/appointments",
    }), 5000, "automation push role");
  }
}

async function main(): Promise<void> {
  if (!process.env.REDIS_URL?.trim()) {
    console.error("WORKER_DISABLED_NO_REDIS");
    process.exit(1);
  }

  await initVapid();

  const connection = await createRedisConnection();
  if (!connection) {
    console.error("[worker] Redis connection failed");
    process.exit(1);
  }

  const queue = await getNotificationsQueue();
  const dlq = await getNotificationsDlq();
  if (!queue) {
    console.error("[worker] notifications queue unavailable");
    process.exit(1);
  }
  if (!dlq) {
    console.error("[worker] notifications DLQ unavailable");
    process.exit(1);
  }

  await queue.add(
    "scan_overdue_reminders",
    {},
    {
      jobId: "repeat-overdue-reminders",
      repeat: { every: OVERDUE_SCAN_MS },
      removeOnComplete: 100,
    },
  );

  await queue.add(
    "automation_tick",
    {},
    {
      jobId: "repeat-automation-tick",
      repeat: { every: AUTOMATION_TICK_MS },
      removeOnComplete: 200,
    },
  );

  void scanOverdueAndEnqueue().catch((err) => console.error("[worker] initial overdue scan failed:", err));
  void scanAndEnqueueAutomationJobs().catch((err) => console.error("[worker] initial automation scan failed:", err));

  const worker = new Worker(
    NOTIFICATION_QUEUE_NAME,
    async (job) => {
      const t0 = Date.now();
      const jid = String(job.id ?? "");
      console.log("QUEUE_JOB_STARTED", { id: jid, name: job.name });
      incrementMetric("queue_jobs_started");
      if (job.attemptsMade > 0) {
        incrementMetric("retries_attempted");
        console.warn("QUEUE_JOB_RETRY_ATTEMPT", { id: jid, attemptsMade: job.attemptsMade, name: job.name });
      }
      try {
        if (job.name === "scan_overdue_reminders") {
          await scanOverdueAndEnqueue();
        } else if (job.name === "automation_tick") {
          await scanAndEnqueueAutomationJobs();
        } else if (job.name === "automation_execute") {
          await executeAutomationJob(job.data as AutomationExecutePayload);
        } else if (job.name === "send_notification") {
          const key = `notif:${jid}`;
          if (await checkIdempotentAsync(key)) {
            console.log("QUEUE_JOB_SKIPPED_IDEMPOTENT", { id: jid, name: job.name });
            return;
          }
          await processSendNotification(job.data as NotificationJobData);
          await markIdempotentAsync(key);
        }
        queueMetrics.completed++;
        incrementMetric("queue_jobs_completed");
        console.log("QUEUE_JOB_COMPLETED", { id: jid, ms: Date.now() - t0 });
      } catch (err) {
        queueMetrics.failed++;
        incrementMetric("queue_jobs_failed");
        console.error("QUEUE_JOB_FAILED", { id: jid, err: (err as Error).message });
        const maxAttempts = job.opts?.attempts ?? 1;
        if (job.attemptsMade + 1 >= maxAttempts) {
          await enqueueDeadLetterJob({
            sourceQueue: NOTIFICATION_QUEUE_NAME,
            sourceJobId: jid,
            sourceJobName: job.name,
            attemptsMade: job.attemptsMade + 1,
            data: job.data,
            reason: (err as Error).message,
          });
        }
        throw err;
      }
    },
    {
      connection,
      concurrency: 8,
    },
  );

  worker.on("failed", (job, err) => {
    console.error("QUEUE_JOB_FAILED", { jobId: job?.id, err });
  });

  const dlqWorker = new Worker(
    NOTIFICATION_DLQ_NAME,
    async (job) => {
      incrementMetric("queue_jobs_dead_letter");
      console.error("DLQ_JOB_RECEIVED", {
        id: job.id,
        sourceQueue: job.data?.sourceQueue,
        sourceJobId: job.data?.sourceJobId,
        attemptsMade: job.data?.attemptsMade,
        reason: job.data?.reason,
      });
    },
    { connection, concurrency: 1 },
  );

  dlqWorker.on("failed", (job, err) => {
    console.error("DLQ_JOB_FAILED", { jobId: job?.id, err });
  });

  let shuttingDown = false;
  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[worker] shutdown requested (${signal})`);
    try {
      await dlqWorker.close();
      await worker.close();
      await queue!.close();
      await dlq!.close();
      await connection!.quit();
      console.log("[worker] graceful shutdown complete");
      process.exit(0);
    } catch (err) {
      console.error("[worker] graceful shutdown failed", err);
      process.exit(1);
    }
  }
  process.on("SIGTERM", () => { void shutdown("SIGTERM"); });
  process.on("SIGINT", () => { void shutdown("SIGINT"); });

  console.log("NOTIFICATION_WORKER_STARTED");
  console.log(
    `[worker] notification worker listening (${NOTIFICATION_QUEUE_NAME}), overdue scan every ${OVERDUE_SCAN_MS / 60000} min, automation tick every ${AUTOMATION_TICK_MS / 1000}s`,
  );
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
