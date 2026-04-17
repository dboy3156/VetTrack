import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { subscribe, unsubscribe } from "../lib/realtime.js";

const router = Router();

router.get("/", requireAuth, (req, res) => {
  try {
    const clinicId = req.clinicId?.trim();
    if (!clinicId) {
      res.status(400).json({ error: "MISSING_CLINIC_ID", message: "clinicId is required" });
      return;
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    subscribe(clinicId, res);

    req.on("close", () => {
      unsubscribe(res);
      try {
        res.end();
      } catch {
        // Ignore close errors.
      }
    });
  } catch (err) {
    console.error("[realtime-route] failed to subscribe", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to subscribe to realtime stream" });
    }
  }
});

export default router;
