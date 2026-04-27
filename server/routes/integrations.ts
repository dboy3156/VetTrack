/**
 * Integration configuration and sync management routes.
 *
 * PERMISSIONS MATRIX — /api/integrations
 * ─────────────────────────────────────────────────────────────────
 * GET    /adapters                admin-only  List all registered adapters
 * GET    /configs                 admin-only  List integration configs for clinic
 * POST   /configs                 admin-only  Create or enable an integration
 * GET    /configs/:adapterId      admin-only  Get config for one adapter
 * PATCH  /configs/:adapterId      admin-only  Update sync flags / timestamps
 * DELETE /configs/:adapterId      admin-only  Disable and remove credentials
 * POST   /configs/:adapterId/credentials  admin-only  Store/update credentials
 * POST   /configs/:adapterId/validate     admin-only  Validate credentials against adapter
 * POST   /configs/:adapterId/sync         admin-only  Trigger manual sync job
 * GET    /configs/:adapterId/logs         admin-only  Fetch sync log entries
 * ─────────────────────────────────────────────────────────────────
 * All routes are admin-only — integration config is a privileged operation.
 * Credentials are never returned in responses (write-only).
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db, integrationConfigs, integrationSyncLog } from "../db.js";
import { requireAdmin } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { listAdapters, getAdapter, isKnownAdapter } from "../integrations/index.js";
import {
  storeCredentials,
  deleteCredentials,
  validateCredentialKeys,
} from "../integrations/credential-manager.js";
import { integrationQueue } from "../queues/integration.queue.js";
import type { IntegrationSyncJobType, IntegrationSyncDirection } from "../queues/integration.queue.js";
import { logAudit, resolveAuditActorRole } from "../lib/audit.js";

const router = Router();

function apiError(params: {
  code: string;
  reason: string;
  message: string;
  requestId: string;
}) {
  return {
    code: params.code,
    error: params.code,
    reason: params.reason,
    message: params.message,
    requestId: params.requestId,
  };
}

// ---------------------------------------------------------------------------
// GET /adapters — list registered adapters (no credentials, no clinic data)
// ---------------------------------------------------------------------------
router.get("/adapters", requireAdmin, (req, res) => {
  const adapters = listAdapters().map((a) => ({
    id: a.id,
    name: a.name,
    version: a.version,
    capabilities: a.capabilities,
    requiredCredentials: a.requiredCredentials,
  }));
  res.json({ adapters });
});

// ---------------------------------------------------------------------------
// GET /configs — list all configs for the authenticated clinic
// ---------------------------------------------------------------------------
router.get("/configs", requireAdmin, async (req, res) => {
  const requestId = randomUUID();
  const clinicId = req.clinicId!;

  const configs = await db
    .select()
    .from(integrationConfigs)
    .where(eq(integrationConfigs.clinicId, clinicId))
    .orderBy(integrationConfigs.adapterId);

  // Strip nothing — credentials are not in configs table
  res.json({ configs });
});

// ---------------------------------------------------------------------------
// POST /configs — upsert integration config
// ---------------------------------------------------------------------------
const createConfigSchema = z.object({
  adapterId: z.string().min(1),
  enabled: z.boolean().optional(),
  syncPatients: z.boolean().optional(),
  syncInventory: z.boolean().optional(),
  syncAppointments: z.boolean().optional(),
  exportBilling: z.boolean().optional(),
});

router.post("/configs", requireAdmin, validateBody(createConfigSchema), async (req, res) => {
  const requestId = randomUUID();
  const clinicId = req.clinicId!;
  const body = req.body as z.infer<typeof createConfigSchema>;

  if (!isKnownAdapter(body.adapterId)) {
    return res.status(400).json(apiError({ code: "UNKNOWN_ADAPTER", reason: `No adapter registered with id "${body.adapterId}"`, message: "Unknown adapter", requestId }));
  }

  const existing = await db
    .select({ id: integrationConfigs.id })
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, body.adapterId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (existing) {
    const [updated] = await db
      .update(integrationConfigs)
      .set({
        enabled: body.enabled ?? undefined,
        syncPatients: body.syncPatients ?? undefined,
        syncInventory: body.syncInventory ?? undefined,
        syncAppointments: body.syncAppointments ?? undefined,
        exportBilling: body.exportBilling ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(integrationConfigs.id, existing.id))
      .returning();
    logAudit({ actorRole: resolveAuditActorRole(req), clinicId, actionType: "integration_config_updated", performedBy: req.authUser!.id, performedByEmail: req.authUser!.email ?? "", targetId: existing.id, targetType: "integration_config", metadata: { adapterId: body.adapterId, patch: body } });
    return res.json({ config: updated });
  }

  const [created] = await db
    .insert(integrationConfigs)
    .values({
      id: nanoid(),
      clinicId,
      adapterId: body.adapterId,
      enabled: body.enabled ?? false,
      syncPatients: body.syncPatients ?? false,
      syncInventory: body.syncInventory ?? false,
      syncAppointments: body.syncAppointments ?? false,
      exportBilling: body.exportBilling ?? false,
    })
    .returning();

  logAudit({ actorRole: resolveAuditActorRole(req), clinicId, actionType: "integration_config_created", performedBy: req.authUser!.id, performedByEmail: req.authUser!.email ?? "", targetId: created.id, targetType: "integration_config", metadata: { adapterId: body.adapterId } });
  res.status(201).json({ config: created });
});

// ---------------------------------------------------------------------------
// GET /configs/:adapterId
// ---------------------------------------------------------------------------
router.get("/configs/:adapterId", requireAdmin, async (req, res) => {
  const requestId = randomUUID();
  const clinicId = req.clinicId!;
  const { adapterId } = req.params;

  const config = await db
    .select()
    .from(integrationConfigs)
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)))
    .limit(1)
    .then((rows) => rows[0] ?? null);

  if (!config) {
    return res.status(404).json(apiError({ code: "CONFIG_NOT_FOUND", reason: "No config for this adapter", message: "Integration config not found", requestId }));
  }

  res.json({ config });
});

// ---------------------------------------------------------------------------
// PATCH /configs/:adapterId — update flags
// ---------------------------------------------------------------------------
const patchConfigSchema = z.object({
  enabled: z.boolean().optional(),
  syncPatients: z.boolean().optional(),
  syncInventory: z.boolean().optional(),
  syncAppointments: z.boolean().optional(),
  exportBilling: z.boolean().optional(),
});

router.patch("/configs/:adapterId", requireAdmin, validateBody(patchConfigSchema), async (req, res) => {
  const requestId = randomUUID();
  const clinicId = req.clinicId!;
  const { adapterId } = req.params;
  const body = req.body as z.infer<typeof patchConfigSchema>;

  const [updated] = await db
    .update(integrationConfigs)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)))
    .returning();

  if (!updated) {
    return res.status(404).json(apiError({ code: "CONFIG_NOT_FOUND", reason: "No config for this adapter", message: "Integration config not found", requestId }));
  }

  res.json({ config: updated });
});

// ---------------------------------------------------------------------------
// DELETE /configs/:adapterId — disable and remove credentials
// ---------------------------------------------------------------------------
router.delete("/configs/:adapterId", requireAdmin, async (req, res) => {
  const requestId = randomUUID();
  const clinicId = req.clinicId!;
  const { adapterId } = req.params;

  const deleted = await db
    .delete(integrationConfigs)
    .where(and(eq(integrationConfigs.clinicId, clinicId), eq(integrationConfigs.adapterId, adapterId)))
    .returning()
    .then((rows) => rows[0] ?? null);

  if (!deleted) {
    return res.status(404).json(apiError({ code: "CONFIG_NOT_FOUND", reason: "No config for this adapter", message: "Integration config not found", requestId }));
  }

  // Remove stored credentials
  await deleteCredentials(clinicId, adapterId);

  logAudit({ actorRole: resolveAuditActorRole(req), clinicId, actionType: "integration_config_deleted", performedBy: req.authUser!.id, performedByEmail: req.authUser!.email ?? "", targetId: deleted.id, targetType: "integration_config", metadata: { adapterId } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /configs/:adapterId/credentials — store credentials (write-only)
// ---------------------------------------------------------------------------
const credentialsSchema = z.object({
  credentials: z.record(z.string()),
});

router.post("/configs/:adapterId/credentials", requireAdmin, validateBody(credentialsSchema), async (req, res) => {
  const requestId = randomUUID();
  const clinicId = req.clinicId!;
  const { adapterId } = req.params;
  const { credentials } = req.body as z.infer<typeof credentialsSchema>;

  if (!isKnownAdapter(adapterId)) {
    return res.status(400).json(apiError({ code: "UNKNOWN_ADAPTER", reason: `No adapter registered with id "${adapterId}"`, message: "Unknown adapter", requestId }));
  }

  const adapter = getAdapter(adapterId)!;
  const { valid, missing } = validateCredentialKeys(credentials, adapter.requiredCredentials);
  if (!valid) {
    return res.status(400).json(apiError({ code: "MISSING_CREDENTIALS", reason: `Missing required credential keys: ${missing.join(", ")}`, message: "Incomplete credentials", requestId }));
  }

  await storeCredentials(clinicId, adapterId, credentials);
  // Note: credential values are NOT logged — only the fact that they were stored
  logAudit({ actorRole: resolveAuditActorRole(req), clinicId, actionType: "integration_credentials_stored", performedBy: req.authUser!.id, performedByEmail: req.authUser!.email ?? "", targetType: "integration_config", metadata: { adapterId, credentialKeys: Object.keys(credentials) } });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// POST /configs/:adapterId/validate — test credentials against adapter
// ---------------------------------------------------------------------------
router.post("/configs/:adapterId/validate", requireAdmin, async (req, res) => {
  const requestId = randomUUID();
  const clinicId = req.clinicId!;
  const { adapterId } = req.params;

  const adapter = getAdapter(adapterId);
  if (!adapter) {
    return res.status(400).json(apiError({ code: "UNKNOWN_ADAPTER", reason: `No adapter registered with id "${adapterId}"`, message: "Unknown adapter", requestId }));
  }

  const credentials = await (await import("../integrations/credential-manager.js")).getCredentials(clinicId, adapterId);
  if (!credentials) {
    return res.status(400).json(apiError({ code: "CREDENTIALS_NOT_SET", reason: "No credentials stored for this adapter", message: "Credentials not configured", requestId }));
  }

  const result = await adapter.validateCredentials(credentials);
  res.json(result);
});

// ---------------------------------------------------------------------------
// POST /configs/:adapterId/sync — trigger manual sync job
// ---------------------------------------------------------------------------
const syncTriggerSchema = z.object({
  syncType: z.enum(["patients", "inventory", "appointments", "billing"]),
  direction: z.enum(["inbound", "outbound"]),
  since: z.string().optional(),
});

router.post("/configs/:adapterId/sync", requireAdmin, validateBody(syncTriggerSchema), async (req, res) => {
  const requestId = randomUUID();
  const clinicId = req.clinicId!;
  const { adapterId } = req.params;
  const body = req.body as z.infer<typeof syncTriggerSchema>;

  if (!isKnownAdapter(adapterId)) {
    return res.status(400).json(apiError({ code: "UNKNOWN_ADAPTER", reason: `No adapter registered with id "${adapterId}"`, message: "Unknown adapter", requestId }));
  }

  try {
    const job = await integrationQueue.add({
      clinicId,
      adapterId,
      syncType: body.syncType as IntegrationSyncJobType,
      direction: body.direction as IntegrationSyncDirection,
      since: body.since,
    });
    res.status(202).json({ ok: true, jobId: job.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to queue sync job";
    res.status(503).json(apiError({ code: "QUEUE_UNAVAILABLE", reason: message, message: "Sync queue unavailable", requestId }));
  }
});

// ---------------------------------------------------------------------------
// GET /configs/:adapterId/logs — fetch sync log
// ---------------------------------------------------------------------------
router.get("/configs/:adapterId/logs", requireAdmin, async (req, res) => {
  const clinicId = req.clinicId!;
  const { adapterId } = req.params;
  const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);

  const logs = await db
    .select()
    .from(integrationSyncLog)
    .where(and(eq(integrationSyncLog.clinicId, clinicId), eq(integrationSyncLog.adapterId, adapterId)))
    .orderBy(desc(integrationSyncLog.startedAt))
    .limit(limit);

  res.json({ logs });
});

export default router;
