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
const audit = fs.readFileSync(path.join(repoRoot, "server", "lib", "audit.ts"), "utf8");
const roleResolution = fs.readFileSync(path.join(repoRoot, "server", "lib", "role-resolution.ts"), "utf8");
const usersRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "users.ts"), "utf8");
const auth = fs.readFileSync(path.join(repoRoot, "server", "middleware", "auth.ts"), "utf8");

console.log("\n-- Phase 2 security hardening checks (static)");

assert(
  audit.includes("| \"users_backfilled_from_clerk\""),
  "Audit action type includes users_backfilled_from_clerk",
  "Expected audit action type union to include users_backfilled_from_clerk",
);

assert(
  roleResolution.includes("userId?: string;") &&
    roleResolution.includes("where(and(eq(users.id, input.userId.trim()), eq(users.clinicId, input.clinicId)))"),
  "Role resolution supports canonical userId lookup",
  "Expected resolveCurrentRole to derive canonical identity from users table by userId",
);

assert(
  usersRoute.includes("const canonicalClerkId = req.authUser!.clerkId;") &&
    usersRoute.includes("const canonicalEmail = req.authUser!.email;") &&
    usersRoute.includes("const canonicalName = req.authUser!.name;") &&
    usersRoute.includes("source: \"authoritative_auth_context\""),
  "Users sync relies on authoritative auth context identity fields",
  "Expected /users/sync writes and audit metadata to use server-side canonical identity",
);

assert(
  usersRoute.includes("if (clerkId !== canonicalClerkId || email.toLowerCase() !== canonicalEmail.toLowerCase())"),
  "Users sync blocks request/auth identity mismatches",
  "Expected /users/sync to reject clerkId/email mismatches",
);

assert(
  auth.includes("userId: req.authUser.id,") &&
    usersRoute.includes("userId: req.authUser.id,"),
  "Role resolution consumers pass canonical user id",
  "Expected auth middleware and users/me to pass userId to resolveCurrentRole",
);

if (failed > 0) {
  console.error(`\nPhase 2 security hardening checks failed (${failed} failed, ${passed} passed)`);
  process.exit(1);
}

console.log(`\nPhase 2 security hardening checks passed (${passed} assertions).`);
