"use strict";

const fs = require("fs");
const path = require("path");

let passed = 0;
let failed = 0;

function ok(label) {
  console.log(`  ✅ PASS: ${label}`);
  passed++;
}

function fail(label, detail) {
  console.error(`  ❌ FAIL: ${label}${detail ? ` — ${detail}` : ""}`);
  failed++;
}

function assert(condition, label, detail) {
  if (condition) ok(label);
  else fail(label, detail);
}

function readFile(relPath) {
  return fs.readFileSync(path.join(__dirname, "..", relPath), "utf8");
}

const codeBluePage = readFile("src/pages/code-blue.tsx");
const layout = readFile("src/components/layout.tsx");
const routesSource = readFile("src/app/routes.tsx");

console.log("\n=== Code Blue page structure tests ===");

assert(
  codeBluePage.includes("api.equipment.getCriticalEquipment"),
  "Code Blue page fetches critical equipment via API client",
);

assert(
  codeBluePage.includes("refetchInterval: 15_000"),
  "Auto-refresh is configured to 15 seconds",
);

assert(
  codeBluePage.includes("CODE BLUE — ציוד קריטי") &&
    codeBluePage.includes("AlertTriangle"),
  "Header contains Code Blue Hebrew label with alert icon",
);

assert(
  codeBluePage.includes("formatCodeBlueRelativeTime(item.lastSeenTimestamp)") &&
    !codeBluePage.includes("item.lastSeenTimestamp ??"),
  "Timestamp is rendered via relative-time formatter (not raw ISO)",
);

assert(
  codeBluePage.includes("onClick={() => navigate(\"/\")}") &&
    codeBluePage.includes("<X className=\"w-4 h-4 mr-1\" />"),
  "Dismiss button exists and navigates back",
);

assert(
  codeBluePage.includes("items.length === 0") &&
    codeBluePage.includes("אין כרגע ציוד קריטי או ציוד שדורש תשומת לב."),
  "Empty-state rendering exists when no equipment is returned",
);

assert(
  layout.includes("const canAccessCodeBlue = isAdmin || role === \"vet\"") &&
    layout.includes("href: \"/code-blue\""),
  "Code Blue nav button is role-gated to admin/vet",
);

assert(
  routesSource.includes("const CodeBluePage = lazy(() => import(\"@/pages/code-blue\"));") &&
    routesSource.includes('<Route path="/code-blue"><AuthGuard><CodeBluePage /></AuthGuard></Route>'),
  "Code Blue route is registered behind AuthGuard",
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  process.exit(1);
}
