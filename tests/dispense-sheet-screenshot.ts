/**
 * Targeted screenshots of the DispenseSheet flow.
 */
import { chromium } from "playwright";
import * as path from "path";

const BASE = "http://localhost:5000";
const OUT = "/opt/cursor/artifacts";

async function dismissOverlays(page: import("playwright").Page) {
  await page.evaluate(() => {
    document.querySelectorAll('[data-testid="onboarding-overlay"], [data-radix-dialog-overlay]').forEach(
      (el) => (el as HTMLElement).setAttribute("style", "display:none!important"),
    );
  });
  await page.waitForTimeout(200);
}

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // ─── 1. Dev-verify page ───────────────────────────────────────────────────

  await page.goto(`${BASE}/dev-verify?devmode=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await dismissOverlays(page);
  await page.screenshot({ path: path.join(OUT, "walkthrough_1_dev_verify.png") });
  console.log("✓ Screenshot 1: dev-verify page");

  // ─── 2. Start walkthrough and show step 1-2 results ─────────────────────

  await page.click("button:has-text('הפעל בדיקה מודרכת מלאה')", { force: true });
  await page.waitForTimeout(4000);
  await page.screenshot({ path: path.join(OUT, "walkthrough_2_steps_1_2.png") });
  console.log("✓ Screenshot 2: steps 1-2 results");

  // ─── 3. Navigate to inventory directly to show DispenseSheet ─────────────

  await page.goto(`${BASE}/inventory?devmode=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await dismissOverlays(page);

  // Scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "walkthrough_3_inventory_button.png") });
  console.log("✓ Screenshot 3: inventory page with test button");

  // Click test trigger
  await page.click('[data-testid="dev-dispense-trigger"]', { force: true });
  await page.waitForTimeout(1800);
  await dismissOverlays(page);
  await page.screenshot({ path: path.join(OUT, "walkthrough_4_dispense_sheet.png") });
  console.log("✓ Screenshot 4: DispenseSheet open");

  // ─── 4. Test direct API dispense and capture the result on shift-handover ─

  // Trigger a dispense via API for the shift-handover demo
  const containerId = "7e475620-af8c-471d-8719-d73a553f47e8";
  const item1 = "2a979f42-46cb-442d-93e3-f08a7d80cb25";
  const item2 = "e9718f57-a22f-4dbd-b589-c88da281dcc1";

  await page.evaluate(async (args) => {
    const { containerId, item1, item2 } = args;
    await fetch(`/api/containers/${containerId}/dispense`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: [{ itemId: item1, quantity: 1 }, { itemId: item2, quantity: 1 }],
        animalId: null,
        isEmergency: false,
      }),
    });
  }, { containerId, item1, item2 });

  // Trigger emergency dispense
  const emergencyResult = await page.evaluate(async (args) => {
    const res = await fetch(`/api/containers/${args.containerId}/dispense`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [], animalId: null, isEmergency: true }),
    });
    return res.json();
  }, { containerId });
  console.log("Emergency eventId:", (emergencyResult as { emergencyEventId?: string }).emergencyEventId);

  // ─── 5. Shift-handover showing consumables section ────────────────────────

  await page.goto(`${BASE}/shift-handover`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);
  await dismissOverlays(page);
  // Scroll to bottom to show consumables section
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "walkthrough_5_shift_handover_consumables.png") });
  console.log("✓ Screenshot 5: shift-handover consumables section");

  // ─── 6. Final dev-verify page ─────────────────────────────────────────────

  await page.goto(`${BASE}/dev-verify?devmode=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await dismissOverlays(page);
  await page.screenshot({ path: path.join(OUT, "walkthrough_6_dev_verify_final.png") });
  console.log("✓ Screenshot 6: dev-verify page final");

  await browser.close();
  console.log("Done! Screenshots saved to", OUT);
}

run().catch((e) => { console.error(e); process.exit(1); });
