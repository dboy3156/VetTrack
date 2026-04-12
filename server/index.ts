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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

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
      const o = origin ?? "";
      const allowed = (process.env.ALLOWED_ORIGIN ?? "").trim();
      const ok =
        allowed.length === 0 ||
        o === allowed ||
        o === allowed.replace("https://", "https://www.");
      callback(null, ok ? o : false);
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

if (process.env.NODE_ENV === "production") {
  app.use(express.static(path.join(__dirname, "../dist/public")));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(__dirname, "../dist/public/index.html"));
  });
}

const PORT = Number(process.env.PORT) || 8080;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Hospital System Online on port ${PORT}`);
});
