import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  globalSetup: "./tests/global.setup.ts",
  fullyParallel: false,
  reporter: [["list"], ["json", { outputFile: "/tmp/playwright-results.json" }]],
  use: {
    baseURL: process.env.TEST_BASE_URL ?? "http://localhost:5000",
    trace: "off",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
          ],
        },
      },
    },
  ],
  timeout: 60_000,
  globalTimeout: 300_000,
});
