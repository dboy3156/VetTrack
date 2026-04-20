/**
 * VetTrack UI Smoke Test Suite
 *
 * Signs in with real Clerk credentials, then visits every route and
 * takes a screenshot. Asserts no React crash / blank page.
 *
 * Set credentials via env vars before running:
 *   $env:PLAYWRIGHT_EMAIL="you@example.com"
 *   $env:PLAYWRIGHT_PASSWORD="yourpassword"
 *
 * Run:
 *   npx playwright test --config=playwright.ui.config.ts --reporter=list
 */

import { test, expect, Page, ConsoleMessage } from "@playwright/test";
import path from "path";
import fs from "fs";

// ─── Config ───────────────────────────────────────────────────────────────────

const SCREENSHOTS_DIR = path.join(process.cwd(), "playwright-ui-screenshots");

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

// ─── Routes ───────────────────────────────────────────────────────────────────

const PUBLIC_ROUTES = [
  { name: "landing", path: "/landing" },
  { name: "signin",  path: "/signin"  },
  { name: "signup",  path: "/signup"  },
];

const AUTH_ROUTES = [
  { name: "home",             path: "/"                          },
  { name: "alerts",           path: "/alerts"                    },
  { name: "analytics",        path: "/analytics"                 },
  { name: "appointments",     path: "/appointments"              },
  { name: "audit-log",        path: "/audit-log"                 },
  { name: "billing",          path: "/billing"                   },
  { name: "code-blue",        path: "/code-blue"                 },
  { name: "dashboard",        path: "/dashboard"                 },
  { name: "equipment",        path: "/equipment"                 },
  { name: "equipment-new",    path: "/equipment/new"             },
  { name: "help",             path: "/help"                      },
  { name: "inventory",        path: "/inventory"                 },
  { name: "inventory-items",  path: "/inventory-items"           },
  { name: "meds",             path: "/meds"                      },
  { name: "my-equipment",     path: "/my-equipment"              },
  { name: "print",            path: "/print"                     },
  { name: "procurement",      path: "/procurement"               },
  { name: "rooms",            path: "/rooms"                     },
  { name: "settings",         path: "/settings"                  },
  { name: "shift-handover",   path: "/shift-handover"            },
  { name: "stability",        path: "/stability"                 },
  { name: "admin",            path: "/admin"                     },
  { name: "admin-shifts",     path: "/admin/shifts"              },
  { name: "whats-new",        path: "/whats-new"                 },
  // Detail routes — placeholder IDs, app should show empty/404 state, not crash
  { name: "equipment-detail", path: "/equipment/smoke-test-id"   },
  { name: "equipment-qr",     path: "/equipment/smoke-test-id/qr"},
  { name: "rooms-detail",     path: "/rooms/smoke-test-id"       },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

const CRASH_PATTERNS = [
  /something went wrong/i,
  /application error/i,
  /unexpected error/i,
  /cannot read propert/i,
  /is not a function/i,
  /is not defined/i,
];

const IGNORE_CONSOLE = [
  /favicon/i,
  /service.worker/i,
  /\[HMR\]/i,
  /\[vite\]/i,
  /clerk/i,
  /ResizeObserver/i,
  /Non-Error promise rejection/i,
];

async function visitPage(page: Page, route: { name: string; path: string }) {
  const errors: string[] = [];

  const onConsole = (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (IGNORE_CONSOLE.some((rx) => rx.test(text))) return;
    errors.push(text);
  };

  page.on("console", onConsole);

  await page.goto(route.path, { waitUntil: "domcontentloaded", timeout: 20_000 });

  // Wait for Clerk to finish its FAPI round-trip and validate the stored session.
  // This is async and often completes after domcontentloaded but before networkidle.
  await page
    .waitForFunction(
      () => {
        const w = window as unknown as { Clerk?: { loaded?: boolean } };
        return w.Clerk?.loaded === true;
      },
      { timeout: 20_000 }
    )
    .catch(() => {
      // Public pages (signin/signup embed Clerk differently; landing has no Clerk)
    });

  // If Clerk redirected us to /signin mid-load (session check failed transiently),
  // give it a few extra seconds to recover and redirect back.
  if (page.url().includes("/signin") && !route.path.endsWith("/signin")) {
    await page
      .waitForURL((url) => !url.href.includes("/signin"), { timeout: 8_000 })
      .catch(() => {/* auth assertion below will surface the failure */});
  }

  try {
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
  } catch {
    // Non-fatal for pages with persistent polling
  }
  await page.waitForTimeout(500);

  const screenshotPath = path.join(SCREENSHOTS_DIR, `${route.name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true });

  page.off("console", onConsole);
  return { errors, screenshotPath };
}

// ─── Tests ────────────────────────────────────────────────────────────────────
// Session is injected via playwright.ui.config.ts globalSetup + storageState

test.describe("VetTrack UI Smoke Tests", () => {

  test("API server health check", async ({ request }) => {
    const res = await request.get("/api/healthz").catch(() => null);
    if (!res) {
      console.warn("[WARN] /api/healthz unreachable — API server may not be running");
    } else {
      console.log(`[API] /api/healthz → ${res.status()}`);
    }
  });

  for (const route of PUBLIC_ROUTES) {
    test(`[public] ${route.name} (${route.path})`, async ({ page }) => {
      const { errors } = await visitPage(page, route);

      const bodyHtml = await page.locator("body").innerHTML();
      expect(bodyHtml.trim().length, `${route.path} — page body is empty`).toBeGreaterThan(0);

      const pageText = (await page.content()).toLowerCase();
      for (const pattern of CRASH_PATTERNS) {
        expect(pattern.test(pageText), `${route.path} — React crash: ${pattern}`).toBe(false);
      }

      if (errors.length) console.warn(`[WARN] ${route.path}:\n  ${errors.join("\n  ")}`);
    });
  }

  for (const route of AUTH_ROUTES) {
    test(`[auth] ${route.name} (${route.path})`, async ({ page }) => {
      const { errors } = await visitPage(page, route);

      // Must not redirect back to signin (session should be valid)
      const finalUrl = page.url();
      expect(finalUrl, `${route.path} — redirected to signin, auth failed`).not.toContain("/signin");

      // Must have page content
      const bodyHtml = await page.locator("body").innerHTML();
      expect(bodyHtml.trim().length, `${route.path} — page body is empty`).toBeGreaterThan(0);

      // Must not show React error boundary crash
      const pageText = (await page.content()).toLowerCase();
      for (const pattern of CRASH_PATTERNS) {
        expect(pattern.test(pageText), `${route.path} — React crash: ${pattern}`).toBe(false);
      }

      console.log(`[OK] ${route.path} → ${finalUrl}`);
      if (errors.length) console.warn(`[WARN] ${route.path}:\n  ${errors.join("\n  ")}`);
    });
  }

  test("404 — unknown route renders not-found page", async ({ page }) => {
    await visitPage(page, { name: "not-found", path: "/this-route-does-not-exist-404" });
    const bodyHtml = await page.locator("body").innerHTML() ?? "";
    expect(bodyHtml.trim().length, "404 page body is empty").toBeGreaterThan(0);
  });

  test("screenshots summary", async () => {
    const files = fs.readdirSync(SCREENSHOTS_DIR).filter((f) => f.endsWith(".png"));
    console.log(`\n📸 ${files.length} screenshots saved to: ${SCREENSHOTS_DIR}`);
    for (const f of files.sort()) console.log(`   ${f}`);
    expect(files.length).toBeGreaterThan(0);
  });
});
