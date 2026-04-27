/**
 * Regression tests for procurement screen mobile bug:
 * The page was showing "טעינת הזמנות רכש נכשלה" immediately on load
 * because (a) the query fired before auth was fully resolved and
 * (b) a cached error was shown during background refetch instead of
 * showing the skeleton.
 *
 * Fix: enabled guard includes isLoaded, render condition shows skeleton
 * when isError && isFetching (background recovery in progress).
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const procurementPage = fs.readFileSync(
  path.join(repoRoot, "src", "pages", "procurement.tsx"),
  "utf8",
);

// ─────────────────────────────────────────────────────────────────────────────
// Auth readiness guard
// ─────────────────────────────────────────────────────────────────────────────

describe("Procurement — auth readiness guard", () => {
  it("isLoaded is destructured from useAuth", () => {
    expect(procurementPage).toMatch(/const\s*\{[^}]*isLoaded[^}]*\}\s*=\s*useAuth\(\)/);
  });

  it("query enabled guard includes isLoaded", () => {
    expect(procurementPage).toContain("enabled: !!userId && isLoaded");
  });

  it("query does not fire on userId alone (prevents auth-store race)", () => {
    // The old guard `enabled: !!userId` is gone
    expect(procurementPage).not.toMatch(/enabled:\s*!!userId(?!\s*&&)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Loading state — skeleton shown during initial fetch AND background recovery
// ─────────────────────────────────────────────────────────────────────────────

describe("Procurement — loading state rendering", () => {
  it("skeleton is shown when isPending (initial load)", () => {
    expect(procurementPage).toContain("ordersQ.isPending");
  });

  it("skeleton is shown when isError && isFetching (background recovery)", () => {
    // The condition prevents stale error from flashing on re-mount
    expect(procurementPage).toMatch(/ordersQ\.isError\s*&&\s*ordersQ\.isFetching/);
  });

  it("loading condition covers both initial and recovery cases", () => {
    // Pattern: (isPending || (isError && isFetching))
    expect(procurementPage).toMatch(
      /ordersQ\.isPending\s*\|\|\s*\(\s*ordersQ\.isError\s*&&\s*ordersQ\.isFetching\s*\)/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error state — only shown after a real failure, not during refetch
// ─────────────────────────────────────────────────────────────────────────────

describe("Procurement — error state rendering", () => {
  it("error card is shown when isError is true", () => {
    expect(procurementPage).toContain("ordersQ.isError");
    expect(procurementPage).toContain("ErrorCard");
  });

  it("error card comes after the loading condition in render order", () => {
    const loadingIdx = procurementPage.indexOf("ordersQ.isPending || (ordersQ.isError && ordersQ.isFetching)");
    const errorIdx = procurementPage.indexOf("<ErrorCard");
    expect(loadingIdx).toBeGreaterThanOrEqual(0);
    expect(errorIdx).toBeGreaterThan(loadingIdx);
  });

  it("error card has a retry handler that calls refetch", () => {
    expect(procurementPage).toContain("ordersQ.refetch()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Empty state — distinct from error state
// ─────────────────────────────────────────────────────────────────────────────

describe("Procurement — empty state rendering", () => {
  it("empty state shown when orders array is empty (not as error)", () => {
    expect(procurementPage).toContain("orders.length === 0");
  });

  it("empty state comes after the error condition in render order", () => {
    const errorIdx = procurementPage.indexOf("<ErrorCard");
    const emptyIdx = procurementPage.indexOf("orders.length === 0");
    expect(emptyIdx).toBeGreaterThan(errorIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Query configuration — no premature requests
// ─────────────────────────────────────────────────────────────────────────────

describe("Procurement — React Query configuration", () => {
  it("retry is disabled (single attempt; retry handled by retry button)", () => {
    expect(procurementPage).toContain("retry: false");
  });

  it("refetchOnWindowFocus is disabled (no spurious refetches)", () => {
    expect(procurementPage).toContain("refetchOnWindowFocus: false");
  });

  it("query key includes statusFilter for correct cache isolation", () => {
    expect(procurementPage).toContain('"/api/procurement", statusFilter');
  });
});
