/**
 * Integration sync queue sharding — Phase D Sprint 1.
 * INTEGRATION_QUEUE_SHARDS=N (default 1): names integration-sync-0 .. integration-sync-(N-1).
 * When unset or 1: legacy single queue name `integration-sync` (backward compatible).
 */

import { createHash } from "crypto";

/** Legacy BullMQ queue name when shard count is 1. */
export const INTEGRATION_QUEUE_LEGACY_NAME = "integration-sync";

const MAX_SHARDS = 64;

export function getIntegrationShardCount(): number {
  const raw = process.env.INTEGRATION_QUEUE_SHARDS?.trim();
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), MAX_SHARDS);
}

/** Stable shard index for a clinic (0 .. shardCount-1). */
export function clinicShardIndex(clinicId: string, shardCount: number): number {
  if (shardCount <= 1) return 0;
  const buf = createHash("sha256").update(clinicId, "utf8").digest();
  const v = buf.readUInt32BE(0);
  return v % shardCount;
}

/** BullMQ queue name for the given shard index. */
export function integrationQueueNameForShard(shardIndex: number): string {
  const shards = getIntegrationShardCount();
  if (shards <= 1) return INTEGRATION_QUEUE_LEGACY_NAME;
  return `integration-sync-${shardIndex}`;
}

/** Queue name used for enqueue for this clinic. */
export function integrationQueueNameForClinic(clinicId: string): string {
  const shards = getIntegrationShardCount();
  const idx = clinicShardIndex(clinicId, shards);
  return integrationQueueNameForShard(idx);
}

/** All queue names the worker must subscribe to (deduped). */
export function listIntegrationWorkerQueueNames(): string[] {
  const shards = getIntegrationShardCount();
  if (shards <= 1) return [INTEGRATION_QUEUE_LEGACY_NAME];
  const names = new Set<string>();
  for (let i = 0; i < shards; i++) {
    names.add(integrationQueueNameForShard(i));
  }
  return Array.from(names);
}
