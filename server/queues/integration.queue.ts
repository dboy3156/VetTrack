import { JobsOptions, Queue, type Job } from "bullmq";
import { createRedisConnection, getRedisUrl } from "../lib/redis.js";
import {
  INTEGRATION_QUEUE_LEGACY_NAME,
  getIntegrationShardCount,
  integrationQueueNameForClinic,
  listIntegrationWorkerQueueNames,
} from "./integration-shards.js";

/** @deprecated Use integrationQueueNameForClinic — kept for imports expecting legacy name. */
export const INTEGRATION_QUEUE_NAME = INTEGRATION_QUEUE_LEGACY_NAME;

export type IntegrationSyncJobType = "patients" | "inventory" | "appointments" | "billing";
export type IntegrationSyncDirection = "inbound" | "outbound";

export interface IntegrationSyncJobData {
  clinicId: string;
  adapterId: string;
  syncType: IntegrationSyncJobType;
  direction: IntegrationSyncDirection;
  /** ISO timestamp — only sync records modified after this time (delta sync) */
  since?: string;
  /** For outbound: the VetTrack record id to push */
  recordId?: string;
  /** When true, worker logs success without mutating VetTrack rows or updating external systems (Phase A §12). */
  dryRun?: boolean;
  /** Correlation id for logs / sync_log.metadata (§9 observability). */
  correlationId?: string;
  /** Upper bound for delta sync windows (worker may ignore until observability lands). */
  until?: string;
  /** Links worker completion to vt_integration_webhook_events (Phase B Sprint 4). */
  webhookEventId?: string;
  /** True when job was scheduled by integration-schedules (Sprint 5). */
  scheduled?: boolean;
}

export type IntegrationQueueFailureReason = "REDIS_URL_MISSING" | "REDIS_CONNECTION_FAILED" | "QUEUE_INIT_FAILED";

/** Maps queue errors to API contract — Phase A §13 (never crash request path). */
export function classifyIntegrationQueueError(err: unknown): {
  code: "INTEGRATIONS_DEGRADED";
  reason: IntegrationQueueFailureReason;
  message: string;
} {
  const message = err instanceof Error ? err.message : String(err);
  if (/REDIS_URL missing|queue disabled/i.test(message)) {
    return { code: "INTEGRATIONS_DEGRADED", reason: "REDIS_URL_MISSING", message };
  }
  if (/connection failed|ECONNREFUSED|Redis/i.test(message)) {
    return { code: "INTEGRATIONS_DEGRADED", reason: "REDIS_CONNECTION_FAILED", message };
  }
  return { code: "INTEGRATIONS_DEGRADED", reason: "QUEUE_INIT_FAILED", message };
}

let queueInitFailed = false;
const queues = new Map<string, Queue<IntegrationSyncJobData>>();

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10000 },
  removeOnComplete: 500,
  removeOnFail: 2000,
};

async function getQueueByName(queueName: string): Promise<Queue<IntegrationSyncJobData>> {
  const existing = queues.get(queueName);
  if (existing) return existing;
  if (queueInitFailed) throw new Error("integration sync queue unavailable");
  if (!getRedisUrl()) {
    queueInitFailed = true;
    throw new Error("integration sync queue disabled: REDIS_URL missing");
  }

  const connection = await createRedisConnection();
  if (!connection) {
    queueInitFailed = true;
    throw new Error("integration sync queue unavailable: Redis connection failed");
  }

  const q = new Queue<IntegrationSyncJobData>(queueName, {
    connection,
    defaultJobOptions,
  });
  q.on("error", (error) => {
    console.error("[integration-queue] queue error", { queueName, message: error.message });
  });
  queues.set(queueName, q);
  return q;
}

/** All shard queues (for health / observability). */
export async function getAllIntegrationQueues(): Promise<Queue<IntegrationSyncJobData>[]> {
  const names = listIntegrationWorkerQueueNames();
  const out: Queue<IntegrationSyncJobData>[] = [];
  for (const name of names) {
    try {
      out.push(await getQueueByName(name));
    } catch {
      /* skip */
    }
  }
  return out;
}

export interface IntegrationQueueCountsAggregate {
  waiting: number;
  failed: number;
  active: number;
  delayed: number;
}

export async function aggregateIntegrationQueueJobCounts(): Promise<IntegrationQueueCountsAggregate> {
  const qs = await getAllIntegrationQueues();
  let waiting = 0;
  let failed = 0;
  let active = 0;
  let delayed = 0;
  for (const q of qs) {
    try {
      const c = await q.getJobCounts();
      waiting += (c as { waiting?: number }).waiting ?? 0;
      failed += (c as { failed?: number }).failed ?? 0;
      active += (c as { active?: number }).active ?? 0;
      delayed += (c as { delayed?: number }).delayed ?? 0;
    } catch {
      /* ignore shard */
    }
  }
  return { waiting, failed, active, delayed };
}

/** Lightweight reachability check for health endpoints (Phase B Sprint 3). */
export async function integrationQueuePing(): Promise<{ ok: boolean }> {
  try {
    const qs = await getAllIntegrationQueues();
    if (qs.length === 0) return { ok: false };
    for (const q of qs) {
      await q.getJobCounts();
    }
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export const integrationQueue = {
  async add(data: IntegrationSyncJobData, options?: JobsOptions): Promise<Job<IntegrationSyncJobData>> {
    const queueName = integrationQueueNameForClinic(data.clinicId);
    const q = await getQueueByName(queueName);
    return q.add(`${data.adapterId}:${data.syncType}:${data.direction}`, data, {
      ...defaultJobOptions,
      ...(options ?? {}),
      jobId: options?.jobId ?? `${data.clinicId}:${data.adapterId}:${data.syncType}:${data.direction}`,
    });
  },
};

/** For tests / observability — current shard configuration. */
export function __integrationShardCountForTests(): number {
  return getIntegrationShardCount();
}
