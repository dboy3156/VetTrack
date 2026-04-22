import { describe, it, expect } from "vitest";
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

describe("dev-user-status smoke", () => {
  it("refuses to run in production regardless of other args", () => {
    const prod = runScript(["--email=x@example.com"], {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/db",
    });
    expect(prod.status).toBe(3);
  });

  it("expected production refusal message", () => {
    const prod = runScript(["--email=x@example.com"], {
      ...process.env,
      NODE_ENV: "production",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/db",
    });
    expect(/production/i.test(prod.stderr)).toBeTruthy();
  });

  it("prints usage and exits 3 when neither email nor clerk-id is supplied", () => {
    const noArgs = runScript([], {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/db",
    });
    expect(noArgs.status).toBe(3);
  });

  it("expected usage block on stderr when no args", () => {
    const noArgs = runScript([], {
      ...process.env,
      NODE_ENV: "development",
      DATABASE_URL: "postgres://user:pass@127.0.0.1:5432/db",
    });
    expect(/Usage:/i.test(noArgs.stderr)).toBeTruthy();
  });
});
