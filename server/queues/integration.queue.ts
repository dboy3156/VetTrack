import { JobsOptions, Queue, type Job } from "bullmq";
import { createRedisConnection, getRedisUrl } from "../lib/redis.js";

export const INTEGRATION_QUEUE_NAME = "integration-sync";

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
}

let queue: Queue<IntegrationSyncJobData> | null = null;
let queueInitFailed = false;

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 10000 },
  removeOnComplete: 500,
  removeOnFail: 2000,
};

async function getQueue(): Promise<Queue<IntegrationSyncJobData>> {
  if (queue) return queue;
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

  queue = new Queue<IntegrationSyncJobData>(INTEGRATION_QUEUE_NAME, {
    connection,
    defaultJobOptions,
  });
  queue.on("error", (error) => {
    console.error("[integration-queue] queue error", { message: error.message });
  });
  return queue;
}

export const integrationQueue = {
  async add(data: IntegrationSyncJobData, options?: JobsOptions): Promise<Job<IntegrationSyncJobData>> {
    const q = await getQueue();
    return q.add(`${data.adapterId}:${data.syncType}:${data.direction}`, data, {
      ...defaultJobOptions,
      ...(options ?? {}),
      // Dedup key: prevents queueing the same clinic/adapter/type/direction twice in parallel
      jobId: options?.jobId ?? `${data.clinicId}:${data.adapterId}:${data.syncType}:${data.direction}`,
    });
  },
};
