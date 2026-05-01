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
import { startInventoryDeductionWorker } from "../workers/inventory-deduction.worker.js";
import { startIntegrationWorker } from "../workers/integration.worker.js";
import { startIntegrationScheduleJobs } from "../integrations/jobs/integration-schedules.js";
import { startIntegrationRetentionCron } from "../integrations/jobs/integration-retention.js";
import { startErHandoffSlaScheduler } from "../services/er-handoff-sla.service.js";
import { startErKpiDailyRollupScheduler } from "../services/er-kpi-rollup.service.js";

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
  await startInventoryDeductionWorker();
  await startIntegrationWorker();
  startIntegrationScheduleJobs();
  startIntegrationRetentionCron();
  startErKpiDailyRollupScheduler();
  startErHandoffSlaScheduler();
}
