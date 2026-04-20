import { defineConfig, devices } from "@playwright/test";

/**
 * UI Smoke Test config.
 *
 * Local dev:    npx playwright test --config=playwright.ui.config.ts
 * Production:   TEST_BASE_URL="https://vettrack.uk" npx playwright test --config=playwright.ui.config.ts
 */

const BASE_URL   = process.env.TEST_BASE_URL ?? "http://localhost:5000";
const IS_REMOTE  = BASE_URL.startsWith("https://");

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/ui-smoke.spec.ts",
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-ui-report", open: "never" }],
  ],
  use: {
    baseURL: BASE_URL,
    storageState: "playwright-ui-session.json",
    trace: "retain-on-failure",
    screenshot: "on",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
        // Use a real Chrome UA so Cloudflare/Clerk FAPI don't fingerprint us as a bot
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        launchOptions: {
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            // Remove navigator.webdriver flag used by Cloudflare/bot-detection
            "--disable-blink-features=AutomationControlled",
          ],
        },
      },
    },
  ],
  // Only start the local dev server when testing against localhost
  ...(IS_REMOTE
    ? {}
    : {
        webServer: {
          command: "pnpm run dev",
          port: 5000,
          timeout: 60_000,
          reuseExistingServer: true,
          stdout: "pipe",
          stderr: "pipe",
        },
      }),
  timeout: 60_000,      // each test — Clerk FAPI round-trip can take 10–15 s
  globalTimeout: 600_000,
});
