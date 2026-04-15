/** When true, schedulers use short poll intervals and treat "expected return minutes" as seconds for faster local/demo runs. */
export function isTestMode(): boolean {
  const v = process.env.TEST_MODE?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Poll interval for vt_scheduled_notifications processor (ms). */
export function getScheduledNotificationPollIntervalMs(): number {
  return isTestMode() ? 5_000 : 60_000;
}

/**
 * Multiplier from "expected return minutes" to delay: in production 1 minute = 60_000 ms;
 * in TEST_MODE 1 unit = 1 second so `2` → 2s instead of 2 minutes.
 */
export function getReturnReminderDelayMsPerUnit(): number {
  return isTestMode() ? 1_000 : 60_000;
}
