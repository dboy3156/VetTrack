import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/upload-url", requireAuth, async (req, res) => {
  const { name, size, contentType } = req.body;
  if (!name || !size || !contentType) {
    return res.status(400).json({ error: "name, size, contentType required" });
  }

  if (!process.env.REPLIT_OBJECT_STORAGE_BUCKET) {
    return res.status(501).json({
      error: "Object storage not configured. Images are not available in dev mode.",
    });
  }

  res.status(501).json({ error: "Object storage not configured" });
});

export default router;
