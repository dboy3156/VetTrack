import webpush from "web-push";
import { db, pool, pushSubscriptions, serverConfig, users } from "../db.js";
import { eq } from "drizzle-orm";
import * as Sentry from "@sentry/node";

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

const dedupeCache = new Map<string, number>();
const DEDUPE_WINDOW_MS = 60_000;

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const last = dedupeCache.get(key);
  if (last && now - last < DEDUPE_WINDOW_MS) return true;
  dedupeCache.set(key, now);
  setTimeout(() => dedupeCache.delete(key), DEDUPE_WINDOW_MS);
  return false;
}

export function checkDedupe(equipmentId: string, eventType: string): boolean {
  return isDuplicate(`${equipmentId}:${eventType}`);
}

async function dispatchToSub(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: string
): Promise<"ok" | "expired" | "error"> {
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
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload,
      { TTL: 60 }
    );
    return "ok";
  } catch (err: unknown) {
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

export async function sendPushToAll(payload: PushPayload): Promise<void> {
  if (!vapidReady) return;

  const subs = await db.select().from(pushSubscriptions);
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

export async function sendPushToRole(role: string, payload: PushPayload): Promise<void> {

  const allSubs = await db.select({
    endpoint: pushSubscriptions.endpoint,
    p256dh: pushSubscriptions.p256dh,
    auth: pushSubscriptions.auth,
    alertsEnabled: pushSubscriptions.alertsEnabled,
    soundEnabled: pushSubscriptions.soundEnabled,
    userId: pushSubscriptions.userId,
  }).from(pushSubscriptions);

  if (allSubs.length === 0) return;

  const userRows = await db.select({ id: users.id, role: users.role }).from(users);
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
    })
  );

  if (expired.length > 0) await cleanupExpiredEndpoints(expired);
}

export async function sendPushToOthers(excludeUserId: string, payload: PushPayload): Promise<void> {
  if (!vapidReady) return;

  const allSubs = await db.select().from(pushSubscriptions);
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

export async function sendPushToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!vapidReady) return;

  const subs = await db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

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
      if (result === "expired") expired.push(sub.endpoint);
    })
  );

  if (expired.length > 0) await cleanupExpiredEndpoints(expired);
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
