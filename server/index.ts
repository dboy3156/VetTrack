import { validateEnv } from "./lib/envValidation.js";
validateEnv();

import * as Sentry from "@sentry/node";

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || "development",
    tracesSampleRate: 1.0,
    integrations: [Sentry.expressIntegration()],
  });
}

import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import net from "net";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import xss from "xss";
import { initDb, pool } from "./db.js";
import { runMigrations } from "./migrate.js";
import { createRequire } from "module";
import { clerkMiddleware } from "@clerk/express";

const _require = createRequire(import.meta.url);
const { version: APP_VERSION } = _require("../package.json") as { version: string };
import equipmentRoutes from "./routes/equipment.js";
import folderRoutes from "./routes/folders.js";
import analyticsRoutes from "./routes/analytics.js";
import activityRoutes from "./routes/activity.js";
import userRoutes from "./routes/users.js";
import whatsappRoutes from "./routes/whatsapp.js";
import storageRoutes from "./routes/storage.js";
import alertAcksRoutes from "./routes/alert-acks.js";
import demoSeedRoutes from "./routes/demo-seed.js";
import pushRoutes from "./routes/push.js";
import metricsRoutes from "./routes/metrics.js";
import supportRoutes from "./routes/support.js";
import auditLogsRoutes from "./routes/audit-logs.js";
import stabilityRoutes from "./routes/stability.js";
import { STABILITY_TOKEN } from "./lib/stability-token.js";
import { initVapid } from "./lib/push.js";
import { cleanExpiredUndoTokens } from "./routes/equipment.js";
import { startAlertReminderScheduler } from "./lib/alert-reminder.js";
import healthRoutes from "./routes/health.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

// --- CORS: lock to known origins only, fail closed in production ---
const isDev = process.env.NODE_ENV !== "production";

function buildAllowedOrigins(): string[] {
  const origins: string[] = [];
  // Dev: whitelist REPLIT_DEV_DOMAIN and localhost
  if (isDev) {
    origins.push("http://localhost:5000", "http://localhost:3000");
    if (process.env.REPLIT_DEV_DOMAIN) {
      origins.push(`https://${process.env.REPLIT_DEV_DOMAIN}`);
    }
  }
  // Any env: explicit ALLOWED_ORIGIN override
  if (process.env.ALLOWED_ORIGIN) {
    origins.push(process.env.ALLOWED_ORIGIN);
  }
  return origins;
}

const allowedOrigins = buildAllowedOrigins();

app.use(cors({
  origin: (origin, callback) => {
    // Requests with no origin (curl, same-origin server-side, mobile) — always allow
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    // In production with no whitelist configured, fail closed
    callback(new Error(`CORS: origin "${origin}" not in allowedOrigins`));
  },
  credentials: true,
}));

// --- Rate Limiters ---

// Global: 100 req/min per IP (applied to all /api/* routes)
const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});
app.use("/api", globalLimiter);

// Auth/sensitive paths limiter is exported from middleware/rate-limiters.ts
// and applied directly in push.ts and users.ts routes

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'", "https:"],
        fontSrc: ["'self'", "data:", "https:"],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: [],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  })
);

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/api/health", healthRoutes);

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok", version: APP_VERSION });
});

app.get("/api/version", (_req, res) => {
  res.json({ version: APP_VERSION });
});

if (process.env.CLERK_SECRET_KEY) {
  // Bypass Clerk for internal stability test runner requests
  app.use((req, _res, next) => {
    if (req.headers["x-stability-token"] === STABILITY_TOKEN) return next();
    clerkMiddleware({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY || process.env.CLERK_PUBLISHABLE_KEY,
    })(req, _res, next);
  });
}

function sanitizeStrings(obj: unknown): void {
  if (obj === null || typeof obj !== "object") return;
  const record = obj as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    const val = record[key];
    if (typeof val === "string") {
      record[key] = xss(val, { whiteList: {}, stripIgnoreTag: true, stripIgnoreTagBody: ["script"] });
    } else if (typeof val === "object" && val !== null) {
      sanitizeStrings(val);
    }
  }
}

app.use((req, _res, next) => {
  if (req.body && typeof req.body === "object") {
    sanitizeStrings(req.body);
  }
  next();
});

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "vt_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || (isDev ? "dev-only-insecure-placeholder-set-SESSION_SECRET-in-env" : (() => { throw new Error("SESSION_SECRET must be set"); })()),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/CHANGELOG.md", (_req, res) => {
  const changelogPath = path.join(__dirname, "../CHANGELOG.md");
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.sendFile(changelogPath);
});

app.use("/api/equipment", equipmentRoutes);
app.use("/api/folders", folderRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/users", userRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/alert-acks", alertAcksRoutes);
app.use("/api/demo-seed", demoSeedRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/audit-logs", auditLogsRoutes);
app.use("/api/stability", stabilityRoutes);

Sentry.setupExpressErrorHandler(app);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "An unexpected error occurred. Please try again." });
});

if (process.env.NODE_ENV === "production") {
  const publicDir = path.join(__dirname, "../public");
  app.use(express.static(publicDir));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });
}

function tryFreePort(port: number): void {
  try {
    execSync(`fuser -k ${port}/tcp 2>/dev/null || true`);
  } catch {
    // fuser may not exist on all platforms; ignore errors
  }
}

function findAvailablePort(preferred: number, maxAttempts = 10): Promise<number> {
  return new Promise((resolve, reject) => {
    let attempt = 0;
    function probe(port: number) {
      const tester = net.createServer();
      tester.once("error", (err: NodeJS.ErrnoException) => {
        if (err.code === "EADDRINUSE") {
          attempt++;
          if (attempt >= maxAttempts) {
            reject(new Error(`Could not find a free port after ${maxAttempts} attempts starting from ${preferred}`));
          } else {
            probe(port + 1);
          }
        } else {
          reject(err);
        }
      });
      tester.once("listening", () => {
        tester.close(() => resolve(port));
      });
      tester.listen(port, "0.0.0.0");
    }
    probe(preferred);
  });
}

async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS vt_sessions (
      sid VARCHAR NOT NULL COLLATE "default" PRIMARY KEY,
      sess JSON NOT NULL,
      expire TIMESTAMP(6) NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS IDX_session_expire ON vt_sessions (expire)
  `);
  console.log("✅ Session table ready");
}

async function main() {
  await runMigrations();
  await initDb();
  await ensureSessionTable();
  await initVapid();
  startAlertReminderScheduler();

  // Run cleanup at half the undo TTL (90s) so expired tokens are removed promptly
  setInterval(() => {
    cleanExpiredUndoTokens().catch(() => {});
  }, 45_000);

  if (isDev) {
    // Best-effort: try to free the preferred port before starting.
    tryFreePort(PORT);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  // Find an available port, starting from the preferred one.
  const boundPort = await findAvailablePort(PORT);
  if (boundPort !== PORT) {
    console.warn(
      `⚠️  Port ${PORT} was still in use — API server bound to port ${boundPort} instead.` +
      (isDev ? " Update your Vite proxy if needed." : "")
    );
  }

  app.listen(boundPort, "0.0.0.0", () => {
    console.log(`🚀 VetTrack API running on port ${boundPort}`);
    if (!process.env.CLERK_SECRET_KEY) {
      console.log("⚠️  Running in DEV mode — Clerk auth disabled");
    }
  });
}

main().catch(console.error);
