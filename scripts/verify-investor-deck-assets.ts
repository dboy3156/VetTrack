/**
 * After `pnpm run deck:capture`, checks that expected PNGs exist and are non-empty.
 * Does not start browsers or servers.
 *
 *   pnpm exec tsx scripts/verify-investor-deck-assets.ts
 */
import { existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const assets = join(__dirname, "..", "docs", "investor-deck", "assets");

const expected = [
  "landing.png",
  "home.png",
  "ward.png",
  "code-blue.png",
  "meds.png",
  "billing.png",
  "equipment.png",
  "audit.png",
];

let ok = true;
for (const name of expected) {
  const p = join(assets, name);
  if (!existsSync(p)) {
    console.error(`MISSING  ${name}`);
    ok = false;
    continue;
  }
  const bytes = statSync(p).size;
  if (bytes < 500) {
    console.error(`TOO_SMALL ${name} (${bytes} bytes) — likely placeholder or failed capture`);
    ok = false;
  } else {
    console.info(`OK        ${name} (${bytes} bytes)`);
  }
}

if (!ok) {
  console.error("\nFix: run `pnpm dev` (PORT=3001 + DB), unset Clerk keys for dev-bypass, then `pnpm run deck:capture`.");
  process.exit(1);
}
console.info("\nAll 8 investor-deck PNGs look present.");
process.exit(0);
