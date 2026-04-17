/**
 * BullMQ worker: notifications queue + overdue reminder scheduler.
 * Run as a separate process: pnpm run worker:notifications
 */
import "dotenv/config";

import { Worker } from "bullmq";
import { dispatchTaskNotificationSync } from "../lib/task-notification.js";
import {
  NOTIFICATION_QUEUE_NAME,
  enqueueNotificationJob,
  getNotificationsQueue,
  queueMetrics,
  type AutomationExecutePayload,
  type NotificationJobData,
} from "../lib/queue.js";
import { createRedisConnection, getRedisUrl } from "../lib/redis.js";
import { checkDedupe, initVapid, sendPushToRole, sendPushToUser } from "../lib/push.js";
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
  if (data.type === "task_notification") {
    await dispatchTaskNotificationSync(data.event, data.task, data.actor);
    return;
  }
  if (data.type === "overdue_reminder") {
    await handleOverdueReminder(data);
    return;
  }
  if (data.type === "automation_push_user") {
    await sendPushToUser(data.clinicId, data.userId, {
      title: data.title,
      body: data.body,
      tag: data.tag,
      url: "/appointments",
    });
    return;
  }
  if (data.type === "automation_push_role") {
    await sendPushToRole(data.clinicId, data.role, {
      title: data.title,
      body: data.body,
      tag: data.tag,
      url: "/appointments",
    });
  }
}

async function main(): Promise<void> {
  if (!getRedisUrl()) {
    console.error("[worker] REDIS_URL is required for notification worker");
    process.exit(1);
  }

  await initVapid();

  const connection = createRedisConnection();
  if (!connection) {
    console.error("[worker] Redis connection failed");
    process.exit(1);
  }

  const queue = getNotificationsQueue();
  if (!queue) {
    console.error("[worker] notifications queue unavailable");
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
      try {
        if (job.name === "scan_overdue_reminders") {
          await scanOverdueAndEnqueue();
        } else if (job.name === "automation_tick") {
          await scanAndEnqueueAutomationJobs();
        } else if (job.name === "automation_execute") {
          await executeAutomationJob(job.data as AutomationExecutePayload);
        } else if (job.name === "send_notification") {
          await processSendNotification(job.data as NotificationJobData);
        }
        queueMetrics.completed++;
        console.log("QUEUE_JOB_COMPLETED", { id: jid, ms: Date.now() - t0 });
      } catch (err) {
        queueMetrics.failed++;
        console.error("QUEUE_JOB_FAILED", { id: jid, err: (err as Error).message });
        throw err;
      }
    },
    {
      connection,
      concurrency: 8,
    },
  );

  worker.on("failed", (job, err) => {
    console.error("QUEUE_JOB_FAILED", { id: job?.id, err: err?.message });
  });

  console.log(
    `[worker] notification worker listening (${NOTIFICATION_QUEUE_NAME}), overdue scan every ${OVERDUE_SCAN_MS / 60000} min, automation tick every ${AUTOMATION_TICK_MS / 1000}s`,
  );
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
