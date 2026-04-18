import { initVapid, startPushCleanupScheduler } from "../lib/push.js";
import { startCleanupScheduler } from "../lib/cleanup-scheduler.js";
import {
  startScheduledNotificationProcessor,
  startSmartRoleNotificationScheduler,
} from "../lib/role-notification-scheduler.js";
import { startAccessDeniedMetricsWindowScheduler } from "../lib/access-denied.js";
import { startSystemWatchdog } from "../lib/system-watchdog.js";
import { startExpiryCheckWorker } from "../workers/expiryCheckWorker.js";
import { startChargeAlertWorker } from "../workers/chargeAlertWorker.js";
import { startSmartflowSyncWorker } from "../workers/smartflowSyncWorker.js";

export async function startBackgroundSchedulers() {
  await initVapid();
  startPushCleanupScheduler();
  startCleanupScheduler();
  startAccessDeniedMetricsWindowScheduler();
  startScheduledNotificationProcessor();
  startSmartRoleNotificationScheduler();
  startSystemWatchdog();
  await startExpiryCheckWorker();
  await startChargeAlertWorker();
  await startSmartflowSyncWorker();
}
