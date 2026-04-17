"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  PASS: ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  FAIL: ${label}`);
  if (detail) console.error(`    ${detail}`);
  failed++;
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

const repoRoot = path.resolve(__dirname, "..");
const i18n = fs.readFileSync(path.join(repoRoot, "src", "lib", "i18n.ts"), "utf8");
const settings = fs.readFileSync(path.join(repoRoot, "src", "pages", "settings.tsx"), "utf8");
const main = fs.readFileSync(path.join(repoRoot, "src", "main.tsx"), "utf8");
const css = fs.readFileSync(path.join(repoRoot, "src", "index.css"), "utf8");
const exportExcel = fs.readFileSync(path.join(repoRoot, "src", "lib", "export-excel.ts"), "utf8");

console.log("\n-- Phase 4 i18n/RTL foundation checks (static)");

assert(
  i18n.includes("window.dispatchEvent(new CustomEvent(\"vettrack:locale-changed\"") &&
    i18n.includes("export function getCurrentLocale(): Locale"),
  "i18n emits locale change events and exposes current locale helper",
  "Expected locale storage updates to broadcast a locale-changed event and helper API",
);

assert(
  settings.includes("data-testid=\"settings-locale\"") &&
    settings.includes("onValueChange={(v) => update({ locale: v as \"en\" | \"he\" })}"),
  "Settings includes locale selector control",
  "Expected settings page locale selector to update persisted locale setting",
);

assert(
  main.includes("window.addEventListener(\"vettrack:locale-changed\"") &&
    main.includes("return <App key={`locale-${localeVersion}`} />;"),
  "App bootstrap reacts to locale changes without full page reload",
  "Expected app to remount on locale change event",
);

assert(
  css.includes("html[dir=\"rtl\"] body") &&
    css.includes("html[dir=\"rtl\"] input,") &&
    css.includes("html[dir=\"rtl\"] .rtl-mirror"),
  "Base RTL direction rules are present in global CSS",
  "Expected index.css to include foundational RTL direction and alignment rules",
);

assert(
  exportExcel.includes("const locale = getCurrentLocale();") &&
    exportExcel.includes("toLocaleString(locale)") &&
    exportExcel.includes("toLocaleDateString(locale)"),
  "Excel export uses selected locale for date/time formatting",
  "Expected export-excel formatter calls to be locale-aware",
);

if (failed > 0) {
  console.error(`\nPhase 4 i18n/RTL checks failed (${failed} failed, ${passed} passed)`);
  process.exit(1);
}

console.log(`\nPhase 4 i18n/RTL checks passed (${passed} assertions).`);
