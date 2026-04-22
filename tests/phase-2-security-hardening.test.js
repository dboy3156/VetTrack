import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const repoRoot = path.resolve(__dirname, "..");
const audit = fs.readFileSync(path.join(repoRoot, "server", "lib", "audit.ts"), "utf8");
const roleResolution = fs.readFileSync(path.join(repoRoot, "server", "lib", "role-resolution.ts"), "utf8");
const usersRoute = fs.readFileSync(path.join(repoRoot, "server", "routes", "users.ts"), "utf8");
const auth = fs.readFileSync(path.join(repoRoot, "server", "middleware", "auth.ts"), "utf8");

describe("Phase 2 security hardening checks (static)", () => {
  it("Audit action type includes users_backfilled_from_clerk", () => {
    expect(audit).toContain("| \"users_backfilled_from_clerk\"");
  });

  it("Role resolution supports canonical userId lookup", () => {
    expect(
      roleResolution.includes("userId?: string;") &&
        roleResolution.includes("where(and(eq(users.id, input.userId.trim()), eq(users.clinicId, input.clinicId)))"),
    ).toBe(true);
  });

  it("Users sync relies on authoritative auth context identity fields", () => {
    expect(
      usersRoute.includes("const canonicalClerkId = req.authUser!.clerkId;") &&
        usersRoute.includes("const canonicalEmail = req.authUser!.email;") &&
        usersRoute.includes("const canonicalName = req.authUser!.name;") &&
        usersRoute.includes("source: \"authoritative_auth_context\""),
    ).toBe(true);
  });

  it("Users sync blocks request/auth identity mismatches", () => {
    expect(usersRoute).toContain(
      "if (clerkId !== canonicalClerkId || email.toLowerCase() !== canonicalEmail.toLowerCase())",
    );
  });

  it("Role resolution consumers pass canonical user id", () => {
    expect(
      auth.includes("userId: req.authUser.id,") && usersRoute.includes("userId: req.authUser.id,"),
    ).toBe(true);
  });
});
