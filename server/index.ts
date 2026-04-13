process.on("uncaughtException", (e) => console.error("💥 FATAL ERROR:", e));
process.on("unhandledRejection", (r) =>
  console.error("💥 UNHANDLED PROMISE:", r),
);

import { validateEnv } from "./lib/envValidation.js";
validateEnv();

import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import path from "path";
import { fileURLToPath } from "url";
import equipmentRoutes from "./routes/equipment.js";
import analyticsRoutes from "./routes/analytics.js";
import activityRoutes from "./routes/activity.js";
import userRoutes from "./routes/users.js";
import stabilityRoutes from "./routes/stability.js";
import metricsRoutes from "./routes/metrics.js";
import foldersRoutes from "./routes/folders.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

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

// HEAL CHECK BYPASS: Force return 200 before any middleware
function sendHealthOk(_req: express.Request, res: express.Response) {
  res.status(200).send("ok");
}
app.get("/api/health", sendHealthOk);
app.get("/api/healthz", sendHealthOk);

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

app.use("/api/users", userRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/activity", activityRoutes);
app.use("/api/metrics", metricsRoutes);
app.use("/api/folders", foldersRoutes);
app.use("/api/stability", stabilityRoutes);

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

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log("ENV PORT =", process.env.PORT);
  console.log(`Server listening on ${PORT}`);
});
