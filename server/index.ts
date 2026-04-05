import express from "express";
import cors from "cors";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";
import { initDb } from "./db.js";
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

app.use(
  session({
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

async function main() {
  await initDb();
  await initVapid();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 VetTrack API running on port ${PORT}`);
    if (!process.env.CLERK_SECRET_KEY) {
      console.log("⚠️  Running in DEV mode — Clerk auth disabled");
    }
  });
}

main().catch(console.error);
