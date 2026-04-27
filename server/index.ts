process.on("uncaughtException", (e) => console.error("💥 FATAL ERROR:", e));
process.on("unhandledRejection", (r) =>
  console.error("💥 UNHANDLED PROMISE:", r),
);

// MUST be first — populates process.env from .env.local + .env before any
// other module is evaluated (e.g. ./lib/envValidation, ./db which read
// DATABASE_URL / SMTP_* at import time).
import "./lib/env-bootstrap.js";

import { validateEnv } from "./lib/envValidation.js";
validateEnv();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import xss from "xss";
import { clerkMiddleware } from "@clerk/express";
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { runMigrations } from "./migrate.js";
import { globalApiLimiter } from "./middleware/rate-limiters.js";
import { i18nMiddleware } from "../lib/i18n/middleware.js";
import { tenantContext } from "./middleware/tenant-context.js";
import { registerApiRoutes } from "./app/routes.js";
import clerkWebhookRoutes from "./routes/webhooks.js";
import { startBackgroundSchedulers } from "./app/start-schedulers.js";
import { ensureClinicPhase2Defaults } from "./lib/ensure-clinic-phase2-defaults.js";
import { recoverPendingInventoryJobs } from "./lib/inventory-job-recovery.js";
import { releaseStaleMedicationTasks } from "./services/medication-tasks.service.js";
import healthRoutes from "./routes/health.js";
import { resolveAuthModeFromEnv, describeAuthMode } from "./lib/auth-mode.js";

const { version: appVersion } = JSON.parse(readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf-8")) as { version?: string };
const isProduction = process.env.NODE_ENV === "production";

const app = express();
// Deployment runs behind a reverse proxy that sets X-Forwarded-For.
// Trust first proxy so rate limiting derives client IPs correctly.
app.set("trust proxy", 1);

// Health checks must bypass all middleware (CORS, Clerk, CSP, body parsing, etc.).
function sendHealthOk(_req: express.Request, res: express.Response) {
  res.status(200).send("ok");
}
app.use("/api/health", healthRoutes);
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

// Clerk webhook MUST be mounted before express.json() so the raw body is
// available for svix signature verification.
app.use("/api/webhooks/clerk", clerkWebhookRoutes);

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

// Always mount official Clerk middleware at app level when Clerk auth is enabled.
// In dev bypass mode (no secret), requireAuth falls back to local dev identity.
const authModeResolution = resolveAuthModeFromEnv();

// Secret-free startup banner so operators and agents can confirm the server
// auth mode without reading env files. Logged once at boot (non-production).
if (!isProduction) {
  console.log(`[auth-mode] server ${describeAuthMode(authModeResolution)}`);
}

if (authModeResolution.mode === "clerk") {
  if (!process.env.CLERK_PUBLISHABLE_KEY?.trim() && process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim()) {
    process.env.CLERK_PUBLISHABLE_KEY = process.env.VITE_CLERK_PUBLISHABLE_KEY;
  }
  app.use(clerkMiddleware());
}

// Global API limiter runs before route-specific limiters.
app.use("/api", globalApiLimiter);
app.use("/api", i18nMiddleware);
app.use("/api", tenantContext);

registerApiRoutes(app);

if (process.env.NODE_ENV === "production") {
  // Vite content-hashed assets: safe to cache indefinitely (new content = new URL).
  app.use(
    "/assets",
    express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist/public/assets"), {
      maxAge: "1y",
      immutable: true,
    })
  );
  // Service worker: MUST never be cached by browsers or CDNs. If an edge
  // (Cloudflare / Fastly) or browser HTTP cache pins an old /sw.js, clients
  // get stuck re-installing the stale worker on every load. The dedicated
  // route below wins over the static middleware and the SPA catch-all, and
  // handles both `/sw.js` and `/sw.js?v=<version>` cache-busted URLs.
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Surrogate-Control", "no-store");
    res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
    res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist/public/sw.js"));
  });
  // Manifest: iOS Safari requires application/manifest+json (not application/json).
  // Without the correct MIME type iOS does not recognise the file as a web-app
  // manifest and "Add to Home Screen" falls back to a plain bookmark.
  app.get("/manifest.json", (_req, res) => {
    res.setHeader("Content-Type", "application/manifest+json; charset=UTF-8");
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist/public/manifest.json"));
  });
  // Everything else (icons, etc.): short cache.
  app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist/public"), { maxAge: 0 }));
  // SPA shell: never cache — browsers must always get the latest index.html
  // so they pick up new content-hashed asset filenames after a deployment.
  app.get("*", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../dist/public/index.html"));
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
      const releasedStaleTasks = await releaseStaleMedicationTasks();
      console.log(`[startup] Released ${releasedStaleTasks} stale medication task(s)`);
    } catch (err) {
      console.error("[startup] releaseStaleMedicationTasks failed:", err);
    }

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

    setInterval(() => {
      releaseStaleMedicationTasks()
        .then((n) => {
          if (n > 0) console.log(`[medication-task-recovery] released ${n} stale task(s)`);
        })
        .catch((err) => console.error("[medication-task-recovery] interval failed:", err));
    }, 5 * 60 * 1000);
  })
  .catch((err) => {
    console.error("💥 Migration failed, aborting scheduler start", err);
  });
