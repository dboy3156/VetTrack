import { JobsOptions, Queue, type Job } from "bullmq";
import { MAX_INVENTORY_JOB_RETRIES } from "../lib/inventory-constants.js";
import { createRedisConnection, getRedisUrl } from "../lib/redis.js";

export const INVENTORY_DEDUCTION_QUEUE_NAME = "inventory-deduction";
export const INVENTORY_DEDUCTION_JOB_NAME = "inventory-deduction";

export interface InventoryDeductionJobData {
  taskId: string;
  containerId: string;
  requiredVolumeMl: number;
  clinicId: string;
  animalId: string | null;
}

let queue: Queue<InventoryDeductionJobData> | null = null;
let queueInitFailed = false;

const defaultJobOptions: JobsOptions = {
  attempts: MAX_INVENTORY_JOB_RETRIES,
  backoff: { type: "exponential", delay: 5000 },
  removeOnComplete: 1000,
  removeOnFail: 5000,
};

async function getQueue(): Promise<Queue<InventoryDeductionJobData>> {
  if (queue) return queue;
  if (queueInitFailed) throw new Error("inventory deduction queue unavailable");
  if (!getRedisUrl()) {
    queueInitFailed = true;
    throw new Error("inventory deduction queue disabled: REDIS_URL missing");
  }

  const connection = await createRedisConnection();
  if (!connection) {
    queueInitFailed = true;
    throw new Error("inventory deduction queue unavailable: Redis connection failed");
  }

  queue = new Queue<InventoryDeductionJobData>(INVENTORY_DEDUCTION_QUEUE_NAME, {
    connection,
    defaultJobOptions,
  });
  queue.on("error", (error) => {
    console.error("[inventory-deduction-queue] queue error", { message: error.message });
  });
  return queue;
}

export const inventoryDeductionQueue = {
  async add(data: InventoryDeductionJobData, options?: JobsOptions): Promise<Job<InventoryDeductionJobData>> {
    const q = await getQueue();
    return q.add(INVENTORY_DEDUCTION_JOB_NAME, data, {
      ...defaultJobOptions,
      ...(options ?? {}),
    });
  },
};
