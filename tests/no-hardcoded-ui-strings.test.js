"use strict";

const fs = require("fs");
const path = require("path");

const SRC_ROOT = path.resolve(__dirname, "..", "src");
const FORBIDDEN = ["Hello"];
const SOURCE_EXTENSIONS = new Set([".tsx", ".ts", ".jsx", ".js"]);

let checked = 0;
let failed = 0;

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  checked++;
  for (const token of FORBIDDEN) {
    if (content.includes(token)) {
      failed++;
      console.error(`  FAIL: Forbidden UI literal "${token}" found in ${path.relative(path.resolve(__dirname, ".."), filePath)}`);
      return;
    }
  }
  console.log(`  PASS: ${path.relative(path.resolve(__dirname, ".."), filePath)}`);
}

function walk(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__") continue;
      walk(fullPath);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      scanFile(fullPath);
    }
  }
}

console.log("\n-- UI hardcoded string guard");
walk(SRC_ROOT);
console.log(`Checked ${checked} files`);
if (failed > 0) {
  console.error(`\nno-hardcoded-ui-strings.test.js FAILED (${failed} file(s) matched forbidden literals)`);
  process.exit(1);
}
console.log("\nno-hardcoded-ui-strings.test.js PASSED");
