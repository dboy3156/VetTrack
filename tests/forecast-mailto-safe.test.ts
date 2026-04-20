import assert from "node:assert/strict";
import { buildForecastMailtoUrl } from "../server/lib/forecast/mailtoSafe.ts";

async function run(): Promise<void> {
  console.log("\n-- Forecast mailto URL safety");

  const huge = "x".repeat(50000);
  const r = buildForecastMailtoUrl({
    pharmacyEmail: "rx@example.com",
    subject: "Order",
    body: huge,
    locale: "en",
  });
  assert.equal(r.truncated, true);
  assert.ok(r.url.length <= 7800);

  const small = buildForecastMailtoUrl({
    pharmacyEmail: "rx@example.com",
    subject: "Short",
    body: "hello",
    locale: "en",
  });
  assert.equal(small.truncated, false);

  console.log("  ✅ Mailto truncation keeps URL bounded");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
