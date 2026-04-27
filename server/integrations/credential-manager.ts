/**
 * Integration credential manager.
 *
 * Credentials are stored in vt_server_config as a JSON blob, encrypted with
 * AES-256-GCM (same mechanism used by billing webhooks).
 *
 * Config key format: {clinicId}:integration:{adapterId}:credentials
 *
 * The value is JSON.stringify(credentials) → encryptConfigValue → stored in
 * vt_server_config.value. On read: decryptConfigValue → JSON.parse.
 *
 * This means credentials never appear in plaintext in the DB (when
 * DB_CONFIG_ENCRYPTION_KEY is set) and are isolated per clinic per adapter.
 */

import { eq, and } from "drizzle-orm";
import { db, serverConfig } from "../db.js";
import { encryptConfigValue, decryptConfigValue } from "../lib/config-crypto.js";
import type { IntegrationCredentials } from "./types.js";

function configKey(clinicId: string, adapterId: string): string {
  return `${clinicId}:integration:${adapterId}:credentials`;
}

/** Store or update credentials for an integration. Encrypts before writing. */
export async function storeCredentials(
  clinicId: string,
  adapterId: string,
  credentials: IntegrationCredentials,
): Promise<void> {
  const key = configKey(clinicId, adapterId);
  const encrypted = encryptConfigValue(JSON.stringify(credentials));

  await db
    .insert(serverConfig)
    .values({ key, value: encrypted })
    .onConflictDoUpdate({
      target: serverConfig.key,
      set: { value: encrypted, updatedAt: new Date() },
    });
}

/** Retrieve and decrypt credentials. Returns null if not set. */
export async function getCredentials(
  clinicId: string,
  adapterId: string,
): Promise<IntegrationCredentials | null> {
  const key = configKey(clinicId, adapterId);
  const [row] = await db
    .select({ value: serverConfig.value })
    .from(serverConfig)
    .where(eq(serverConfig.key, key))
    .limit(1);

  if (!row) return null;

  try {
    return JSON.parse(decryptConfigValue(row.value)) as IntegrationCredentials;
  } catch (err) {
    console.error("[credential-manager] Failed to decrypt credentials", { clinicId, adapterId, err });
    return null;
  }
}

/** Remove credentials (e.g. when an integration is disabled and revoked). */
export async function deleteCredentials(clinicId: string, adapterId: string): Promise<void> {
  const key = configKey(clinicId, adapterId);
  await db.delete(serverConfig).where(eq(serverConfig.key, key));
}

/**
 * Verify that all required credential keys are present and non-empty.
 * Returns { valid: true } or { valid: false, missing: string[] }.
 */
export function validateCredentialKeys(
  credentials: IntegrationCredentials,
  required: string[],
): { valid: boolean; missing: string[] } {
  const missing = required.filter((k) => !credentials[k]?.trim());
  return { valid: missing.length === 0, missing };
}
