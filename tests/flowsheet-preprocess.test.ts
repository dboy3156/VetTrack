import assert from "node:assert/strict";
import { scoreExtractedDrug } from "../server/lib/forecast/confidenceScorer.ts";
import { createFormularyFuse, extractDrugLine } from "../server/lib/forecast/fieldExtractor.ts";
import { preprocessFlowsheetText } from "../server/lib/forecast/flowsheetPreprocess.ts";

async function run(): Promise<void> {
  console.log("\n-- flowsheet preprocess");

  const monitoring = "Resp. rate\t28\t32\n10 Cerenia inj\t4 mg IV\n";
  const out1 = preprocessFlowsheetText(monitoring);
  assert.ok(!out1.includes("Resp. rate"), "drops high-confidence monitoring line");
  assert.ok(out1.includes("Cerenia"), "keeps med line");

  const fluidOnly = "LRS 6 ml/hr\nPlasma 5 ml/hr -\n";
  const out2 = preprocessFlowsheetText(fluidOnly);
  assert.equal(out2.includes("LRS"), false, "drops LRS rate-only line");
  assert.equal(out2.includes("Plasma"), false, "drops Plasma rate-only line");

  const fluidWithDrugMg =
    "LRS 6 ml/hr\n/ 100ml<br>Pramin 1 mg / 100ml 6\t6\n10 Famotidine\t4 mg SSIV\n";
  const out3 = preprocessFlowsheetText(fluidWithDrugMg);
  assert.ok(out3.includes("Famotidine"), "keeps true drug line");
  assert.ok(
    out3.includes("Pramin") || out3.includes("mg"),
    "keeps line with mg (additive or drug) — do not drop whole compound line",
  );

  const medsRegion = `NOISE LINE\nMEDICATIONS\n10 Cerenia\nPROCEDURES\nXRAY\n`;
  const out4 = preprocessFlowsheetText(medsRegion);
  assert.ok(!out4.includes("XRAY"), "region slice excludes after PROCEDURES when both anchors exist");
  assert.ok(out4.includes("Cerenia"), "region keeps med inside window");

  const continuation = "3.75 Remeron (Mirtazipine)\n3.75 mg PO אופיר\n";
  const out5 = preprocessFlowsheetText(continuation);
  assert.ok(
    /Remeron.*3\.75\s*mg\s*PO|3\.75\s*mg\s*PO.*Remeron/s.test(out5.replace(/\n/g, " ")),
    "merges name-only line with following dose-only line",
  );

  const fileNumFlow =
    "File Number: 361848\nNOISE\nMEDICATIONS\n10 Cerenia inj 4 mg IV\nPROCEDURES\nX\n";
  const out6 = preprocessFlowsheetText(fileNumFlow);
  assert.ok(out6.startsWith("361848"), "prepends chart id from File Number for record hint");
  assert.ok(out6.includes("Cerenia"), "keeps med line after prepend");

  const adjacentHeaders =
    "-- 1 of 2 --\nMEDICATIONS\nPROCEDURES\nLRS 6 ml/hr\n10 Cerenia inj 4 mg IV\n\n-- 2 of 2 --\n";
  const out7 = preprocessFlowsheetText(adjacentHeaders);
  assert.ok(out7.includes("Cerenia"), "rows after adjacent MEDICATIONS/PROCEDURES live until page footer");
  assert.ok(!out7.includes("LRS"), "drops rate-only fluid line in that layout");

  console.log("flowsheet preprocess: OK");
}

async function runConfidenceFlags(): Promise<void> {
  console.log("\n-- flowsheet confidence flags");
  const fuse = await createFormularyFuse(["Cerenia"]);
  const fluidDrug = "LRS 6 ml/hr bag with 10 mg metoclopramide IV";
  const ext1 = extractDrugLine(fluidDrug, fuse);
  const s1 = scoreExtractedDrug(ext1);
  assert.ok(s1.flags.includes("FLUID_VS_DRUG_UNCLEAR"), "fluid token + mg dose on same line");

  const emptyFuse = await createFormularyFuse([]);
  const unknown = "999 Xyznoname 12 mg IV";
  const ext2 = extractDrugLine(unknown, emptyFuse);
  const s2 = scoreExtractedDrug(ext2);
  assert.ok(s2.flags.includes("DRUG_UNKNOWN"));
  assert.ok(s2.flags.includes("LINE_AMBIGUOUS"), "unknown name with mg gets LINE_AMBIGUOUS");

  console.log("flowsheet confidence flags: OK");
}

async function main(): Promise<void> {
  await run();
  await runConfidenceFlags();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
