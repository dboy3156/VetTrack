/**
 * Local auth preflight diagnostics.
 *
 * Answers, without exposing secrets:
 *   - Which .env file(s) exist and what keys they define (redacted).
 *   - Which auth mode the app will boot in (clerk vs dev-bypass) and why.
 *   - Whether DATABASE_URL parses and which host/db it targets.
 *   - Whether the API health endpoint is reachable (when server is up).
 *
 * Exit codes:
 *   0 - diagnostics printed (no assertion about reachability).
 *   1 - fatal misconfiguration detected (e.g., unparsable DATABASE_URL).
 *
 * Run: pnpm run auth:preflight
 */
import "dotenv/config";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { resolveAuthModeFromEnv, describeAuthMode } from "../server/lib/auth-mode.js";

type EnvFileReport = {
  file: string;
  exists: boolean;
  defines: string[];
};

const ENV_FILES = [".env", ".env.local", ".env.development", ".env.development.local"];
const WATCHED_KEYS = [
  "NODE_ENV",
  "CLERK_SECRET_KEY",
  "CLERK_PUBLISHABLE_KEY",
  "VITE_CLERK_PUBLISHABLE_KEY",
  "CLERK_ENABLED",
  "DATABASE_URL",
  "POSTGRES_URL",
  "PORT",
  "AUTH_DEBUG",
];

function listEnvFiles(cwd: string): EnvFileReport[] {
  return ENV_FILES.map((file) => {
    const full = path.join(cwd, file);
    if (!existsSync(full)) return { file, exists: false, defines: [] };
    const contents = readFileSync(full, "utf8");
    const defines = WATCHED_KEYS.filter((key) =>
      new RegExp(`^\\s*${key}\\s*=`, "m").test(contents),
    );
    return { file, exists: true, defines };
  });
}

function redactUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    const user = parsed.username || "(none)";
    const passPresent = parsed.password ? "yes" : "no";
    const host = parsed.hostname || "(none)";
    const port = parsed.port || "(default)";
    const db = parsed.pathname.replace(/^\//, "") || "(none)";
    return `user=${user} passwordPresent=${passPresent} host=${host} port=${port} db=${db}`;
  } catch {
    return null;
  }
}

async function probeHealth(baseUrl: string): Promise<{ ok: boolean; status: number | null; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(new URL("/api/healthz", baseUrl).toString(), { signal: controller.signal });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, status: null, error: err instanceof Error ? err.message : String(err) };
  }
}

function print(title: string, body: string): void {
  console.log(`\n[${title}]`);
  for (const line of body.split("\n")) {
    console.log(`  ${line}`);
  }
}

async function main(): Promise<void> {
  const cwd = process.cwd();
  let hadFatal = false;

  print("env-files", listEnvFiles(cwd)
    .map((r) => `${r.file.padEnd(28, " ")} exists=${r.exists} defines=[${r.defines.join(",")}]`)
    .join("\n"));

  const resolution = resolveAuthModeFromEnv();
  print("auth-mode", describeAuthMode(resolution));
  if (resolution.mode === "clerk" && !resolution.hasPublishable) {
    print("auth-mode-warning", "Clerk secret is set but no publishable key detected.\nThe browser will fall back to dev-bypass, which desyncs from the server.");
  }

  const dbUrl = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
  if (!dbUrl) {
    print("database-url", "DATABASE_URL/POSTGRES_URL not set");
  } else {
    const redacted = redactUrl(dbUrl);
    if (!redacted) {
      print("database-url", "ERROR: DATABASE_URL is not parseable as a URL");
      hadFatal = true;
    } else {
      print("database-url", redacted);
    }
  }

  const port = (process.env.PORT || "3001").trim() || "3001";
  const baseUrl = `http://127.0.0.1:${port}`;
  const health = await probeHealth(baseUrl);
  print("health", `url=${baseUrl}/api/healthz ok=${health.ok} status=${health.status ?? "(none)"}${health.error ? ` error=${health.error}` : ""}`);

  print("next-steps", [
    "- If auth-mode=dev-bypass is unexpected, set CLERK_SECRET_KEY in .env.local.",
    "- If auth-mode=clerk is unexpected, unset CLERK_SECRET_KEY or set CLERK_ENABLED=false.",
    "- If /api/healthz is unreachable, run: pnpm run dev (or ensure API on PORT).",
    "- To activate a pending dev user: pnpm exec tsx scripts/dev-user-status.ts --email=you@example.com --activate",
  ].join("\n"));

  if (hadFatal) process.exit(1);
}

main().catch((err) => {
  console.error("[auth-preflight] failed:", err);
  process.exit(1);
});
