import assert from "node:assert/strict";
import { PDFParse } from "pdf-parse";

async function run(): Promise<void> {
  console.log("\n-- Forecast pdf-parse module smoke");

  assert.ok(typeof PDFParse === "function", "PDFParse constructor available");

  console.log("  ✅ pdf-parse resolves for ICU forecast PDF uploads");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
