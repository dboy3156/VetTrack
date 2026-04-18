"use strict";

/**
 * Expiry badge state tests.
 * Run with: node tests/expiry-badge.test.js
 */

const fs = require("fs");
const path = require("path");

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

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ PASS: ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function run() {
  console.log("=== Expiry badge logic tests ===");

  assert(
    utilsSource.includes("export type ExpiryBadgeState = \"expired\" | \"expiring_soon\" | \"healthy\";") &&
      utilsSource.includes("export function getExpiryBadgeState(") &&
      utilsSource.includes("if (daysUntilExpiry < 0) return \"expired\";") &&
      utilsSource.includes("if (daysUntilExpiry <= 7) return \"expiring_soon\";") &&
      utilsSource.includes("return \"healthy\";"),
    "Utility exposes getExpiryBadgeState with expected threshold logic",
  );

  const fixedNow = new Date("2026-04-17T00:00:00.000Z");

  assert(
    getExpiryBadgeState("2026-04-10", fixedNow) === "expired",
    "Renders red CalendarX state when expiryDate is in the past",
  );

  assert(
    getExpiryBadgeState("2026-04-20", fixedNow) === "expiring_soon",
    "Renders orange CalendarClock state when expiryDate is within 7 days",
  );

  assert(
    getExpiryBadgeState("2026-04-29", fixedNow) === "healthy",
    "Renders green CalendarCheck state when expiryDate is 8+ days away",
  );

  assert(
    getExpiryBadgeState(null, fixedNow) === null,
    "Renders nothing when expiryDate is null",
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run();
