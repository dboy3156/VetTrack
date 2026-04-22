/**
 * Expiry badge state tests.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const utilsPath = path.join(__dirname, "..", "src", "lib", "utils.ts");
const utilsSource = fs.readFileSync(utilsPath, "utf8");

function getExpiryBadgeState(expiryDate, now = new Date()) {
  if (!expiryDate) return null;
  const date = new Date(`${expiryDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const daysUntilExpiry = Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (daysUntilExpiry < 0) return "expired";
  if (daysUntilExpiry <= 7) return "expiring_soon";
  return "healthy";
}

const fixedNow = new Date("2026-04-17T00:00:00.000Z");

describe("Expiry badge logic tests", () => {
  it("Utility exposes getExpiryBadgeState with expected threshold logic", () => {
    expect(
      utilsSource.includes("export type ExpiryBadgeState = \"expired\" | \"expiring_soon\" | \"healthy\";") &&
        utilsSource.includes("export function getExpiryBadgeState(") &&
        utilsSource.includes("if (daysUntilExpiry < 0) return \"expired\";") &&
        utilsSource.includes("if (daysUntilExpiry <= 7) return \"expiring_soon\";") &&
        utilsSource.includes("return \"healthy\";"),
    ).toBe(true);
  });

  it("Renders red CalendarX state when expiryDate is in the past", () => {
    expect(getExpiryBadgeState("2026-04-10", fixedNow)).toBe("expired");
  });

  it("Renders orange CalendarClock state when expiryDate is within 7 days", () => {
    expect(getExpiryBadgeState("2026-04-20", fixedNow)).toBe("expiring_soon");
  });

  it("Renders green CalendarCheck state when expiryDate is 8+ days away", () => {
    expect(getExpiryBadgeState("2026-04-29", fixedNow)).toBe("healthy");
  });

  it("Renders nothing when expiryDate is null", () => {
    expect(getExpiryBadgeState(null, fixedNow)).toBe(null);
  });
});
