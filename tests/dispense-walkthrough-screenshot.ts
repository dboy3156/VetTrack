/**
 * One-shot screenshot script for the dispense walkthrough demo.
 * Run with: npx tsx tests/dispense-walkthrough-screenshot.ts
 */
import { chromium } from "playwright";
import * as fs from "fs";
import * as path from "path";

const BASE = "http://localhost:5000";
const OUT = "/opt/cursor/artifacts";

async function run() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();

  // 1. Dev-verify page
  await page.goto(`${BASE}/dev-verify?devmode=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(OUT, "walkthrough_1_dev_verify.png") });
  console.log("Screenshot 1: dev-verify page");

  // Dismiss onboarding overlay if visible
  const onboarding = await page.$('[data-testid="onboarding-overlay"]');
  if (onboarding) {
    const closeBtn = await page.$('[data-testid="onboarding-overlay"] button');
    if (closeBtn) await closeBtn.click();
    else await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
  }
  // Also dismiss any modal by pressing Escape
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 2. Start the walkthrough
  await page.click("button:has-text('הפעל בדיקה מודרכת מלאה')", { force: true });
  await page.waitForTimeout(4000); // Steps 1-2 auto-verify
  await page.screenshot({ path: path.join(OUT, "walkthrough_2_steps_1_2.png") });
  console.log("Screenshot 2: steps 1-2 results");

  // 3. Inventory page with test button — page should have navigated there
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, "walkthrough_3_inventory_nav.png") });
  console.log("Screenshot 3: inventory page after navigation");

  // 4. Scroll to bottom and click the dev test button
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "walkthrough_4_inventory_button.png") });
  console.log("Screenshot 4: inventory page showing test button");

  // Click the test button
  const testBtn = await page.$('[data-testid="dev-dispense-trigger"]');
  if (testBtn) {
    await testBtn.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, "walkthrough_5_dispense_sheet_open.png") });
    console.log("Screenshot 5: DispenseSheet open with emergency button");

    // Click + on first item
    const plusBtns = await page.$$('button[aria-label="הוסף"]');
    if (plusBtns.length >= 2) {
      await plusBtns[0].click();
      await plusBtns[0].click(); // qty = 2
      await plusBtns[1].click(); // qty = 1
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(OUT, "walkthrough_6_items_selected.png") });
      console.log("Screenshot 6: items selected with quantities");

      // Click המשך inside sheet
      const continueBtn = await page.$('button:has-text("המשך")');
      if (continueBtn) {
        await continueBtn.click();
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(OUT, "walkthrough_7_patient_selection.png") });
        console.log("Screenshot 7: patient selection screen");

        // Click ללא שיוך
        const noPatientBtn = await page.$('button:has-text("ללא שיוך למטופל")');
        if (noPatientBtn) {
          await noPatientBtn.click();
          await page.waitForTimeout(300);
        }

        // Click אשר לקיחה
        const confirmBtn = await page.$('button:has-text("אשר לקיחה")');
        if (confirmBtn) {
          await confirmBtn.click();
          await page.waitForTimeout(2000);
          await page.screenshot({ path: path.join(OUT, "walkthrough_8_success_normal.png") });
          console.log("Screenshot 8: normal dispense success");
        }
      }
    }
  }

  // Navigate to shift-handover to show consumables section
  await page.goto(`${BASE}/shift-handover`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "walkthrough_9_shift_handover.png") });
  console.log("Screenshot 9: shift-handover consumables section");

  // Navigate to dev-verify to show the walkthrough page
  await page.goto(`${BASE}/dev-verify?devmode=1`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, "walkthrough_10_dev_verify_final.png") });
  console.log("Screenshot 10: dev-verify page after walkthrough");

  await browser.close();
  console.log("Done! Screenshots saved to", OUT);
}

run().catch((e) => { console.error(e); process.exit(1); });
