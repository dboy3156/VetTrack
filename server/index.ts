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

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://clerk.vettrack.uk", "https://static.cloudflareinsights.com"],
      scriptSrcElem: ["'self'", "'unsafe-inline'", "https://clerk.vettrack.uk", "https://static.cloudflareinsights.com"],
      connectSrc: ["'self'", "https://clerk.vettrack.uk", "https://api.clerk.dev", "https://clerk.dev"],
      imgSrc: ["'self'", "data:", "https:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      styleSrcElem: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      frameSrc: ["'self'", "https://clerk.vettrack.uk"],
      workerSrc: ["'self'", "blob:"],
    },
  },
}));
app.use(cors({
  origin: (req, callback) => {
    const origin = req.headers.origin ?? '';
    const allowed = (process.env.ALLOWED_ORIGIN ?? '').trim();
    callback(null, ok ? origin : false);
  },
  credentials: true,
}));
app.use(compression());
app.use(express.json());

// HEAL CHECK BYPASS: Force return 200 before any middleware
app.get("/api/health", (_req, res) => {
  res.status(200).send("ok");
  return;
});

// SAFE CLERK LOAD
app.use(async (req, res, next) => {
  if (process.env.CLERK_SECRET_KEY && process.env.CLERK_ENABLED !== "false") {
    try {
      const { clerkMiddleware } = await import("@clerk/express");
      return clerkMiddleware()(req, res, next);
    } catch (e) {
      return next();
    }
  }
  next();
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
