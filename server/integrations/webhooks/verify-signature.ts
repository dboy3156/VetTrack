import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verifies `X-VetTrack-Signature: sha256=<hex>` (same format as generic-pms outbound).
 * `rawBody` must be the exact bytes the client signed.
 */
export function verifyVetTrackWebhookSignature(
  rawBody: Buffer,
  secret: string,
  signatureHeader: string | string[] | undefined,
): boolean {
  if (!secret) return false;
  const header = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;
  if (typeof header !== "string" || !header.startsWith("sha256=")) {
    return false;
  }
  const provided = header.slice("sha256=".length).trim();
  if (!/^[0-9a-f]+$/i.test(provided)) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(provided.toLowerCase(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
