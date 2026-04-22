/**
 * Phase 2 — idempotency key stability (mirrors server/lib/equipment-seen.ts logic).
 */
import { describe, it, expect } from "vitest";
import { createHash } from "crypto";

function jerusalemHourBucket(d: Date): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  return `${y}-${m}-${day}T${h}`;
}

function buildSeenIdempotencyKey(animalId: string, itemId: string, at: Date): string {
  const bucket = jerusalemHourBucket(at);
  const raw = `${animalId}|${itemId}|${bucket}`;
  return createHash("sha256").update(raw).digest("hex");
}

describe("Phase 2 idempotency key stability", () => {
  it("same animal+equipment+hour must produce same key", () => {
    const d1 = new Date("2026-06-10T08:15:00.000Z");
    const k1 = buildSeenIdempotencyKey("animal-a", "equip-b", d1);
    const k2 = buildSeenIdempotencyKey("animal-a", "equip-b", d1);
    expect(k1).toBe(k2);
  });

  it("different hour bucket must differ", () => {
    const d1 = new Date("2026-06-10T08:15:00.000Z");
    const k1 = buildSeenIdempotencyKey("animal-a", "equip-b", d1);
    const d2 = new Date("2026-06-10T10:15:00.000Z");
    const k3 = buildSeenIdempotencyKey("animal-a", "equip-b", d2);
    expect(k1).not.toBe(k3);
  });
});
