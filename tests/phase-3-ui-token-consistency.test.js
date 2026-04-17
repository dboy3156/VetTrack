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
const appointments = fs.readFileSync(path.join(repoRoot, "src", "pages", "appointments.tsx"), "utf8");
const layout = fs.readFileSync(path.join(repoRoot, "src", "components", "layout.tsx"), "utf8");
const home = fs.readFileSync(path.join(repoRoot, "src", "pages", "home.tsx"), "utf8");

console.log("\n-- Wave 3 UI token consistency checks (static)");

assert(
  appointments.includes("const URGENT_BADGE_STYLES = {") &&
    appointments.includes("className={URGENT_BADGE_STYLES.overdue}") &&
    appointments.includes("className={URGENT_BADGE_STYLES.critical}"),
  "Appointments urgent badges use centralized style tokens",
  "Expected overdue/critical urgent badges to consume URGENT_BADGE_STYLES",
);

assert(
  appointments.includes("critical: \"bg-destructive text-destructive-foreground border-transparent\""),
  "Appointments critical priority badge uses semantic destructive tokens",
  "Expected critical PRIORITY_BADGE style to use design-token semantic classes",
);

assert(
  appointments.includes("high: \"bg-accent text-accent-foreground border-transparent\""),
  "Appointments high priority badge uses semantic accent tokens",
  "Expected high PRIORITY_BADGE style to avoid hardcoded palette classes",
);

assert(
  appointments.includes("normal: \"bg-muted text-foreground border-border\""),
  "Appointments normal task priority uses neutral semantic tokens",
  "Expected normal PRIORITY_COLORS style to use neutral token classes",
);

assert(
  appointments.includes("critical: \"bg-destructive/10 text-destructive border-destructive/30\""),
  "Appointments critical task priority uses semantic destructive tokens",
  "Expected critical PRIORITY_COLORS style to avoid hardcoded orange palette classes",
);

assert(
  appointments.includes("high: \"bg-accent text-accent-foreground border-border\""),
  "Appointments high task priority uses semantic accent tokens",
  "Expected high PRIORITY_COLORS style to avoid hardcoded yellow palette classes",
);

assert(
  layout.includes("className=\"fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background\"") &&
    layout.includes("bg-destructive text-destructive-foreground") &&
    layout.includes("bg-primary text-primary-foreground"),
  "Layout bottom navigation uses semantic token classes",
  "Expected bottom nav/fab/badges to avoid hardcoded white/red/text classes",
);

assert(
  home.includes("ok: \"text-primary\"") &&
    home.includes("issue: \"text-destructive\"") &&
    home.includes("CheckCircle2 className=\"w-4 h-4 text-primary mb-1.5\""),
  "Home status visuals use semantic token classes",
  "Expected home page status colors to avoid hardcoded emerald/red/amber classes",
);

if (failed > 0) {
  console.error(`\nUI token consistency checks failed (${failed} failed, ${passed} passed)`);
  process.exit(1);
}

console.log(`\nUI token consistency checks passed (${passed} assertions).`);
