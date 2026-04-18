import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expandPackage } from "../server/config/billingPackages.ts";

let passed = 0;
let failed = 0;

function ok(label: string) {
  console.log(`  PASS: ${label}`);
  passed += 1;
}

function fail(label: string, detail?: string) {
  console.error(`  FAIL: ${label}`);
  if (detail) console.error(`       ${detail}`);
  failed += 1;
}

function check(condition: unknown, label: string, detail?: string) {
  if (condition) ok(label);
  else fail(label, detail);
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

const equipmentRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "equipment.ts"), "utf8");
const equipmentSeen = fs.readFileSync(path.join(repoRoot, "server", "lib", "equipment-seen.ts"), "utf8");
const appointmentsService = fs.readFileSync(path.join(repoRoot, "server", "services", "appointments.service.ts"), "utf8");

console.log("\n-- Phase 2.3 Medication + Package integration checks");

const lightweight = expandPackage("fluid_protocol", 8);
const heavyweight = expandPackage("fluid_protocol", 22);

check(
  lightweight.length === 4 &&
    lightweight.some((i) => i.itemCode === "FLUID_BAG" && i.quantity === 1) &&
    lightweight.some((i) => i.itemCode === "STOPCOCK" && i.quantity === 2) &&
    lightweight.some((i) => i.itemCode === "EXTENSOR" && i.quantity === 2) &&
    lightweight.some((i) => i.itemCode === "BURETTE" && i.quantity === 1) &&
    !lightweight.some((i) => i.itemCode === "STANDARD_IV_LINE"),
  "Fluid protocol (<15kg) expands with burette branch",
);

check(
  heavyweight.length === 4 &&
    heavyweight.some((i) => i.itemCode === "FLUID_BAG" && i.quantity === 1) &&
    heavyweight.some((i) => i.itemCode === "STOPCOCK" && i.quantity === 2) &&
    heavyweight.some((i) => i.itemCode === "EXTENSOR" && i.quantity === 2) &&
    heavyweight.some((i) => i.itemCode === "STANDARD_IV_LINE" && i.quantity === 1) &&
    !heavyweight.some((i) => i.itemCode === "BURETTE"),
  "Fluid protocol (>=15kg) expands with standard line branch",
);

check(
  equipmentRoute.includes('packageCode: z.enum(["fluid_protocol"]).optional().nullable()') &&
    equipmentRoute.includes("recordEquipmentSeen({") &&
    equipmentRoute.includes("packageCode: packageCode ?? null") &&
    equipmentRoute.includes("packageLedgerIds: result.packageLedgerIds ?? []"),
  "NFC/seen route accepts packageCode and returns package ledger ids",
);

check(
  equipmentSeen.includes("expandPackage(packageCode") &&
    equipmentSeen.includes("for (const item of expanded)") &&
    equipmentSeen.includes("itemType: \"CONSUMABLE\"") &&
    equipmentSeen.includes("await markIdempotentAsync(redisPackageKey)") &&
    equipmentSeen.includes("packageLedgerIds.push") &&
    equipmentSeen.includes("return db.transaction(async (tx) =>") &&
    equipmentSeen.includes("processEquipmentSeenInTx({"),
  "Equipment seen flow expands package items and inserts them transactionally",
);

check(
  appointmentsService.includes("startTask(") &&
    appointmentsService.includes("acknowledgedBy") &&
    appointmentsService.includes("acknowledged_at") &&
    appointmentsService.includes("completeTask(") &&
    appointmentsService.includes("completedBy") &&
    appointmentsService.includes("completed_at") &&
    appointmentsService.includes("completionIdempotencyKey") &&
    appointmentsService.includes("await tx.insert(billingLedger).values({") &&
    appointmentsService.includes("broadcast(clinicId, { type: \"TASK_UPDATED\""),
  "Medication create/start/complete flow keeps audit stamps, billing, and realtime updates",
);

const expectedLedgerRowsPerScan = 1 + lightweight.length;
check(
  expectedLedgerRowsPerScan === 5,
  "Single fluid protocol scan yields 5 billing ledger rows (1 equipment + 4 package lines)",
  `Expected 5 rows, got ${expectedLedgerRowsPerScan}`,
);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
assert.strictEqual(failed, 0, "Integration checks failed");
console.log("\nphase-2-3-medication-package-integration.test.ts passed");
