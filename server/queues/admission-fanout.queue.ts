import { type JobsOptions, Queue, type Job } from "bullmq";
import { createRedisConnection, getRedisUrl } from "../lib/redis.js";

export const ADMISSION_FANOUT_QUEUE_NAME = "admission-fanout";
export const ADMISSION_FANOUT_JOB_NAME = "admission-fanout";

export interface AdmissionFanoutJobData {
  clinicId: string;
  intakeEventId: string;
  recipientUserIds: string[];
}

let queue: Queue<AdmissionFanoutJobData> | null = null;
let queueInitFailed = false;

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 3000 },
  removeOnComplete: 500,
  removeOnFail: 2000,
};

async function getQueue(): Promise<Queue<AdmissionFanoutJobData>> {
  if (queue) return queue;
  if (queueInitFailed) throw new Error("admission-fanout queue unavailable");
  if (!getRedisUrl()) {
    queueInitFailed = true;
    throw new Error("admission-fanout queue disabled: REDIS_URL missing");
  }

  const connection = await createRedisConnection();
  if (!connection) {
    queueInitFailed = true;
    throw new Error("admission-fanout queue unavailable: Redis connection failed");
  }

  queue = new Queue<AdmissionFanoutJobData>(ADMISSION_FANOUT_QUEUE_NAME, {
    connection,
    defaultJobOptions,
  });
  queue.on("error", (error) => {
    console.error("[admission-fanout-queue] error", { message: error.message });
  });
  return queue;
}

export const admissionFanoutQueue = {
  async add(
    data: AdmissionFanoutJobData,
    options?: JobsOptions,
  ): Promise<Job<AdmissionFanoutJobData>> {
    const q = await getQueue();
    return q.add(ADMISSION_FANOUT_JOB_NAME, data, {
      ...defaultJobOptions,
      ...(options ?? {}),
    });
  },

  /** No-op safe enqueue — logs QUEUE_DISABLED_NO_REDIS if Redis is unavailable. */
  async tryAdd(data: AdmissionFanoutJobData): Promise<void> {
    try {
      await admissionFanoutQueue.add(data);
    } catch {
      console.warn("[admission-fanout] QUEUE_DISABLED_NO_REDIS — push skipped, SSE still fires");
    }
  },
};
