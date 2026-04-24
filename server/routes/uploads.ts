import { randomUUID } from "crypto";
import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Images only"));
    }
    cb(null, true);
  },
});

const s3 = new S3Client({
  region: process.env.S3_REGION,
  endpoint: process.env.S3_ENDPOINT,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});

router.post(
  "/fault-image",
  requireAuth,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
      }

      // Safe filename — no path traversal, no user-controlled strings
      const ext = (req.file.originalname.split(".").pop() ?? "jpg")
        .replace(/[^a-z0-9]/gi, "")
        .toLowerCase()
        .slice(0, 10);
      const fileName = `faults/${Date.now()}-${randomUUID()}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET,
          Key: fileName,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      // S3_PUBLIC_URL should be set in env, e.g. https://your-bucket.s3.amazonaws.com
      // or https://your-endpoint/your-bucket for S3-compatible providers
      const imageUrl = `${process.env.S3_PUBLIC_URL}/${fileName}`;

      res.json({ success: true, url: imageUrl });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "Images only"
      ) {
        return res.status(400).json({ error: "Only image files are allowed" });
      }
      console.error("[storage/fault-image]", error);
      res.status(500).json({ error: "Upload failed" });
    }
  }
);

export default router;
