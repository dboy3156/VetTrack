/**
 * Capture a full-page screenshot of `/landing` (marketing shell).
 * Prerequisites: dev server reachable (default http://127.0.0.1:5000).
 *
 * Usage:
 *   pnpm exec tsx scripts/capture-css-preview-screenshots.ts
 *
 * Optional:
 *   PREVIEW_BASE_URL=http://127.0.0.1:5000 pnpm exec tsx scripts/capture-css-preview-screenshots.ts
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs", "previews");
mkdirSync(outDir, { recursive: true });

const base = (process.env.PREVIEW_BASE_URL ?? "http://127.0.0.1:5000").replace(/\/$/, "");

async function main(): Promise<void> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const routes = [{ path: "/landing", file: "landing-css-preview.png" }] as const;

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.warn(`[browser ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.warn("[pageerror]", err.message);
  });

  for (const { path, file } of routes) {
    const url = `${base}${path}`;
    console.info(`Screenshot: ${url}`);
    await page.goto(url, { waitUntil: "load", timeout: 180_000 });
    await page.waitForFunction(
      () => {
        const root = document.getElementById("root");
        return Boolean(root && root.children.length > 0);
      },
      { timeout: 60_000 },
    );
    // Allow React/layout + fonts after API idle (avoids blank full-page captures on first paint).
    await new Promise((r) => setTimeout(r, 5_000));
    await page.screenshot({ path: join(outDir, file), fullPage: true, animations: "disabled" });
  }

  await browser.close();
  console.info(`Wrote PNGs under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
