import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

/*
 * PERMISSIONS MATRIX — /api/storage
 * ─────────────────────────────────────────────────────
 * POST /upload-url   technician+   Request a pre-signed upload URL
 * ─────────────────────────────────────────────────────
 */

const router = Router();

const uploadUrlSchema = z.object({
  name: z.string().min(1, "name is required").max(500),
  size: z.number().positive("size must be a positive number"),
  contentType: z.string().min(1, "contentType is required").max(100),
});

router.post("/upload-url", requireAuth, requireRole("technician"), validateBody(uploadUrlSchema), async (req, res) => {
  if (!process.env.REPLIT_OBJECT_STORAGE_BUCKET) {
    return res.status(501).json({
      error: "Image uploads are not available in this environment. To enable uploads, configure the REPLIT_OBJECT_STORAGE_BUCKET environment variable and implement the signed URL generation in server/routes/storage.ts.",
      hint: "In development, images can be hosted externally and referenced by URL instead.",
    });
  }

  res.status(501).json({
    error: "Object storage is configured but signed URL generation is not yet implemented.",
    hint: "Implement the upload URL generation in server/routes/storage.ts using your storage provider's SDK.",
  });
});

export default router;
