import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import path from "path";
import net from "net";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import { initDb, pool } from "./db.js";
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
import { initVapid } from "./lib/push.js";
import { cleanExpiredUndoTokens } from "./routes/equipment.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({
  origin: true,
  credentials: true,
}));

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
  console.error("FATAL: SESSION_SECRET environment variable is not set in production mode.");
  process.exit(1);
}

const PgSession = connectPgSimple(session);

app.use(
  session({
    store: new PgSession({
      pool,
      tableName: "vt_sessions",
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || "vettrack-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    },
  })
);

app.get("/api/healthz", (_req, res) => {
  res.json({ status: "ok", version: "1.0.0" });
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

async function main() {
  await initDb();
  await initVapid();

  setInterval(() => {
    cleanExpiredUndoTokens().catch(() => {});
  }, 60_000);

  const isDev = process.env.NODE_ENV !== "production";

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
