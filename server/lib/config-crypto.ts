// AES-256-GCM transparent encryption for vt_server_config values.
// Set DB_CONFIG_ENCRYPTION_KEY to a 64-char hex string (32 bytes).
// Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// If env var absent: passthrough mode (plaintext) with a one-time warning.

import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LEN = 12; // 96-bit IV, GCM standard
const TAG_LEN = 16;
const PREFIX = "enc:v1:"; // marks encrypted values; plaintext values lack this prefix

function getKey(): Buffer | null {
  const hex = process.env.DB_CONFIG_ENCRYPTION_KEY;
  if (!hex) return null;
  const buf = Buffer.from(hex, "hex");
  if (buf.length !== 32)
    throw new Error("DB_CONFIG_ENCRYPTION_KEY must be 64 hex chars (32 bytes)");
  return buf;
}

let warnedOnce = false;
function warnPlaintext(): void {
  if (warnedOnce) return;
  warnedOnce = true;
  console.warn(
    "[config-crypto] DB_CONFIG_ENCRYPTION_KEY not set — vt_server_config values stored as plaintext",
  );
}

export function encryptConfigValue(plaintext: string): string {
  const key = getKey();
  if (!key) {
    warnPlaintext();
    return plaintext;
  }
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
  return `${PREFIX}${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptConfigValue(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // plaintext passthrough
  const key = getKey();
  if (!key)
    throw new Error("DB_CONFIG_ENCRYPTION_KEY required to decrypt vt_server_config value");
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) throw new Error("Malformed encrypted config value");
  const [ivHex, tagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const tag = Buffer.from(tagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext).toString("utf8") + decipher.final("utf8");
}
