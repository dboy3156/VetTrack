import webpush from "web-push";
import { db, pool, pushSubscriptions, serverConfig, users } from "../db.js";
import { and, eq, isNull } from "drizzle-orm";
import * as Sentry from "@sentry/node";
import { isCircuitOpen, recordFailure, recordSuccess } from "./circuit-breaker.js";
import { incrementMetric } from "./metrics.js";
import { broadcast } from "./realtime.js";
import { withTimeout } from "./timeout.js";

let vapidReady = false;

/** True when public + private VAPID keys are loaded and web-push is configured. */
export function isVapidReady(): boolean {
  return vapidReady;
}

export async function initVapid(): Promise<void> {
  try {
    let publicKey = process.env.VAPID_PUBLIC_KEY ?? "";
    let privateKey = process.env.VAPID_PRIVATE_KEY ?? "";

    if (publicKey && privateKey) {
      webpush.setVapidDetails("mailto:admin@vettrack.app", publicKey, privateKey);
      vapidReady = true;
      console.log("✅ VAPID initialized from environment");
      return;
    }

    const rows = await db
      .select()
      .from(serverConfig)
      .where(eq(serverConfig.key, "vapid_public_key"));

    if (rows.length === 0) {
      const keys = webpush.generateVAPIDKeys();
      publicKey = keys.publicKey;
      privateKey = keys.privateKey;

      await db
        .insert(serverConfig)
        .values([
          { key: "vapid_public_key", value: publicKey },
          { key: "vapid_private_key", value: privateKey },
        ])
        .onConflictDoNothing();

      console.log("✅ VAPID keys generated and stored in database");
    } else {
      publicKey = rows[0].value;
      const privRows = await db
        .select()
        .from(serverConfig)
        .where(eq(serverConfig.key, "vapid_private_key"));
      privateKey = privRows[0]?.value ?? "";
    }

    if (publicKey && privateKey) {
      webpush.setVapidDetails("mailto:admin@vettrack.app", publicKey, privateKey);
      vapidReady = true;
      console.log("✅ VAPID initialized");
    } else {
      console.warn("⚠️  VAPID private key missing — push disabled");
    }
  } catch (err) {
    console.error("❌ VAPID init failed:", err);
  }
}

export async function getVapidPublicKey(): Promise<string | null> {
  if (process.env.VAPID_PUBLIC_KEY) return process.env.VAPID_PUBLIC_KEY;
  try {
    const rows = await db
      .select()
      .from(serverConfig)
      .where(eq(serverConfig.key, "vapid_public_key"));
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

export interface PushPayload {
  title: string;
  body: string;
  tag?: string;
  url?: string;
  silent?: boolean;
}

function assertClinicId(clinicId: string): void {
  if (!clinicId || clinicId.trim() === "") {
    throw new Error("Missing clinicId for push operation");
  }
}

const dedupeCache = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;

function isDuplicate(key: string, windowMs: number): boolean {
  const now = Date.now();
  const last = dedupeCache.get(key);
  if (last && now - last < windowMs) return true;
  dedupeCache.set(key, now);
  setTimeout(() => dedupeCache.delete(key), windowMs);
  return false;
}

/** @param windowMs Optional window (default 60s). Use 3_600_000 for hourly reminders. */
export function checkDedupe(equipmentId: string, eventType: string, windowMs: number = DEDUPE_WINDOW_MS): boolean {
  return isDuplicate(`${equipmentId}:${eventType}`, windowMs);
}

async function dispatchToSub(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<"ok" | "expired" | "error"> {
  if (isCircuitOpen("push")) {
    return "error";
  }
  // S5 — Breadcrumb on every attempt so the Sentry timeline shows push activity.
  // Guard with SENTRY_DSN so these are no-ops when monitoring is not configured.
  if (process.env.SENTRY_DSN) {
    Sentry.addBreadcrumb({
      category: "push.send",
      message: `Push dispatch → ${sub.endpoint.slice(-30)}`,
      level: "info",
    });
  }

  try {
    await withTimeout(
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 60 }
      ),
      5000,
      "web-push send"
    );
    recordSuccess("push");
    incrementMetric("notifications_sent");
    return "ok";
  } catch (err: unknown) {
    recordFailure("push");
    const e = err as { statusCode?: number };
    if (e?.statusCode === 410 || e?.statusCode === 404) return "expired";

    // S5 — Capture non-expiry send errors as distinct Sentry events so they
    // appear in the "push.failure" tag query on the Sentry dashboard.
    if (process.env.SENTRY_DSN) {
      Sentry.captureEvent({
        message: "Push notification send failed",
        level: "error",
        tags: { "push.failure": "true" },
        extra: {
          endpoint: sub.endpoint.slice(-40),
          statusCode: e?.statusCode ?? "unknown",
        },
      });
    }

    incrementMetric("notifications_failed");
    return "error";
  }
}

async function cleanupExpiredEndpoints(endpoints: string[]): Promise<void> {
  for (const endpoint of endpoints) {
    await db
      .delete(pushSubscriptions)
      .where(eq(pushSubscriptions.endpoint, endpoint))
      .catch(() => {});
  }
}

export async function sendPushToAll(clinicId: string, payload: PushPayload): Promise<void> {
  assertClinicId(clinicId);
  if (!vapidReady) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.clinicId, clinicId));
  if (subs.length === 0) return;

  const expired: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      if (!sub.alertsEnabled) return;

      const effectiveSilent = !sub.soundEnabled ? true : (payload.silent ?? false);
      const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        tag: payload.tag,
        url: payload.url,
        silent: effectiveSilent,
      });

      const result = await dispatchToSub(sub, notificationPayload);
      if (result === "expired") expired.push(sub.endpoint);
    })
  );

  if (expired.length > 0) await cleanupExpiredEndpoints(expired);
}

export async function sendPushToRole(clinicId: string, role: string, payload: PushPayload): Promise<void> {
  assertClinicId(clinicId);

  const allSubs = await db.select({
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
    alertsEnabled: pushSubscriptions.alertsEnabled,
    soundEnabled: pushSubscriptions.soundEnabled,
    userId: pushSubscriptions.userId,
  }).from(pushSubscriptions).where(eq(pushSubscriptions.clinicId, clinicId));

  if (allSubs.length === 0) return;

  const userRows = await db
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.clinicId, clinicId), isNull(users.deletedAt)));
  const roleMap = new Map(userRows.map((u) => [u.id, u.role]));

  const subs = allSubs.filter((s) => roleMap.get(s.userId) === role);
  if (subs.length === 0) return;

  const expired: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      const effectiveSilent = !sub.soundEnabled ? true : (payload.silent ?? false);
      const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        tag: payload.tag,
        url: payload.url,
        silent: effectiveSilent,
      });
      const result = await dispatchToSub(sub, notificationPayload);
      if (result === 'expired') expired.push(sub.endpoint);
      if (result === "ok") {
        broadcast(clinicId, {
          type: "NOTIFICATION_SENT",
          payload: { scope: "role", role, userId: sub.userId, tag: payload.tag ?? null, title: payload.title },
        });
      }
    })
  );

  if (expired.length > 0) await cleanupExpiredEndpoints(expired);
}

export async function sendPushToOthers(clinicId: string, excludeUserId: string, payload: PushPayload): Promise<void> {
  assertClinicId(clinicId);
  if (!vapidReady) return;

  const allSubs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.clinicId, clinicId));
  const subs = allSubs.filter((s) => s.userId !== excludeUserId);
  if (subs.length === 0) return;

  const expired: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      if (!sub.alertsEnabled) return;

      const effectiveSilent = !sub.soundEnabled ? true : (payload.silent ?? false);
      const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        tag: payload.tag,
        url: payload.url,
        silent: effectiveSilent,
      });

      const result = await dispatchToSub(sub, notificationPayload);
      if (result === "expired") expired.push(sub.endpoint);
    })
  );

  if (expired.length > 0) await cleanupExpiredEndpoints(expired);
}

export async function sendPushToUser(clinicId: string, userId: string, payload: PushPayload): Promise<void> {
  assertClinicId(clinicId);
  if (!vapidReady) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.clinicId, clinicId), eq(pushSubscriptions.userId, userId)));

  if (subs.length === 0) return;

  const expired: string[] = [];
  let deliveredCount = 0;
  let failedCount = 0;

  await Promise.all(
    subs.map(async (sub) => {
      const effectiveSilent = !sub.soundEnabled ? true : (payload.silent ?? false);
      const notificationPayload = JSON.stringify({
        title: payload.title,
        body: payload.body,
        tag: payload.tag,
        url: payload.url,
        silent: effectiveSilent,
      });

      const result = await dispatchToSub(sub, notificationPayload);
      if (result === "ok") deliveredCount += 1;
      if (result === "error") failedCount += 1;
      if (result === "expired") expired.push(sub.endpoint);
      if (result === "ok") {
        broadcast(clinicId, {
          type: "NOTIFICATION_SENT",
          payload: { scope: "user", userId, tag: payload.tag ?? null, title: payload.title },
        });
      }
    })
  );

  if (expired.length > 0) await cleanupExpiredEndpoints(expired);

  if (deliveredCount === 0 && failedCount > 0) {
    throw new Error(`Push delivery failed for user ${userId}`);
  }
}

const PUSH_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
let pushCleanupSchedulerStarted = false;

/** Remove subscriptions for soft-deleted or removed users (table hygiene; 410/404 cleanup happens on send). */
export async function cleanupStalePushSubscriptions(): Promise<void> {
  const result = await pool.query(`
    DELETE FROM vt_push_subscriptions
    WHERE user_id IN (SELECT id FROM vt_users WHERE deleted_at IS NOT NULL)
       OR user_id NOT IN (SELECT id FROM vt_users)
  `);
  const deleted = result.rowCount ?? 0;
  if (deleted > 0) {
    console.log(`[push-cleanup] removed ${deleted} stale subscription(s)`);
  }
}

export function startPushCleanupScheduler(): void {
  if (pushCleanupSchedulerStarted) return;
  pushCleanupSchedulerStarted = true;

  cleanupStalePushSubscriptions().catch((err) => {
    console.error("[push-cleanup] startup run failed:", err);
  });

  setInterval(() => {
    cleanupStalePushSubscriptions().catch((err) => {
      console.error("[push-cleanup] scheduled run failed:", err);
    });
  }, PUSH_CLEANUP_INTERVAL_MS);
}
