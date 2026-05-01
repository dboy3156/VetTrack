/**
 * BullMQ notification delivery + orphan requeue (used by `server/workers/notification.worker.ts`).
 */
import { sql, and, eq } from "drizzle-orm";
import { BROADCAST_TEMPLATES } from "../routes/shift-chat.js";
import { db, appointments, animals, users } from "../db.js";
import { dispatchTaskNotificationSync } from "../lib/task-notification.js";
import { checkDedupe } from "../lib/push.js";
import {
  finalizeNotificationRequestOutbox,
  mergePushStats,
  sendPushToRole,
  sendPushToUser,
} from "../lib/push.js";
import { enqueueNotificationJob, type NotificationJobData } from "../lib/queue.js";
import { incrementMetric } from "../lib/metrics.js";
import { isCircuitOpen } from "../lib/circuit-breaker.js";
import { withTimeout } from "../lib/timeout.js";
import { getLocaleDictionaries } from "../../lib/i18n/loader.js";
import { translate } from "../../lib/i18n/index.js";
import { serializeTaskForRealtime } from "./appointments.service.js";

const SWEEP_ORPHAN_MAX_AGE_MS = 5 * 60 * 1000;
const SWEEP_BATCH_LIMIT = 40;

const CODE_BLUE_ROLES = ["admin", "vet", "senior_technician", "technician"] as const;

async function getUserLocale(userId: string): Promise<string> {
  try {
    const [row] = await db
      .select({ preferredLocale: users.preferredLocale })
      .from(users)
      .where(eq(users.clerkId, userId))
      .limit(1);
    return row?.preferredLocale ?? "en";
  } catch (err) {
    console.warn("[notification-worker] getUserLocale failed, falling back to 'en':", (err as Error).message);
    return "en";
  }
}

function tPush(locale: string, key: string, params?: Record<string, string | number | boolean>): string {
  const { primary, fallback } = getLocaleDictionaries(locale);
  return translate(primary, key, params, { fallbackDict: fallback, locale });
}

async function handleOverdueReminder(d: { clinicId: string; userId: string; count: number }): Promise<void> {
  if (d.count <= 0) return;
  if (checkDedupe(d.userId, "OVERDUE_REMINDER", 3_600_000)) return;
  const locale = await getUserLocale(d.userId);
  const bodyKey = d.count === 1 ? "push.overdue.body" : "push.overdue.bodyPlural";
  await sendPushToUser(d.clinicId, d.userId, {
    title: tPush(locale, "push.overdue.title"),
    body: tPush(locale, bodyKey, { count: d.count }),
    tag: "overdue-reminder",
    url: "/appointments",
  });
}

export async function processCodeBlueBroadcastJob(data: {
  clinicId: string;
  title: string;
  body: string;
  tag: string;
  notificationRequestOutboxId?: number;
}): Promise<void> {
  const delivery =
    data.notificationRequestOutboxId !== undefined
      ? { requestedOutboxId: data.notificationRequestOutboxId, deferTerminalOutbox: true as const }
      : undefined;
  let agg = { deliveredAny: false, transientFailures: 0, invalidOrGoneCount: 0 };
  for (const role of CODE_BLUE_ROLES) {
    agg = mergePushStats(
      agg,
      await sendPushToRole(
        data.clinicId,
        role,
        { title: data.title, body: data.body, tag: data.tag },
        delivery,
      ),
    );
  }
  if (data.notificationRequestOutboxId !== undefined) {
    await finalizeNotificationRequestOutbox(data.clinicId, data.notificationRequestOutboxId, agg);
  }
}

/** Processes a single `send_notification` BullMQ job payload. */
export async function processNotificationJobPayload(data: NotificationJobData): Promise<void> {
  if (isCircuitOpen("push")) {
    incrementMetric("circuit_breaker_opened");
    console.warn("[notification-worker] push circuit open; skipping notification job");
    return;
  }
  if (data.type === "shift_chat_snooze") {
    const label = BROADCAST_TEMPLATES[data.broadcastKey]?.label ?? data.broadcastKey;
    await withTimeout(
      sendPushToUser(
        data.clinicId,
        data.userId,
        {
          title: `📢 תזכורת: ${label}`,
          body: "טרם אישרת קבלת הפקודה",
          tag: `shift-chat-snooze-${data.messageId}`,
        },
        data.notificationRequestOutboxId !== undefined
          ? { requestedOutboxId: data.notificationRequestOutboxId }
          : undefined,
      ),
      5000,
      "shift_chat_snooze",
    );
    return;
  }
  if (data.type === "task_notification") {
    await withTimeout(
      dispatchTaskNotificationSync(data.event, data.task, data.actor, data.notificationRequestOutboxId),
      5000,
      "task notification",
    );
    return;
  }
  if (data.type === "overdue_reminder") {
    await withTimeout(handleOverdueReminder(data), 5000, "overdue reminder");
    return;
  }
  if (data.type === "automation_push_user") {
    await withTimeout(
      sendPushToUser(data.clinicId, data.userId, {
        title: data.title,
        body: data.body,
        tag: data.tag,
        url: "/appointments",
      }),
      5000,
      "automation push user",
    );
    return;
  }
  if (data.type === "automation_push_role") {
    await withTimeout(
      sendPushToRole(data.clinicId, data.role, {
        title: data.title,
        body: data.body,
        tag: data.tag,
        url: "/appointments",
      }),
      5000,
      "automation push role",
    );
    return;
  }
  if (data.type === "code_blue_broadcast") {
    await withTimeout(processCodeBlueBroadcastJob(data), 15_000, "code_blue_broadcast");
    return;
  }
  if (data.type === "overdue_medication_alert") {
    await withTimeout(
      sendPushToUser(
        data.clinicId,
        data.userId,
        {
          title: "💊 תרופה באיחור",
          body: `${data.animalName} — ${data.drugName} · ${data.minutesLate} דק׳ באיחור`,
          tag: `overdue-med-${data.animalId}`,
          url: `/patients/${data.animalId}`,
        },
        data.notificationRequestOutboxId !== undefined
          ? { requestedOutboxId: data.notificationRequestOutboxId }
          : undefined,
      ),
      5_000,
      "overdue medication alert",
    );
    return;
  }
}

export async function sweepOrphanedNotificationRequests(): Promise<void> {
  const cutoff = new Date(Date.now() - SWEEP_ORPHAN_MAX_AGE_MS);

  const rows = await db.execute(sql`
    SELECT r.id, r.clinic_id, r.payload
    FROM vt_event_outbox r
    WHERE r.type = 'NOTIFICATION_REQUESTED'
      AND r.published_at IS NOT NULL
      AND r.occurred_at < ${cutoff}
      AND NOT EXISTS (
        SELECT 1 FROM vt_event_outbox t
        WHERE t.clinic_id = r.clinic_id
          AND t.type IN ('NOTIFICATION_SENT', 'NOTIFICATION_FAILED')
          AND t.published_at IS NOT NULL
          AND (t.payload::jsonb->>'requestedOutboxId')::bigint = r.id
      )
    ORDER BY r.id ASC
    LIMIT ${SWEEP_BATCH_LIMIT}
  `);

  const raw = rows.rows as Array<{ id: string | number; clinic_id: string; payload: unknown }>;

  for (const row of raw) {
    const id = Number(row.id);
    const clinicId = row.clinic_id;
    const payload = row.payload as Record<string, unknown>;
    const channel = typeof payload.channel === "string" ? payload.channel : "";

    try {
      if (channel === "task_notification") {
        const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
        const taskEventRaw = payload.taskEvent;
        if (!taskId || typeof taskEventRaw !== "string") continue;
        if (!["TASK_CREATED", "TASK_STARTED", "TASK_COMPLETED", "TASK_CANCELLED"].includes(taskEventRaw)) continue;
        const taskEvent = taskEventRaw as
          | "TASK_CREATED"
          | "TASK_STARTED"
          | "TASK_COMPLETED"
          | "TASK_CANCELLED";

        const [appt] = await db
          .select()
          .from(appointments)
          .where(and(eq(appointments.id, taskId), eq(appointments.clinicId, clinicId)))
          .limit(1);
        if (!appt) continue;

        const task = serializeTaskForRealtime(appt);
        await enqueueNotificationJob(
          {
            type: "task_notification",
            event: taskEvent,
            task,
            actor: null,
            notificationRequestOutboxId: id,
          },
          { jobId: `orphan-notification-${id}` },
        );
        continue;
      }

      if (channel === "overdue_medication_alert") {
        const taskId = typeof payload.taskId === "string" ? payload.taskId : "";
        const userId = typeof payload.userId === "string" ? payload.userId : "";
        const animalId = typeof payload.animalId === "string" ? payload.animalId : "";
        if (!taskId || !userId || !animalId) continue;

        const [appt] = await db
          .select()
          .from(appointments)
          .where(and(eq(appointments.id, taskId), eq(appointments.clinicId, clinicId)))
          .limit(1);
        if (!appt || !appt.animalId) continue;

        const now = new Date();
        const minutesLate = Math.floor((now.getTime() - appt.startTime.getTime()) / 60_000);

        const [animalRow] = await db
          .select({ name: animals.name })
          .from(animals)
          .where(and(eq(animals.id, animalId), eq(animals.clinicId, clinicId)))
          .limit(1);
        const animalName = animalRow?.name ?? "—";
        const drugName = appt.notes ?? "תרופה";

        await enqueueNotificationJob(
          {
            type: "overdue_medication_alert",
            clinicId,
            userId,
            animalName,
            drugName,
            minutesLate: Math.max(0, minutesLate),
            animalId,
            notificationRequestOutboxId: id,
          },
          { jobId: `orphan-notification-${id}` },
        );
        continue;
      }

      if (channel === "shift_chat_snooze") {
        const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
        const userId = typeof payload.userId === "string" ? payload.userId : "";
        const broadcastKey = typeof payload.broadcastKey === "string" ? payload.broadcastKey : "";
        if (!messageId || !userId || !broadcastKey) continue;

        await enqueueNotificationJob(
          {
            type: "shift_chat_snooze",
            clinicId,
            userId,
            messageId,
            broadcastKey,
            notificationRequestOutboxId: id,
          },
          { jobId: `orphan-notification-${id}` },
        );
        continue;
      }

      if (channel === "code_blue_role_broadcast") {
        const tag = typeof payload.tag === "string" ? payload.tag : "";
        if (!tag) continue;

        await enqueueNotificationJob(
          {
            type: "code_blue_broadcast",
            clinicId,
            title: "⚠ CODE BLUE",
            body: "CODE BLUE session reminder (replay)",
            tag,
            notificationRequestOutboxId: id,
          },
          { jobId: `orphan-notification-${id}` },
        );
      }
    } catch (err) {
      console.error("[notification-worker] orphan sweep row failed:", {
        outboxId: id,
        err: err instanceof Error ? err.message : err,
      });
    }
  }
}
