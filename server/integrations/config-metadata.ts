/**
 * Zod-validated subsets of vt_integration_configs.metadata — Phase A §18 migration types only.
 */

import { z } from "zod";

/** PMS migration framework — types only in Phase A (no dual-run enforcement). */
export const migrationStateSchema = z.object({
  sourceAdapterId: z.string().min(1).optional(),
  targetAdapterId: z.string().min(1).optional(),
  status: z.enum(["planned", "dual_run", "cutover", "completed", "rolled_back"]).optional(),
  rollbackUntil: z.string().min(1).optional(),
});

export type IntegrationMigrationMetadata = z.infer<typeof migrationStateSchema>;

/** Top-level metadata envelope (extensible — unknown keys preserved when merging). */
export const conflictPolicySchema = z.object({
  patients: z
    .enum(["vettrack_wins", "external_wins", "manual_required", "newest_timestamp_wins"])
    .optional(),
});

export const securityMetadataSchema = z.object({
  webhookAllowCidrs: z.array(z.string()).optional(),
  activeSecretId: z.string().optional(),
});

export const vendorRolloutFlagsSchema = z.object({
  vendorXEnabled: z.boolean().optional(),
  outboundWritesEnabled: z.boolean().optional(),
  sandboxOnly: z.boolean().optional(),
});

export const integrationMetadataEnvelopeSchema = z
  .object({
    migration: migrationStateSchema.optional(),
    conflictPolicy: conflictPolicySchema.optional(),
    security: securityMetadataSchema.optional(),
    flags: vendorRolloutFlagsSchema.optional(),
    environment: z.enum(["sandbox", "production"]).optional(),
  })
  .passthrough();

export type IntegrationMetadataEnvelope = z.infer<typeof integrationMetadataEnvelopeSchema>;

export function parseIntegrationMetadataPatch(input: unknown): IntegrationMetadataEnvelope {
  const parsed = integrationMetadataEnvelopeSchema.safeParse(input ?? {});
  if (!parsed.success) {
    throw new Error(`integration metadata: ${parsed.error.message}`);
  }
  return parsed.data;
}

/** Merge existing JSON metadata with a validated PATCH ( shallow merge for known keys ). */
export function mergeIntegrationMetadata(
  existing: Record<string, unknown> | null | undefined,
  patch: IntegrationMetadataEnvelope,
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...existing }
      : {};
  if (patch.migration !== undefined) {
    base.migration = { ...(typeof base.migration === "object" && base.migration ? base.migration : {}), ...patch.migration };
  }
  if (patch.conflictPolicy !== undefined) {
    base.conflictPolicy = {
      ...(typeof base.conflictPolicy === "object" && base.conflictPolicy ? base.conflictPolicy : {}),
      ...patch.conflictPolicy,
    };
  }
  if (patch.security !== undefined) {
    base.security = {
      ...(typeof base.security === "object" && base.security ? base.security : {}),
      ...patch.security,
    };
  }
  if (patch.flags !== undefined) {
    base.flags = {
      ...(typeof base.flags === "object" && base.flags ? base.flags : {}),
      ...patch.flags,
    };
  }
  if (patch.environment !== undefined) {
    base.environment = patch.environment;
  }
  for (const [k, v] of Object.entries(patch)) {
    if (k === "migration" || k === "conflictPolicy" || k === "security" || k === "flags" || k === "environment")
      continue;
    if (v !== undefined) base[k] = v;
  }
  return base;
}
