/**
 * Task notification orchestration — enqueue-only from API paths; worker executes pushes.
 * "Manager" visibility: DB roles are admin | vet | technician | student — TASK_STARTED/COMPLETED
 * notify admin + vet (no `manager` role string in schema).
 */
import { logAudit } from "./audit.js";
import { incrementMetric } from "./metrics.js";
import { enqueueNotificationJob } from "./queue.js";
import {
  checkDedupe,
  finalizeNotificationRequestOutbox,
  mergePushStats,
  sendPushToRole,
  sendPushToUser,
  type PushDeliveryContext,
  type PushSendResult,
} from "./push.js";

/** Task lifecycle events that trigger web push orchestration (not DB enums). */
export type TaskNotificationEvent = "TASK_CREATED" | "TASK_STARTED" | "TASK_COMPLETED" | "TASK_CANCELLED";

/** Minimal task snapshot from appointments serialization — clinic-scoped. */
export interface TaskNotificationTask {
  id: string;
  clinicId: string;
  vetId: string | null;
  priority: string;
  animalId?: string | null;
  taskType?: string | null;
  status: string;
  startTime: string;
  endTime: string;
}

export interface TaskNotificationActor {
  userId: string;
  email: string;
  role?: string;
}

function taskTag(event: TaskNotificationEvent, taskId: string): string {
  return `task-${event}-${taskId}`;
}

/** Payload for `NOTIFICATION_REQUESTED` rows (same transaction as the task mutation). */
export function buildTaskNotificationRequestedPayload(
  taskEvent: TaskNotificationEvent,
  taskId: string,
): { channel: "task_notification"; taskEvent: TaskNotificationEvent; taskId: string } {
  return { channel: "task_notification", taskEvent, taskId };
}

function formatWindow(startIso: string, endIso: string): string {
  try {
    const s = new Date(startIso);
    const e = new Date(endIso);
    if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return "";
    return `${s.toISOString().slice(0, 16).replace("T", " ")}–${e.toISOString().slice(11, 16)} UTC`;
  } catch {
    return "";
  }
}

/**
 * Executes pushes + audit (runs in BullMQ worker only).
 */
export async function dispatchTaskNotificationSync(
  event: TaskNotificationEvent,
  task: TaskNotificationTask,
  actor?: TaskNotificationActor | null,
  notificationRequestOutboxId?: number,
): Promise<void> {
  const clinicId = task.clinicId?.trim();
  if (!clinicId) return;

  const priority = task.priority ?? "normal";
  const isCritical = priority === "critical";

  const delivery: PushDeliveryContext | undefined =
    notificationRequestOutboxId !== undefined
      ? { requestedOutboxId: notificationRequestOutboxId, deferTerminalOutbox: true }
      : undefined;

  let agg: PushSendResult = { deliveredAny: false, transientFailures: 0, invalidOrGoneCount: 0 };

  const windowLabel = formatWindow(task.startTime, task.endTime);
  const asset = task.animalId?.trim() || "Unassigned asset";
  const typeLabel = task.taskType?.trim() || "task";
  const medicationUrl = task.taskType === "medication" ? "/meds" : "/appointments";

  const payloadFor = (title: string, body: string) => ({
    title,
    body,
    tag: taskTag(event, task.id),
    url: medicationUrl,
  });

  try {
    if (event === "TASK_CREATED") {
      if (isCritical) {
        agg = mergePushStats(
          agg,
          await sendPushToRole(
            clinicId,
            "technician",
            payloadFor(
              "Critical task created",
              `${typeLabel} · ${asset}${windowLabel ? ` · ${windowLabel}` : ""} · ${task.id.slice(0, 8)}…`,
            ),
            delivery,
          ),
        );
        logAudit({
          clinicId,
          actionType: "CRITICAL_NOTIFICATION_SENT",
          performedBy: actor?.userId ?? "system",
          performedByEmail: actor?.email ?? "system@vettrack.internal",
          actorRole: actor?.role ?? "system",
          targetId: task.id,
          targetType: "task",
          metadata: {
            event: "TASK_CREATED",
            priority: "critical",
            audience: "technician_role",
          },
        });
        if (process.env.NODE_ENV !== "production") console.log("[task-notification] push dispatched", { userId: null, clinicId, type: event });
      } else if (task.vetId) {
        agg = mergePushStats(
          agg,
          await sendPushToUser(
            clinicId,
            task.vetId,
            payloadFor(
              "New task assigned",
              `${typeLabel} · ${asset}${windowLabel ? ` · ${windowLabel}` : ""}`,
            ),
            delivery,
          ),
        );
        if (process.env.NODE_ENV !== "production") console.log("[task-notification] push dispatched", { userId: task.vetId, clinicId, type: event });
      }
    } else if (event === "TASK_STARTED") {
      const body = `${typeLabel} · ${asset} · ${task.vetId ?? "tech"}${windowLabel ? ` · ${windowLabel}` : ""}`;
      agg = mergePushStats(agg, await sendPushToRole(clinicId, "admin", payloadFor("Task started", body), delivery));
      agg = mergePushStats(agg, await sendPushToRole(clinicId, "vet", payloadFor("Task started", body), delivery));
      if (process.env.NODE_ENV !== "production") console.log("[task-notification] push dispatched", { userId: task.vetId ?? null, clinicId, type: event });
    } else if (event === "TASK_COMPLETED") {
      const body = `${typeLabel} · ${asset} · ${task.vetId ?? "tech"}${windowLabel ? ` · ${windowLabel}` : ""}`;
      agg = mergePushStats(agg, await sendPushToRole(clinicId, "admin", payloadFor("Task completed", body), delivery));
      agg = mergePushStats(agg, await sendPushToRole(clinicId, "vet", payloadFor("Task completed", body), delivery));
      if (process.env.NODE_ENV !== "production") console.log("[task-notification] push dispatched", { userId: task.vetId ?? null, clinicId, type: event });
    } else if (event === "TASK_CANCELLED" && task.vetId) {
      agg = mergePushStats(
        agg,
        await sendPushToUser(
          clinicId,
          task.vetId,
          payloadFor("Task cancelled", `${typeLabel} · ${asset}${windowLabel ? ` · ${windowLabel}` : ""}`),
          delivery,
        ),
      );
    }

    if (notificationRequestOutboxId !== undefined) {
      await finalizeNotificationRequestOutbox(clinicId, notificationRequestOutboxId, agg);
    }
  } catch (err) {
    incrementMetric("notifications_failed");
    console.error("[task-notification] dispatch failed:", err);
    throw err;
  }
}

/**
 * Enqueues task notification (no I/O push in request path).
 * Uses {@link checkDedupe} with key `${taskId}:${event}` unless priority is critical (bypass).
 */
export async function sendTaskNotification(
  event: TaskNotificationEvent,
  task: TaskNotificationTask,
  actor?: TaskNotificationActor | null,
  notificationRequestOutboxId?: number,
): Promise<void> {
  const clinicId = task.clinicId?.trim();
  if (!clinicId) return;

  const priority = task.priority ?? "normal";
  const isCritical = priority === "critical";

  if (!isCritical && checkDedupe(task.id, event)) {
    return;
  }

  await enqueueNotificationJob({
    type: "task_notification",
    event,
    task,
    actor: actor ?? null,
    ...(notificationRequestOutboxId !== undefined ? { notificationRequestOutboxId } : {}),
  });
}
