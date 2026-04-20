/**
 * Global setup — signs in via Clerk UI and saves session to disk.
 * Runs once before all ui-smoke tests.
 */

import { chromium } from "@playwright/test";
import path from "path";
import fs from "fs";

const BASE_URL     = "http://localhost:5000";
const EMAIL        = process.env.PLAYWRIGHT_EMAIL    ?? "";
const PASSWORD     = process.env.PLAYWRIGHT_PASSWORD ?? "";
export const SESSION_FILE = path.join(process.cwd(), "playwright-ui-session.json");

export default async function globalSetup() {
  if (!EMAIL || !PASSWORD) {
    throw new Error(
      "\nPLAYWRIGHT_EMAIL and PLAYWRIGHT_PASSWORD must be set.\n" +
      "  PowerShell: $env:PLAYWRIGHT_EMAIL='you@example.com'; $env:PLAYWRIGHT_PASSWORD='pass'\n"
    );
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page    = await context.newPage();

  // Log all console messages to diagnose Clerk init failures
  page.on("console", msg => {
    if (msg.type() === "error" || msg.text().toLowerCase().includes("clerk")) {
      console.log(`[Browser ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("requestfailed", req => {
    console.log(`[Request Failed] ${req.url()} — ${req.failure()?.errorText}`);
  });

  console.log(`\n[Auth Setup] Signing in as ${EMAIL}...`);

  await page.goto(`${BASE_URL}/signin`, { waitUntil: "domcontentloaded", timeout: 30_000 });

  // Wait for Clerk to fully initialise — it loads from CDN and may take 10–15s
  console.log("[Auth Setup] Waiting for Clerk to initialise...");
  await page.waitForFunction(() => {
    const w = window as unknown as { Clerk?: { loaded?: boolean } };
    return w.Clerk?.loaded === true;
  }, { timeout: 30_000 }).catch(() => {
    console.warn("[Auth Setup] window.Clerk.loaded never became true — Clerk may have failed");
  });

  await page.waitForTimeout(1_000);
  await page.screenshot({ path: "/tmp/signin-debug.png", fullPage: true });
  console.log("[Auth Setup] Page title:", await page.title());

  // Check for ClerkFailed state
  const clerkFailed = await page.getByText("Sign-in could not load").isVisible({ timeout: 1_000 }).catch(() => false);
  if (clerkFailed) {
    throw new Error(
      "Clerk failed to initialise on localhost. " +
      "Add 'localhost' as an allowed origin in your Clerk dashboard (Configure → Domains)."
    );
  }

  // Dismiss Clerk dev-mode "Organizations feature required" overlay if present
  const dismissBtn = page.getByRole("button", { name: "I'll remove it myself" });
  if (await dismissBtn.isVisible({ timeout: 5_000 }).catch(() => false)) {
    console.log("[Auth Setup] Dismissing Clerk Organizations overlay...");
    await dismissBtn.click();
    await page.waitForTimeout(1_000);
  }

  // Wait for Clerk's identifier field
  await page.waitForSelector(
    'input[name="identifier"], input[type="email"]',
    { timeout: 15_000 }
  );

  await page.locator('input[name="identifier"]').first().fill(EMAIL);
  await page.keyboard.press("Enter");

  // Clerk may show password on the same screen or a second screen
  try {
    await page.waitForSelector('input[type="password"]', { timeout: 8_000 });
  } catch {
    // password field may already be visible
  }

  const passwordInput = page.locator('input[type="password"]').first();
  if (await passwordInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await passwordInput.fill(PASSWORD);
    await passwordInput.press("Enter");
  }

  // Screenshot before waiting — helps diagnose if sign-in failed
  await page.waitForTimeout(2_000);
  await page.screenshot({ path: "/tmp/signin-after-submit.png", fullPage: true });
  console.log("[Auth Setup] Post-submit URL:", page.url());

  // Wait until we leave /signin
  await page.waitForURL((url) => !url.href.includes("/signin"), { timeout: 20_000 });
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});

  await context.storageState({ path: SESSION_FILE });
  console.log(`[Auth Setup] Session saved → ${SESSION_FILE}`);

  await browser.close();
}
