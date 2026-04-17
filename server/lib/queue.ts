/**
 * BullMQ notification queue — producer side. Worker runs in a separate process.
 * No-throw enqueue: logs + metrics on failure or rate limit.
 */
import { Queue } from "bullmq";
import { createRedisConnection, getRedisUrl, incrementRateLimit } from "./redis.js";

export const NOTIFICATION_QUEUE_NAME = "notifications";

const MAX_JOBS_PER_USER_PER_MIN = 30;
const MAX_NOTIFICATIONS_PER_CLINIC_PER_MIN = 200;
const MAX_AUTOMATION_EXEC_PER_CLINIC_PER_MIN = 50;
const MAX_ESCALATION_ENQUEUE_PER_CLINIC_PER_MIN = 10;

export const queueMetrics = {
  enqueued: 0,
  completed: 0,
  failed: 0,
  droppedRateLimit: 0,
  droppedNoRedis: 0,
  circuitQueueBroken: 0,
};

let notificationsQueue: Queue | null = null;
let queueInitFailed = false;

function defaultJobOptions() {
  return {
    attempts: 3,
    backoff: { type: "exponential" as const, delay: 2000 },
    removeOnComplete: 1000,
    removeOnFail: 5000,
  };
}

export function getNotificationsQueue(): Queue | null {
  if (queueInitFailed) return null;
  if (notificationsQueue) return notificationsQueue;
  if (!getRedisUrl()) return null;
  const conn = createRedisConnection();
  if (!conn) {
    queueInitFailed = true;
    console.error("[queue] cannot start notifications queue — Redis unavailable");
    return null;
  }
  try {
    notificationsQueue = new Queue(NOTIFICATION_QUEUE_NAME, {
      connection: conn,
      defaultJobOptions: defaultJobOptions(),
    });
    notificationsQueue.on("error", (err) => {
      console.error("[queue] notifications queue error:", err.message);
      queueMetrics.circuitQueueBroken++;
    });
    console.log("[queue] notifications queue ready");
  } catch (err) {
    queueInitFailed = true;
    console.error("[queue] failed to create queue:", err);
    return null;
  }
  return notificationsQueue;
}

async function allowEnqueue(clinicId: string, userId?: string | null): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const clinicKey = `ratelimit:notify:clinic:${clinicId}:${minute}`;
  const okClinic = await incrementRateLimit(clinicKey, 120, MAX_NOTIFICATIONS_PER_CLINIC_PER_MIN);
  if (!okClinic) return false;

  if (userId?.trim()) {
    const userKey = `ratelimit:notify:user:${userId.trim()}:${minute}`;
    const okUser = await incrementRateLimit(userKey, 120, MAX_JOBS_PER_USER_PER_MIN);
    if (!okUser) return false;
  }
  return true;
}

export type AutomationExecutePayload =
  | { kind: "escalate_overdue"; taskId: string; clinicId: string }
  | { kind: "auto_assign_unassigned"; taskId: string; clinicId: string }
  | { kind: "stuck_recovery"; taskId: string; clinicId: string }
  | { kind: "prestart_reminder"; taskId: string; clinicId: string };

export type NotificationJobData =
  | {
      type: "task_notification";
      event: "TASK_CREATED" | "TASK_STARTED" | "TASK_COMPLETED";
      task: {
        id: string;
        clinicId: string;
        vetId: string | null;
        priority: string;
        animalId?: string | null;
        taskType?: string | null;
        status: string;
        startTime: string;
        endTime: string;
      };
      actor?: { userId: string; email: string } | null;
    }
  | {
      type: "overdue_reminder";
      clinicId: string;
      userId: string;
      count: number;
    }
  | {
      type: "automation_push_user";
      clinicId: string;
      userId: string;
      title: string;
      body: string;
      tag: string;
    }
  | {
      type: "automation_push_role";
      clinicId: string;
      role: string;
      title: string;
      body: string;
      tag: string;
    };

/**
 * Enqueue a notification job. Never throws — API stays safe if Redis/queue down.
 */
export async function enqueueNotificationJob(data: NotificationJobData): Promise<void> {
  const q = getNotificationsQueue();
  if (!q) {
    queueMetrics.droppedNoRedis++;
    console.warn("[queue] enqueue skipped — queue unavailable (REDIS_URL or connection)");
    return;
  }

  const clinicId =
    data.type === "task_notification"
      ? data.task.clinicId
      : data.type === "overdue_reminder"
        ? data.clinicId
        : data.clinicId;
  const userId =
    data.type === "task_notification"
      ? data.task.vetId ?? data.actor?.userId
      : data.type === "overdue_reminder"
        ? data.userId
        : data.type === "automation_push_user"
          ? data.userId
          : null;

  if (data.type === "task_notification") {
    const ok = await allowEnqueue(clinicId, userId);
    if (!ok) {
      queueMetrics.droppedRateLimit++;
      console.warn("[queue] enqueue dropped — rate limit", { clinicId, userId: userId ?? null });
      return;
    }
  }

  if (data.type === "automation_push_user" || data.type === "automation_push_role") {
    const ok = await allowEnqueue(clinicId, userId);
    if (!ok) {
      queueMetrics.droppedRateLimit++;
      console.warn("[queue] enqueue dropped — automation push rate limit", { clinicId });
      return;
    }
  }

  try {
    await q.add("send_notification", data, defaultJobOptions());
    queueMetrics.enqueued++;
  } catch (err) {
    queueMetrics.circuitQueueBroken++;
    console.error("[queue] add failed:", (err as Error).message);
  }
}

/**
 * Enqueue DB-side automation execution (worker only).
 * jobId includes a 1-minute bucket so BullMQ can retry / re-enqueue without permanent collision.
 */
export async function enqueueAutomationExecuteJob(payload: AutomationExecutePayload): Promise<void> {
  const q = getNotificationsQueue();
  if (!q) {
    queueMetrics.droppedNoRedis++;
    return;
  }
  const minute = Math.floor(Date.now() / 60000);
  const clinicId = payload.clinicId.trim();
  if (payload.kind === "escalate_overdue") {
    const key = `ratelimit:automation_enqueue:escalate:${clinicId}:${minute}`;
    const ok = await incrementRateLimit(key, 120, MAX_ESCALATION_ENQUEUE_PER_CLINIC_PER_MIN);
    if (!ok) {
      console.log("AUTOMATION_RULE_SKIPPED", { rule: "overdue_escalation", taskId: payload.taskId, clinicId, reason: "enqueue_rate_limit" });
      return;
    }
  } else {
    const key = `ratelimit:automation_enqueue:exec:${clinicId}:${minute}`;
    const ok = await incrementRateLimit(key, 120, MAX_AUTOMATION_EXEC_PER_CLINIC_PER_MIN);
    if (!ok) {
      console.log("AUTOMATION_RULE_SKIPPED", { rule: payload.kind, taskId: payload.taskId, clinicId, reason: "enqueue_rate_limit" });
      return;
    }
  }
  try {
    const bucket = Math.floor(Date.now() / 60000);
    await q.add("automation_execute", payload, {
      ...defaultJobOptions(),
      jobId: `auto-${payload.kind}-${payload.taskId}-${bucket}`,
    });
    queueMetrics.enqueued++;
  } catch (err) {
    queueMetrics.circuitQueueBroken++;
    console.error("[queue] automation_execute add failed:", (err as Error).message);
  }
}

export type AutomationNotifyArgs =
  | {
      clinicId: string;
      userId: string;
      title: string;
      body: string;
      tag: string;
      rateLimitAs: "escalation" | "default";
    }
  | {
      clinicId: string;
      role: string;
      title: string;
      body: string;
      tag: string;
      rateLimitAs: "default";
    };

/** Push notifications from automation rules (queued, not inline). */
export async function enqueueAutomationNotificationJobs(args: AutomationNotifyArgs): Promise<void> {
  const minute = Math.floor(Date.now() / 60000);
  if (args.rateLimitAs === "escalation") {
    const key = `ratelimit:automation_notify:escalate:${args.clinicId}:${minute}`;
    const ok = await incrementRateLimit(key, 120, MAX_ESCALATION_ENQUEUE_PER_CLINIC_PER_MIN);
    if (!ok) return;
  }
  if ("userId" in args) {
    await enqueueNotificationJob({
      type: "automation_push_user",
      clinicId: args.clinicId,
      userId: args.userId,
      title: args.title,
      body: args.body,
      tag: args.tag,
    });
  } else {
    await enqueueNotificationJob({
      type: "automation_push_role",
      clinicId: args.clinicId,
      role: args.role,
      title: args.title,
      body: args.body,
      tag: args.tag,
    });
  }
}

export async function getQueueJobCounts(): Promise<Record<string, number> | null> {
  const q = getNotificationsQueue();
  if (!q) return null;
  try {
    return await q.getJobCounts(
      "wait",
      "active",
      "completed",
      "failed",
      "delayed",
      "paused",
    );
  } catch {
    return null;
  }
}
