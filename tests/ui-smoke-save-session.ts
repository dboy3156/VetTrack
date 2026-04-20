/**
 * Run once to save your browser session for UI smoke tests.
 * Opens a real (headed) browser — sign in manually, then close the tab.
 *
 *   npx tsx tests/ui-smoke-save-session.ts
 */

import { chromium } from "@playwright/test";
import * as path from "path";
import * as readline from "readline";

const SESSION_FILE = path.join(process.cwd(), "playwright-ui-session.json");

async function main() {
  const browser = await chromium.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
    ],
  });
  const context = await browser.newContext();
  const page    = await context.newPage();

  console.log("\nBrowser opened — sign in to VetTrack, then come back here and press Enter.\n");

  const baseUrl = process.env.TEST_BASE_URL ?? "http://localhost:5000";
  await page.goto(`${baseUrl}/signin`);

  await new Promise<void>((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question("Press Enter once you are signed in and can see the dashboard...", () => {
      rl.close();
      resolve();
    });
  });

  await context.storageState({ path: SESSION_FILE });
  console.log(`\nSession saved to ${SESSION_FILE}\n`);
  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
