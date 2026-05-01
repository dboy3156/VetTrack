import { spawnSync, spawn } from "child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import * as http from "http";
import dotenv from "dotenv";
import { isPostgresqlConfigured } from "../server/lib/postgresql.js";

/** Same precedence as server: local overrides, then shared `.env` (does not replace OS env). */
dotenv.config({ path: ".env.local" });
dotenv.config({ path: ".env" });

const requireFromProject = createRequire(join(process.cwd(), "package.json"));

/** Absolute path to tsx CLI — avoids `spawn npx` / `npx.cmd` ENOENT and EINVAL on Windows. */
function tsxCliPath(): string {
  const pkgJson = requireFromProject.resolve("tsx/package.json");
  return join(dirname(pkgJson), "dist", "cli.mjs");
}

interface CheckResult {
  name: string;
  status: "PASS" | "FAIL";
  message: string;
}

const results: CheckResult[] = [];

function pass(name: string, message: string) {
  results.push({ name, status: "PASS", message });
}

function fail(name: string, message: string) {
  results.push({ name, status: "FAIL", message });
}

function checkEnvVars() {
  const REQUIRED = [
    "SESSION_SECRET",
    "CLERK_SECRET_KEY",
    "VITE_CLERK_PUBLISHABLE_KEY",
  ];
  const INSECURE: Record<string, string[]> = {
    SESSION_SECRET: ["vettrack-dev-secret", "dev-secret", "secret", "changeme", "password"],
  };

  const missing: string[] = [];
  const insecure: string[] = [];

  if (!isPostgresqlConfigured()) {
    missing.push("DATABASE_URL or POSTGRES_URL");
  }

  for (const varName of REQUIRED) {
    const val = process.env[varName];
    if (!val || val.trim() === "") {
      missing.push(varName);
    }
  }

  for (const [varName, badVals] of Object.entries(INSECURE)) {
    const val = process.env[varName];
    if (val && badVals.includes(val)) {
      insecure.push(`${varName}="${val}"`);
    }
  }

  const issues: string[] = [];
  if (missing.length > 0) issues.push(`Missing: ${missing.join(", ")}`);
  if (insecure.length > 0) issues.push(`Insecure values: ${insecure.join(", ")}`);

  if (issues.length > 0) {
    fail("Environment Variables", issues.join(" | "));
  } else {
    pass("Environment Variables", "All required variables present and valid");
  }
}

/** Reliable exit code / description for spawnSync (Windows often yields null status without shell). */
function spawnSyncExitSummary(result: ReturnType<typeof spawnSync>): string {
  if (typeof result.status === "number") return String(result.status);
  if (result.signal) return `signal:${result.signal}`;
  if (result.error) return `spawn:${result.error.message}`;
  return "null";
}

function checkSecretScan() {
  // stdio: inherit streams scan banner + hits live. scan-secrets.ts only walks server/, shared/, scripts/, src/, lib/
  // and skips node_modules, .worktrees, .git, dist, .venv, etc.
  const result = spawnSync(process.execPath, [tsxCliPath(), "scripts/scan-secrets.ts"], {
    env: process.env,
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status === 0) {
    pass("Secret Scan", "No hardcoded secrets detected in source tree");
  } else {
    fail(
      "Secret Scan",
      `scan-secrets.ts exited with code ${spawnSyncExitSummary(result)} (see streaming output above)`,
    );
  }
}

/** Cross-platform `pnpm` executable (Windows resolves `pnpm.cmd` via PATHEXT when shell is unset). */
function pnpmCmd(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

function checkFrontendBuild() {
  const cwd = process.cwd();
  const env = process.env;
  // Windows: invoke `pnpm.cmd run build` via cmd.exe so exit codes are populated reliably (spawn of .cmd alone can yield null status).
  const result =
    process.platform === "win32"
      ? spawnSync(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", "pnpm.cmd", "run", "build"], {
          env,
          cwd,
          stdio: "inherit",
          windowsHide: true,
        })
      : spawnSync(pnpmCmd(), ["run", "build"], {
          env,
          cwd,
          stdio: "inherit",
          windowsHide: true,
        });

  if (result.status === 0) {
    pass("Frontend Build", "Vite build completed (see streaming output above)");
  } else {
    fail(
      "Frontend Build",
      `pnpm run build exited with code ${spawnSyncExitSummary(result)} (see streaming output above)`,
    );
  }
}

/** Cold start (tsx + migrations + Windows AV) can exceed 45s on some dev machines; gateway audit must stay reliable. */
const RUNTIME_HEALTH_TOTAL_MS = 90_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Use IPv4 loopback — on Windows, `localhost` may resolve to ::1 while Express listens on 0.0.0.0 (IPv4 only). */
const HEALTH_PROBE_HOST = "127.0.0.1";

/** Probe /api/health until success or absolute deadline (cooperative with overall timeout). */
async function waitForServerUntil(port: number, deadlineMs: number): Promise<boolean> {
  const delayBetweenMs = 400;
  while (Date.now() < deadlineMs) {
    const probeTimeout = Math.min(800, Math.max(50, deadlineMs - Date.now()));
    if (probeTimeout <= 0) break;
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(`http://${HEALTH_PROBE_HOST}:${port}/api/healthz`, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(probeTimeout, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return true;
    await sleep(delayBetweenMs);
  }
  return false;
}

function checkHealthEndpoint(port: number, requestTimeoutMs = 45_000): Promise<void> {
  return new Promise((resolve) => {
    const options = {
      hostname: HEALTH_PROBE_HOST,
      port,
      // Liveness only (no DB/Clerk/VAPID) — matches production smoke probes; avoids false 503 from readiness when Clerk keys are absent or placeholders.
      path: "/api/healthz",
      method: "GET",
      timeout: requestTimeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200 && data.trim() === "ok") {
          pass("Runtime Health Check", "GET /api/healthz returned 200 ok");
          resolve();
          return;
        }
        fail(
          "Runtime Health Check",
          `Expected 200 body ok from /api/healthz, got HTTP ${res.statusCode}: ${data.trim().slice(0, 120)}`,
        );
        resolve();
      });
    });

    req.on("timeout", () => {
      req.destroy();
      fail("Runtime Health Check", `Timed out connecting to /api/healthz`);
      resolve();
    });

    req.on("error", (err) => {
      fail("Runtime Health Check", `Could not reach server: ${err.message}`);
      resolve();
    });

    req.end();
  });
}

async function checkRuntimeHealth(): Promise<void> {
  const port = 19871;

  console.log(
    `   Starting server (same entry as pnpm start:local — tsx server/index.ts, NODE_ENV=development) on port ${port}...`,
  );

  const placeholder = (key: string, fallback: string): string => {
    const v = process.env[key];
    return v && v.trim() !== "" ? v : fallback;
  };

  const serverEnv = {
    ...process.env,
    NODE_ENV: "development",
    PORT: String(port),
    // Smoke-test child process: satisfy anything expecting a non-empty session secret. Force dev-bypass auth so
    // Clerk middleware is not mounted — liveness must not depend on Clerk keys or outbound Clerk calls.
    SESSION_SECRET: placeholder(
      "SESSION_SECRET",
      "validate-prod-health-probe-session-secret-minimum-length-32",
    ),
    CLERK_SECRET_KEY: "",
    CLERK_PUBLISHABLE_KEY: "",
    VITE_CLERK_PUBLISHABLE_KEY: "",
    // Must win over `.env.local` Clerk keys so liveness never waits on Clerk (see server/lib/auth-mode.ts).
    CLERK_ENABLED: "false",
  };

  const serverProc = spawn(process.execPath, [tsxCliPath(), "server/index.ts"], {
    env: serverEnv,
    stdio: "inherit",
    detached: false,
    cwd: process.cwd(),
    windowsHide: true,
  });

  let serverExited = false;
  let serverExitCode: number | null = null;
  serverProc.on("exit", (code) => {
    serverExited = true;
    serverExitCode = code;
  });

  const logTail = (): string =>
    "(server logs streamed above - stdio inherit; no captured tail)";

  let timedOut = false;

  const inner = async (): Promise<void> => {
    const deadline = Date.now() + RUNTIME_HEALTH_TOTAL_MS;
    const ready = await waitForServerUntil(port, deadline);

    if (timedOut) return;

    if (!ready || serverExited) {
      const exitInfo = serverExited ? ` (exited with code ${serverExitCode})` : "";
      fail(
        "Runtime Health Check",
        `Server did not become ready on port ${port}${exitInfo}. Last output: ${logTail()}`,
      );
      return;
    }

    console.log(`   Server ready. Checking /api/health...`);
    const remaining = Math.min(30_000, Math.max(500, deadline - Date.now()));
    await checkHealthEndpoint(port, remaining);
  };

  try {
    await Promise.race([
      inner(),
      sleep(RUNTIME_HEALTH_TOTAL_MS).then(() => {
        timedOut = true;
        throw new Error(
          `Timed out after ${RUNTIME_HEALTH_TOTAL_MS / 1000}s waiting for runtime health (server did not respond in time).`,
        );
      }),
    ]);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const alreadyFailed = results.some((r) => r.name === "Runtime Health Check" && r.status === "FAIL");
    if (!alreadyFailed) {
      fail("Runtime Health Check", `${msg} Last output: ${logTail()}`);
    }
  } finally {
    if (!serverExited) {
      serverProc.kill("SIGTERM");
    }
  }
}

function printReport() {
  const width = 60;
  console.log("\n" + "=".repeat(width));
  console.log("  PRE-DEPLOY VALIDATION REPORT");
  console.log("=".repeat(width));
  let allPassed = true;
  for (const r of results) {
    const icon = r.status === "PASS" ? "✅" : "❌";
    const label = r.status === "PASS" ? "PASS" : "FAIL";
    console.log(`${icon} [${label}] ${r.name}`);
    console.log(`       ${r.message}`);
    if (r.status === "FAIL") allPassed = false;
  }
  console.log("=".repeat(width));
  if (allPassed) {
    console.log("✅ ALL CHECKS PASSED — ready to deploy.\n");
  } else {
    const failCount = results.filter((r) => r.status === "FAIL").length;
    console.log(`❌ ${failCount} CHECK(S) FAILED — fix the above issues before deploying.\n`);
    process.exit(1);
  }
}

async function main() {
  console.log("🔍 Running pre-deploy validation...\n");

  console.log("[1/4] Environment variables\n");
  checkEnvVars();

  console.log("\n[2/4] Secret scan (streaming)\n");
  checkSecretScan();

  console.log("\n[3/4] Frontend build — often 1–2 min; Vite output streams below\n");
  checkFrontendBuild();

  console.log("\n[4/4] Runtime health check\n");
  await checkRuntimeHealth();

  printReport();
}

main().catch((err) => {
  console.error("Unexpected error during validation:", err);
  process.exit(1);
});
