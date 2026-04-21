import assert from "node:assert/strict";

async function run(): Promise<void> {
  const { resolveAuthMode, resolveAuthModeFromEnv, describeAuthMode } = await import(
    "../server/lib/auth-mode.ts"
  );

  console.log("\n-- auth-mode resolution");

  // Dev bypass when nothing is set.
  const empty = resolveAuthMode({});
  assert.equal(empty.mode, "dev-bypass");
  assert.equal(empty.reason, "secret-missing");
  assert.equal(empty.hasSecret, false);

  // Clerk when secret present.
  const clerk = resolveAuthMode({ clerkSecretKey: "sk_test_abc" });
  assert.equal(clerk.mode, "clerk");
  assert.equal(clerk.reason, "secret-present");
  assert.equal(clerk.hasSecret, true);

  // CLERK_ENABLED=false forces dev bypass even with a secret.
  const disabled = resolveAuthMode({ clerkSecretKey: "sk_test_abc", clerkEnabled: "false" });
  assert.equal(disabled.mode, "dev-bypass");
  assert.equal(disabled.reason, "clerk-explicitly-disabled");

  // Publishable key alone does not switch to clerk mode (server is authoritative).
  const pubOnly = resolveAuthMode({ vitePublishableKey: "pk_test_abc" });
  assert.equal(pubOnly.mode, "dev-bypass");
  assert.equal(pubOnly.hasPublishable, true);

  // Whitespace-only values are treated as unset.
  const blanks = resolveAuthMode({ clerkSecretKey: "   ", clerkPublishableKey: "" });
  assert.equal(blanks.mode, "dev-bypass");
  assert.equal(blanks.hasSecret, false);
  assert.equal(blanks.hasPublishable, false);

  // resolveAuthModeFromEnv reads from the passed env bag.
  const fromEnv = resolveAuthModeFromEnv({
    CLERK_SECRET_KEY: "sk_test_xyz",
    VITE_CLERK_PUBLISHABLE_KEY: "pk_test_xyz",
    NODE_ENV: "development",
  } as NodeJS.ProcessEnv);
  assert.equal(fromEnv.mode, "clerk");
  assert.equal(fromEnv.hasPublishable, true);
  assert.equal(fromEnv.nodeEnv, "development");

  // describeAuthMode is redaction-friendly (does not contain the key itself).
  const description = describeAuthMode(fromEnv);
  assert.ok(!description.includes("sk_test_xyz"), "description must not leak secret");
  assert.ok(description.includes("mode=clerk"));
  assert.ok(description.includes("hasSecret=true"));

  console.log("   ok resolveAuthMode / resolveAuthModeFromEnv / describeAuthMode");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
