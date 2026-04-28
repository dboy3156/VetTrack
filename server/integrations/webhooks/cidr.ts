/**
 * Minimal IPv4 allowlist for integration webhook ingress (Phase B Sprint 4).
 * Empty rules array = allow all.
 */

function normalizeIpv4(ip: string): string | null {
  const raw = ip.trim().replace(/^::ffff:/i, "");
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw);
  if (!m) return null;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (octets.some((o) => o < 0 || o > 255)) return null;
  return octets.join(".");
}

function ipv4ToInt(ip: string): number | null {
  const n = normalizeIpv4(ip);
  if (!n) return null;
  const parts = n.split(".").map((x) => Number(x));
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/** Returns true when `rules` is empty or `clientIp` matches any CIDR /32 rule (IPv4 only). */
export function isWebhookSourceAllowed(clientIp: string, rules: string[]): boolean {
  if (!rules.length) return true;
  const ipNum = ipv4ToInt(clientIp);
  if (ipNum === null) return false;

  for (const rule of rules) {
    const r = rule.trim();
    if (!r) continue;

    const slash = r.indexOf("/");
    if (slash === -1) {
      const single = ipv4ToInt(r);
      if (single !== null && single === ipNum) return true;
      continue;
    }

    const baseStr = r.slice(0, slash).trim();
    const bits = Number.parseInt(r.slice(slash + 1).trim(), 10);
    if (!Number.isFinite(bits) || bits < 0 || bits > 32) continue;

    const baseNum = ipv4ToInt(baseStr);
    if (baseNum === null) continue;

    const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
    if ((ipNum & mask) === (baseNum & mask)) return true;
  }

  return false;
}
