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
import { runMigrations } from "./migrate.js";
import { globalApiLimiter } from "./middleware/rate-limiters.js";
import { i18nMiddleware } from "../lib/i18n/middleware.js";
import { tenantContext } from "./middleware/tenant-context.js";
import { registerApiRoutes } from "./app/routes.js";
import { startBackgroundSchedulers } from "./app/start-schedulers.js";
import { ensureClinicPhase2Defaults } from "./lib/ensure-clinic-phase2-defaults.js";
import { recoverPendingInventoryJobs } from "./lib/inventory-job-recovery.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { version: appVersion } = JSON.parse(readFileSync(path.join(__dirname, "../package.json"), "utf-8")) as { version?: string };
const isProduction = process.env.NODE_ENV === "production";

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
          "https://clerk.vettrack.uk",
          "https://*.clerk.accounts.dev",
          "https://static.cloudflareinsights.com",
          ...(isProduction ? [] : ["'unsafe-eval'"]),
        ],
        scriptSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "https://clerk.vettrack.uk",
          "https://static.cloudflareinsights.com",
          ...(isProduction ? [] : ["'unsafe-eval'"]),
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
          "https://fonts.googleapis.com",
          "https://clerk.vettrack.uk",
          ...(isProduction ? [] : ["'unsafe-eval'"]),
        ],
        styleSrcElem: [
          "'self'",
          "'unsafe-inline'",
          "https://fonts.googleapis.com",
          "https://clerk.vettrack.uk",
          ...(isProduction ? [] : ["'unsafe-eval'"]),
        ],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        frameSrc: ["'self'", "https://clerk.vettrack.uk"],
        workerSrc: ["'self'", "blob:", "https://clerk.vettrack.uk"],
        scriptSrcAttr: isProduction ? ["'unsafe-inline'"] : ["'unsafe-inline'", "'unsafe-eval'"],
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

registerApiRoutes(app);

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
  .then(async () => {
    try {
      await ensureClinicPhase2Defaults();
      console.log("✅ Clinic billing / inventory defaults ensured");
    } catch (err) {
      console.error("Clinic Phase 2 defaults failed (non-fatal)", err);
    }
    startBackgroundSchedulers().catch((err) => {
      console.error("Failed to initialize push notifications", err);
    });
    console.log("✅ Background schedulers started");

    const runInventoryRecovery = () => {
      void recoverPendingInventoryJobs().then((result) => {
        console.warn("[inventory-job-recovery] completed", result);
      }).catch((error) => {
        console.error("[inventory-job-recovery] failed", error);
      });
    };

    runInventoryRecovery();
    setInterval(runInventoryRecovery, 10 * 60 * 1000);
  })
  .catch((err) => {
    console.error("💥 Migration failed, aborting scheduler start", err);
  });
