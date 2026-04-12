import { spawnSync, spawn } from "child_process";
import * as http from "http";

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
    "DATABASE_URL",
    "SESSION_SECRET",
    "CLERK_SECRET_KEY",
    "VITE_CLERK_PUBLISHABLE_KEY",
  ];
  const INSECURE: Record<string, string[]> = {
    SESSION_SECRET: ["vettrack-dev-secret", "dev-secret", "secret", "changeme", "password"],
  };

  const missing: string[] = [];
  const insecure: string[] = [];

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
    pass("Environment Variables", `All ${REQUIRED.length} required variables present and valid`);
  }
}

function checkSecretScan() {
  const result = spawnSync("npx", ["tsx", "scripts/scan-secrets.ts"], {
    encoding: "utf-8",
    env: process.env,
  });
  if (result.status === 0) {
    pass("Secret Scan", "No hardcoded secrets detected in source tree");
  } else {
    const output = (result.stdout + result.stderr).trim();
    fail("Secret Scan", output || "Secret scan exited non-zero");
  }
}

function checkFrontendBuild() {
  const result = spawnSync("bash", ["scripts/validate-build.sh"], {
    encoding: "utf-8",
    env: process.env,
  });
  if (result.status === 0) {
    const lastLine = (result.stdout || "").trim().split("\n").pop() || "";
    pass("Frontend Build", lastLine || "Build succeeded");
  } else {
    const output = (result.stdout + result.stderr).trim();
    fail("Frontend Build", output || "Vite build failed");
  }
}

function waitForServer(port: number, maxAttempts = 20, delayMs = 500): Promise<boolean> {
  return new Promise((resolve) => {
    let attempts = 0;
    function probe() {
      const req = http.get(`http://localhost:${port}/api/health`, (res) => {
        res.resume();
        if (res.statusCode === 200) {
          resolve(true);
        } else {
          retry();
        }
      });
      req.on("error", retry);
      req.setTimeout(delayMs, () => {
        req.destroy();
        retry();
      });
    }
    function retry() {
      attempts++;
      if (attempts >= maxAttempts) {
        resolve(false);
      } else {
        setTimeout(probe, delayMs);
      }
    }
    probe();
  });
}

function checkHealthEndpoint(port: number): Promise<void> {
  return new Promise((resolve) => {
    const options = {
      hostname: "localhost",
      port,
      path: "/api/health",
      method: "GET",
      timeout: 10000,
    };

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          if (data.trim() === "ok") {
            pass("Runtime Health Check", "Server responded ok");
            resolve();
            return;
          }
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(data);
          } catch {
            pass("Runtime Health Check", `Server responded 200: ${data.trim().slice(0, 80)}`);
            resolve();
            return;
          }
          const checks = parsed.checks as Record<string, string> | undefined;
          if (parsed.status === "ok") {
            const summary = checks
              ? Object.entries(checks).map(([k, v]) => `${k}=${v}`).join(", ")
              : "all checks passed";
            pass("Runtime Health Check", summary);
          } else {
            const failed = checks
              ? Object.entries(checks).filter(([, v]) => v !== "ok").map(([k, v]) => `${k}=${v}`).join(", ")
              : "unknown";
            fail("Runtime Health Check", `Health check degraded: ${failed}`);
          }
        } else {
          let parsed: Record<string, unknown> = {};
          try { parsed = JSON.parse(data); } catch { /* ignore */ }
          const checks = parsed.checks as Record<string, string> | undefined;
          const failed = checks
            ? Object.entries(checks).filter(([, v]) => v !== "ok").map(([k, v]) => `${k}=${v}`).join(", ")
            : data.slice(0, 200);
          fail("Runtime Health Check", `HTTP ${res.statusCode}: ${failed}`);
        }
        resolve();
      });
    });

    req.on("timeout", () => {
      req.destroy();
      fail("Runtime Health Check", `Timed out connecting to /api/health`);
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

  console.log(`   Starting server on port ${port} for health check...`);

  const serverEnv = {
    ...process.env,
    NODE_ENV: "production",
    PORT: String(port),
    CLERK_ENABLED: "false",
    CLERK_SECRET_KEY: "sk_test_healthcheck00000000000000000",
    VITE_CLERK_PUBLISHABLE_KEY: "pk_test_healthcheck0000000000000000000",
  };

  const serverProc = spawn("npx", ["tsx", "server/index.ts"], {
    env: serverEnv,
    stdio: ["ignore", "pipe", "pipe"],
    detached: false,
  });

  const serverLogs: string[] = [];
  serverProc.stdout?.on("data", (d: Buffer) => serverLogs.push(d.toString()));
  serverProc.stderr?.on("data", (d: Buffer) => serverLogs.push(d.toString()));

  let serverExited = false;
  let serverExitCode: number | null = null;
  serverProc.on("exit", (code) => {
    serverExited = true;
    serverExitCode = code;
  });

  try {
    const ready = await waitForServer(port, 30, 500);

    if (!ready || serverExited) {
      const exitInfo = serverExited ? ` (exited with code ${serverExitCode})` : "";
      const logOutput = serverLogs.join("").trim().slice(-500);
      fail("Runtime Health Check", `Server did not become ready on port ${port}${exitInfo}. Last output: ${logOutput}`);
      return;
    }

    console.log(`   Server ready. Checking /api/health...`);
    await checkHealthEndpoint(port);
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

  checkEnvVars();
  checkSecretScan();
  checkFrontendBuild();
  await checkRuntimeHealth();

  printReport();
}

main().catch((err) => {
  console.error("Unexpected error during validation:", err);
  process.exit(1);
});
