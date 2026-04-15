process.on("uncaughtException", (e) => console.error("💥 FATAL ERROR:", e));
process.on("unhandledRejection", (r) =>
  console.error("💥 UNHANDLED PROMISE:", r),
);

import "dotenv/config";

import { validateEnv } from "./lib/envValidation.js";
validateEnv();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import xss from "xss";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import equipmentRoutes from "./routes/equipment.js";
import analyticsRoutes from "./routes/analytics.js";
import activityRoutes from "./routes/activity.js";
import userRoutes from "./routes/users.js";
import stabilityRoutes from "./routes/stability.js";
import metricsRoutes from "./routes/metrics.js";
import foldersRoutes from "./routes/folders.js";
import alertAcksRoutes from "./routes/alert-acks.js";
import roomsRoutes from "./routes/rooms.js";
import supportRoutes from "./routes/support.js";
import pushRoutes from "./routes/push.js";
import whatsappRoutes from "./routes/whatsapp.js";
import auditLogsRoutes from "./routes/audit-logs.js";
import storageRoutes from "./routes/storage.js";
import shiftsRoutes from "./routes/shifts.js";
import testRoutes from "./routes/test.js";
import demoSeedRoutes from "./routes/demo-seed.js";
import healthRoutes from "./routes/health.js";
import { runMigrations } from "./migrate.js";
import { initVapid, startPushCleanupScheduler } from "./lib/push.js";
import { startCleanupScheduler } from "./lib/cleanup-scheduler.js";
import {
  startScheduledNotificationProcessor,
  startSmartRoleNotificationScheduler,
} from "./lib/role-notification-scheduler.js";
import { globalApiLimiter } from "./middleware/rate-limiters.js";
import { i18nMiddleware } from "../lib/i18n/middleware.js";
import { tenantContext } from "./middleware/tenant-context.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version: appVersion } = JSON.parse(readFileSync(path.join(__dirname, "../package.json"), "utf-8")) as { version?: string };

const app = express();
// Deployment runs behind a reverse proxy that sets X-Forwarded-For.
// Trust first proxy so rate limiting derives client IPs correctly.
app.set("trust proxy", 1);

// Health checks must bypass all middleware (CORS, Clerk, CSP, body parsing, etc.).
function sendHealthOk(_req: express.Request, res: express.Response) {
  res.status(200).send("ok");
}
app.get("/api/health", sendHealthOk);
app.get("/api/healthz", sendHealthOk);
app.get("/api/version", (_req, res) => {
  res.status(200).json({ version: appVersion ?? "0.0.0" });
});

function hasInvalidHeaderChars(value: string): boolean {
  return /[\r\n\0]/.test(value);
}

function hasNonAsciiHeaderChars(value: string): boolean {
  return /[^\x20-\x7E]/.test(value);
}

function normalizeOrigin(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim().replace(/^['"]|['"]$/g, "");
  if (!trimmed || hasInvalidHeaderChars(trimmed) || hasNonAsciiHeaderChars(trimmed)) return null;
  try {
    const normalized = new URL(trimmed).origin;
    if (hasInvalidHeaderChars(normalized) || hasNonAsciiHeaderChars(normalized)) return null;
    return normalized;
  } catch {
    return null;
  }
}

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://clerk.vettrack.uk",
          "https://*.clerk.accounts.dev",
          "https://static.cloudflareinsights.com",
        ],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://clerk.vettrack.uk",
          "https://static.cloudflareinsights.com",
        ],
        connectSrc: [
          "'self'",
          "https://clerk.vettrack.uk",
          "https://api.clerk.dev",
          "https://clerk.dev",
        ],
        imgSrc: ["'self'", "data:", "https:"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://fonts.googleapis.com",
          "https://clerk.vettrack.uk",
        ],
        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          "https://fonts.googleapis.com",
          "https://clerk.vettrack.uk",
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        frameSrc: ["'self'", "https://clerk.vettrack.uk"],
        workerSrc: ["'self'", "blob:", "https://clerk.vettrack.uk"],
        scriptSrcAttr: ["'unsafe-inline'", "'unsafe-eval'"],
      },
    },
  }),
);
app.use(
  cors({
    origin: (origin, callback) => {
      try {
        const requestOrigin = normalizeOrigin(origin);
        if (!requestOrigin) {
          callback(null, false);
          return;
        }

        const allowedOrigin = normalizeOrigin(process.env.ALLOWED_ORIGIN);
        if (!allowedOrigin) {
          callback(null, false);
          return;
        }

        const allowedWithWww = allowedOrigin.replace("://", "://www.");
        const isAllowed =
          requestOrigin === allowedOrigin || requestOrigin === allowedWithWww;
        if (!isAllowed) {
          callback(null, false);
          return;
        }
        callback(null, requestOrigin === allowedWithWww ? allowedWithWww : allowedOrigin);
      } catch (error) {
        console.warn("CORS origin validation failed, denying request origin", error);
        callback(null, false);
      }
    },
    credentials: true,
  }),
);
app.use(compression());
app.use(express.json());

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return xss(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item));
  }
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const sanitized: Record<string, unknown> = {};
    for (const [key, nestedValue] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(nestedValue);
    }
    return sanitized;
  }
  return value;
}

// Global request body sanitization (keeps route-level Zod validation intact).
app.use((req, _res, next) => {
  req.body = sanitizeValue(req.body) as Record<string, unknown>;
  next();
});

// SAFE CLERK LOAD
app.use(async (req, res, next) => {
  if (process.env.CLERK_SECRET_KEY && process.env.CLERK_ENABLED !== "false") {
    try {
      const { clerkMiddleware } = await import("@clerk/express");
      return clerkMiddleware()(req, res, next);
    } catch (e) {
      console.warn(
        "Clerk initialization failed, skipping auth for this request",
        e,
      );
      return next();
    }
  }
  return next();
});

// Global API limiter runs before route-specific limiters.
app.use("/api", globalApiLimiter);
app.use("/api", i18nMiddleware);
app.use("/api", tenantContext);

app.use("/api/users", userRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/folders", foldersRoutes);
app.use("/api/stability", stabilityRoutes);
app.use("/api/alert-acks", alertAcksRoutes);
app.use("/api/rooms", roomsRoutes);
app.use("/api/support", supportRoutes);
app.use("/api/push", pushRoutes);
app.use("/api/whatsapp", whatsappRoutes);
app.use("/api/audit-logs", auditLogsRoutes);
app.use("/api/storage", storageRoutes);
app.use("/api/shifts", shiftsRoutes);
app.use("/api/test", testRoutes);
app.use("/api/demo-seed", demoSeedRoutes);
app.use("/api/health/ready", healthRoutes);
app.use("/health", healthRoutes);

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist/public")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "../dist/public/index.html"));
  });
}

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled application error", err);
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal Server Error" });
});

function resolvePort(value: string | undefined): number {
  if (!value || value.trim() === "") return 3000;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) return 3000;
  return parsed;
}

const PORT = resolvePort(process.env.PORT);
app.listen(PORT, "0.0.0.0", () => {
  if (process.env.NODE_ENV !== "production") {
    console.log("ENV PORT =", process.env.PORT);
  }
  console.log(`Server listening on ${PORT}`);
});

runMigrations()
  .then(() => {
    initVapid().then(() => {
      startPushCleanupScheduler();
    }).catch((err) => {
      console.error("Failed to initialize push notifications", err);
    });
    startCleanupScheduler();
    startScheduledNotificationProcessor();
    startSmartRoleNotificationScheduler();
    console.log("✅ Background schedulers started");
  })
  .catch((err) => {
    console.error("💥 Migration failed, aborting scheduler start", err);
  });
