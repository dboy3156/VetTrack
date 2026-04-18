"use strict";

/**
 * Return plug dialog UI logic tests.
 * Run with: node tests/return-plug-dialog.test.js
 */

const fs = require("fs");
const path = require("path");

const dialogPath = path.join(__dirname, "..", "src", "components", "return-plug-dialog.tsx");
const detailPath = path.join(__dirname, "..", "src", "pages", "equipment-detail.tsx");
const listPath = path.join(__dirname, "..", "src", "pages", "equipment-list.tsx");
const qrPath = path.join(__dirname, "..", "src", "components", "qr-scanner.tsx");

const dialogSource = fs.readFileSync(dialogPath, "utf8");
const detailSource = fs.readFileSync(detailPath, "utf8");
const listSource = fs.readFileSync(listPath, "utf8");
const qrSource = fs.readFileSync(qrPath, "utf8");

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

function run() {
  console.log("=== Return plug dialog UI tests ===");

  assert(
    dialogSource.includes("data-testid=\"btn-plugged-no\"") &&
      dialogSource.includes("data-testid=\"btn-plugged-yes\"") &&
      dialogSource.includes("data-testid=\"input-plug-deadline\""),
    "Dialog exposes plugged yes/no controls and deadline input",
  );

  assert(
    dialogSource.includes("!isPluggedIn && (") &&
      dialogSource.includes("data-testid=\"return-plug-warning\"") &&
      dialogSource.includes("התראה תישלח לאחר"),
    "Warning text is rendered when isPluggedIn is false",
  );

  assert(
    dialogSource.includes("...(isPluggedIn ? {} : { plugInDeadlineMinutes: normalizedDeadline })"),
    "Dialog omits deadline payload when isPluggedIn is true",
  );

  assert(
    detailSource.includes("<ReturnPlugDialog") &&
      detailSource.includes("data-testid=\"btn-return\"") &&
      detailSource.includes("onClick={handleOpenReturnDialog}"),
    "Equipment detail return action opens the plug dialog",
  );

  assert(
    listSource.includes("<ReturnPlugDialog") &&
      listSource.includes("setReturnDialogOpen(true)") &&
      listSource.includes("returnMut.mutate(payload"),
    "Equipment list return quick action routes through the plug dialog",
  );

  assert(
    qrSource.includes("<ReturnPlugDialog") &&
      qrSource.includes("setReturnDialogOpen(true)") &&
      qrSource.includes("await api.equipment.return(scannedEquipment.id, {"),
    "QR scanner return flow routes through the plug dialog",
  );

  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exit(1);
  }
}

run();
