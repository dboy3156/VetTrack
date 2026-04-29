/**
 * Capture screenshots for docs/investor-deck (Playwright).
 *
 * Public routes work with frontend only. Authenticated routes require both Vite (:5000)
 * and API + DB in **dev-bypass** auth (no Clerk) so `/api/users/me` succeeds.
 *
 * Usage:
 *   pnpm run deck:capture
 *
 * Optional:
 *   PREVIEW_BASE_URL=http://127.0.0.1:5000 pnpm exec tsx scripts/capture-investor-deck-screenshots.ts
 *   PREVIEW_WAIT_MS=180000  (default 120000 — poll until dev responds or exit with error)
 */
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "docs", "investor-deck", "assets");
mkdirSync(outDir, { recursive: true });

const base = (process.env.PREVIEW_BASE_URL ?? "http://127.0.0.1:5000").replace(/\/$/, "");

const previewWaitMs = Number(process.env.PREVIEW_WAIT_MS ?? "120000");
const previewPollMs = Number(process.env.PREVIEW_POLL_MS ?? "1500");

/** Poll until Vite (or PREVIEW_BASE_URL) accepts HTTP — avoids ERR_CONNECTION_REFUSED when dev is still starting. */
async function waitForPreviewServer(origin: string): Promise<void> {
  const maxWaitMs = Number.isFinite(previewWaitMs) && previewWaitMs > 0 ? previewWaitMs : 120_000;
  const pollMs = Number.isFinite(previewPollMs) && previewPollMs > 0 ? previewPollMs : 1500;
  const deadline = Date.now() + maxWaitMs;
  const url = `${origin}/`;
  let lastLog = 0;

  while (Date.now() < deadline) {
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 4000);
      const res = await fetch(url, { signal: ac.signal, redirect: "follow" });
      clearTimeout(t);
      res.body?.cancel().catch(() => {});
      if (res.ok || (res.status >= 300 && res.status < 400)) {
        console.info(`Preview server ready at ${origin}`);
        return;
      }
    } catch {
      /* connection refused / abort — keep polling */
    }
    const now = Date.now();
    if (now - lastLog >= 5000) {
      const secLeft = Math.max(0, Math.round((deadline - now) / 1000));
      console.info(`Waiting for preview server at ${origin}… (~${secLeft}s left)`);
      lastLog = now;
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }

  throw new Error(
    `Preview server not reachable at ${origin} after ${maxWaitMs}ms. ` +
      `Start dev first: DATABASE_URL=… PORT=3001 pnpm dev (Vite on :5000).`,
  );
}

type RouteSpec = { path: string; file: string; auth: boolean; settleMs?: number };

const routes: RouteSpec[] = [
  { path: "/landing", file: "landing.png", auth: false, settleMs: 5000 },
  { path: "/home", file: "home.png", auth: true, settleMs: 4000 },
  { path: "/display", file: "ward.png", auth: true, settleMs: 5000 },
  { path: "/code-blue", file: "code-blue.png", auth: true, settleMs: 5000 },
  { path: "/meds", file: "meds.png", auth: true, settleMs: 5000 },
  { path: "/billing/leakage", file: "billing.png", auth: true, settleMs: 5000 },
  { path: "/equipment", file: "equipment.png", auth: true, settleMs: 5000 },
  { path: "/audit-log", file: "audit.png", auth: true, settleMs: 5000 },
];

async function main(): Promise<void> {
  await waitForPreviewServer(base);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.warn(`[browser ${msg.type()}] ${msg.text()}`);
    }
  });
  page.on("pageerror", (err) => {
    console.warn("[pageerror]", err.message);
  });

  for (const { path: pth, file, auth, settleMs } of routes) {
    const url = `${base}${pth}`;
    console.info(`Screenshot: ${url}`);
    try {
      await page.goto(url, { waitUntil: "load", timeout: 180_000 });
      await page.waitForFunction(
        () => {
          const root = document.getElementById("root");
          return Boolean(root && root.children.length > 0);
        },
        { timeout: 60_000 },
      );
      const href = page.url();
      if (auth && (href.includes("/signin") || href.includes("/signup"))) {
        console.warn(`  skip ${file}: not signed in (need pnpm dev + DATABASE_URL + dev-bypass auth)`);
        continue;
      }
      await new Promise((r) => setTimeout(r, settleMs ?? 4000));
      await page.screenshot({ path: join(outDir, file), fullPage: true, animations: "disabled" });
      console.info(`  wrote ${file}`);
    } catch (e) {
      console.warn(`  failed ${file}:`, e instanceof Error ? e.message : e);
    }
  }

  await browser.close();
  console.info(`Done. PNGs under ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
