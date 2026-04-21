import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.join(process.cwd(), "scripts", "dev-user-status.ts");

function runScript(args: string[], env: NodeJS.ProcessEnv = process.env): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", SCRIPT, ...args], {
    env: { ...env },
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

async function run(): Promise<void> {
  console.log("\n-- dev-user-status smoke");

  // Refuses to run in production regardless of other args.
  const prod = runScript(["--email=x@example.com"], {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/db",
  });
  assert.equal(prod.status, 3, `expected exit 3 in production, got ${prod.status}. stderr=${prod.stderr}`);
  assert.ok(/production/i.test(prod.stderr), "expected production refusal message");

  // Prints usage and exits 3 when neither email nor clerk-id is supplied.
  const noArgs = runScript([], {
    ...process.env,
    NODE_ENV: "development",
    DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/db",
  });
  assert.equal(noArgs.status, 3, `expected exit 3 for missing args, got ${noArgs.status}. stderr=${noArgs.stderr}`);
  assert.ok(/Usage:/i.test(noArgs.stderr), "expected usage block on stderr");

  console.log("   ok dev-user-status refuses unsafe operations");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
