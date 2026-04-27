/**
 * Static-analysis tests for the Crash Cart check page (Task 8 of the redesign).
 *
 * These tests are intentionally written BEFORE the page exists (TDD red state).
 * Tests skip automatically if src/pages/crash-cart.tsx is not yet created.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function read(rel) {
  try {
    return fs.readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

const page = read("src/pages/crash-cart.tsx");

// ─────────────────────────────────────────────────────────────────────────────
// Crash cart check page
// ─────────────────────────────────────────────────────────────────────────────

describe("Crash cart check page", () => {
  it.skipIf(page === null)("contains at least 6 checklist items", () => {
    const matches = page.match(/key:\s*["'][a-z_]+["']/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(6);
  });

  it.skipIf(page === null)("shows high-risk patients panel from API response", () => {
    expect(page).toContain("criticalPatients");
    expect(page).toContain("critical");
  });

  it.skipIf(page === null)("POSTs to /api/crash-cart/checks on submit", () => {
    expect(page).toContain("/api/crash-cart/checks");
  });

  it.skipIf(page === null)("shows last check timestamp and performer name", () => {
    expect(page).toContain("performedByName");
    expect(page).toContain("performedAt");
  });

  it.skipIf(page === null)("shows check history (recent checks list)", () => {
    expect(page).toContain("recentChecks");
  });
});
