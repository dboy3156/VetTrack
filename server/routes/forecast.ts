import { randomUUID } from "crypto";
import { Router, type Request } from "express";
import multer from "multer";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import nodemailer from "nodemailer";

import { db, clinics, pharmacyForecastParses, pharmacyOrders, pharmacyForecastExclusions } from "../db.js";
import { requireAuth, requireEffectiveRole, requireAdmin } from "../middleware/auth.js";
import { ensureUserClinicMembership } from "../middleware/ensure-user-clinic-membership.js";
import { logAudit, resolveAuditActorRole } from "../lib/audit.js";
import { buildPharmacyOrderEmail } from "../lib/forecast/emailBuilder.js";
import { validateMergedForecastForApproval } from "../lib/forecast/approveGuard.js";
import {
  approvePayloadSchema,
  forecastParseRequestSchema,
  forecastResultSchema,
} from "../lib/forecast/forecastZod.js";
import { applyManualQuantities } from "../lib/forecast/mergeApproval.js";
import { buildForecastMailtoUrl } from "../lib/forecast/mailtoSafe.js";
import { runForecastPipeline } from "../lib/forecast/pipeline.js";

/** Parse row was already consumed or concurrent approve won the race. */
class ForecastParseSessionGoneError extends Error {
  constructor() {
    super("PARSE_SESSION_INVALID");
    this.name = "ForecastParseSessionGoneError";
  }
}

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});

function resolveRequestId(res: { getHeader: (n: string) => unknown; setHeader?: (n: string, v: string) => void }, incoming: unknown): string {
  const incomingStr = typeof incoming === "string" ? incoming.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incomingStr || fromRes || randomUUID();
  if (typeof res.setHeader === "function") res.setHeader("x-request-id", requestId);
  return requestId;
}

function apiError(params: { code: string; reason: string; message: string; requestId: string }) {
  return {
    code: params.code,
    error: params.code,
    reason: params.reason,
    message: params.message,
    requestId: params.requestId,
  };
}

function defaultWindowHoursFromCalendar(): 24 | 72 {
  const dow = new Date().getDay();
  return dow === 4 ? 72 : 24;
}

function multipartOrJsonBody(req: Request): Record<string, unknown> {
  const b = req.body;
  if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  return {};
}

router.post(
  "/parse",
  requireAuth,
  ensureUserClinicMembership,
  requireEffectiveRole("technician"),
  (req, res, next) => {
    const ct = String(req.headers["content-type"] ?? "");
    if (ct.includes("multipart/form-data")) return upload.single("file")(req, res, next);
    next();
  },
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    const clinicId = req.clinicId!;
    const authUser = req.authUser!;
    try {
      let rawText = "";
      const rawBody = multipartOrJsonBody(req);
      const parsed = forecastParseRequestSchema.safeParse(rawBody);

      if (!parsed.success) {
        return res.status(400).json(apiError({
          code: "VALIDATION_FAILED",
          reason: "INVALID_PARSE_BODY",
          message: "Invalid JSON or form fields",
          requestId,
        }));
      }

      const file = "file" in req && req.file ? req.file : undefined;
      if (file?.buffer?.length) {
        try {
          const { PDFParse } = await import("pdf-parse");
          const parser = new PDFParse({ data: new Uint8Array(file.buffer as Buffer) });
          const textResult = await parser.getText();
          rawText = textResult.text ?? "";
          await parser.destroy();
        } catch {
          return res.status(400).json(apiError({
            code: "PDF_PARSE_FAILED",
            reason: "PDF_INVALID",
            message: "Could not extract text from PDF",
            requestId,
          }));
        }
      } else if (typeof parsed.data.text === "string" && parsed.data.text.trim().length > 0) {
        rawText = parsed.data.text;
      }

      if (!rawText.trim()) {
        return res.status(400).json(apiError({
          code: "VALIDATION_FAILED",
          reason: "EMPTY_INPUT",
          message: "Provide PDF file or non-empty text",
          requestId,
        }));
      }

      const windowHours = parsed.data.windowHours ?? defaultWindowHoursFromCalendar();
      const weekendMode =
        parsed.data.weekendMode ?? (windowHours === 72 && defaultWindowHoursFromCalendar() === 72);

      const result = await runForecastPipeline({
        rawText,
        clinicId,
        windowHours,
        weekendMode,
      });

      const parseId = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.insert(pharmacyForecastParses).values({
        id: parseId,
        clinicId,
        createdBy: authUser.id,
        expiresAt,
        result: result as unknown as Record<string, unknown>,
      });

      return res.json({ parseId, ...result });
    } catch (err) {
      console.error("[forecast/parse]", err);
      return res.status(500).json(apiError({
        code: "INTERNAL_ERROR",
        reason: "FORECAST_PARSE_FAILED",
        message: "Forecast parse failed",
        requestId,
      }));
    }
  },
);

router.post("/approve", requireAuth, ensureUserClinicMembership, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  const authUser = req.authUser!;
  const parsed = approvePayloadSchema.safeParse(req.body);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => i.message).join("; ") || "Invalid approve payload";
    return res.status(400).json(apiError({
      code: "VALIDATION_FAILED",
      reason: "INVALID_APPROVE_BODY",
      message: detail,
      requestId,
    }));
  }

  try {
    const [parseRow] = await db
      .select()
      .from(pharmacyForecastParses)
      .where(
        and(
          eq(pharmacyForecastParses.id, parsed.data.parseId),
          eq(pharmacyForecastParses.clinicId, clinicId),
          eq(pharmacyForecastParses.createdBy, authUser.id),
          gt(pharmacyForecastParses.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!parseRow) {
      return res.status(400).json(apiError({
        code: "PARSE_SESSION_INVALID",
        reason: "PARSE_SESSION_INVALID",
        message: "Parse session is missing, expired, or invalid. Run Parse again before approving.",
        requestId,
      }));
    }

    const storedParsed = forecastResultSchema.safeParse(parseRow.result);
    if (!storedParsed.success) {
      console.error("[forecast/approve] stored parse corrupt", storedParsed.error);
      return res.status(500).json(apiError({
        code: "INTERNAL_ERROR",
        reason: "PARSE_STORAGE_CORRUPT",
        message: "Stored forecast could not be loaded",
        requestId,
      }));
    }

    const mergedResult = applyManualQuantities(storedParsed.data, parsed.data.manualQuantities);

    const gate = validateMergedForecastForApproval(mergedResult);
    if (!gate.ok) {
      return res.status(400).json(apiError({
        code: "VALIDATION_FAILED",
        reason: gate.code,
        message: gate.message,
        requestId,
      }));
    }

    const [clinicRow] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
    const pharmacyEmail = clinicRow?.pharmacyEmail?.trim() ?? "";

    const smtpHost = process.env.SMTP_HOST?.trim();
    const smtpUser = process.env.SMTP_USER?.trim();
    const smtpPass = process.env.SMTP_PASS?.trim();

    const hasSmtp = Boolean(smtpHost && smtpUser && smtpPass);

    if (!pharmacyEmail) {
      return res.status(400).json(apiError({
        code: "MISSING_PHARMACY_EMAIL",
        reason: "CLINIC_PHARMACY_EMAIL_REQUIRED",
        message: "Clinic pharmacy email is required for pharmacy orders (configure in admin settings)",
        requestId,
      }));
    }

    const orderId = `ord-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${randomUUID().slice(0, 8)}`;

    const { subject, html, text } = buildPharmacyOrderEmail({
      result: mergedResult,
      technicianName: authUser.name || authUser.email,
      auditOrOrderHint: orderId,
    });

    let deliveryMethod: "smtp" | "mailto" = hasSmtp ? "smtp" : "mailto";

    await db.transaction(async (tx) => {
      const removed = await tx
        .delete(pharmacyForecastParses)
        .where(
          and(
            eq(pharmacyForecastParses.id, parsed.data.parseId),
            eq(pharmacyForecastParses.clinicId, clinicId),
            eq(pharmacyForecastParses.createdBy, authUser.id),
            gt(pharmacyForecastParses.expiresAt, new Date()),
          ),
        )
        .returning({ id: pharmacyForecastParses.id });

      if (removed.length === 0) {
        throw new ForecastParseSessionGoneError();
      }

      await tx.insert(pharmacyOrders).values({
        id: orderId,
        clinicId,
        approvedBy: authUser.id,
        windowHours: mergedResult.windowHours,
        delivery: deliveryMethod,
        payload: {
          result: mergedResult,
          manualQuantities: parsed.data.manualQuantities,
        } as unknown as Record<string, unknown>,
      });
    });

    let mailtoUrl: string | undefined;
    let mailtoBodyTruncated = false;

    if (hasSmtp) {
      try {
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: parseInt(process.env.SMTP_PORT ?? "587", 10),
          secure: process.env.SMTP_SECURE === "true",
          auth: { user: smtpUser, pass: smtpPass },
        });
        await transporter.sendMail({
          from: process.env.SMTP_FROM ?? smtpUser,
          to: pharmacyEmail,
          subject,
          text,
          html,
        });
        deliveryMethod = "smtp";
      } catch (e) {
        console.error("[forecast/approve] SMTP failed, falling back to mailto", e);
        deliveryMethod = "mailto";
        await db
          .update(pharmacyOrders)
          .set({ delivery: "mailto" })
          .where(eq(pharmacyOrders.id, orderId));
      }
    }

    if (deliveryMethod === "mailto") {
      const locale = typeof authUser.locale === "string" ? authUser.locale : undefined;
      const built = buildForecastMailtoUrl({
        pharmacyEmail,
        subject,
        body: text,
        locale,
      });
      mailtoUrl = built.url;
      mailtoBodyTruncated = built.truncated;
    }

    const meta = resolveAuditActorRole(req);
    logAudit({
      clinicId,
      actionType: "pharmacy_order_sent",
      performedBy: authUser.id,
      performedByEmail: authUser.email,
      targetId: orderId,
      targetType: "pharmacy_order",
      actorRole: meta,
      metadata: {
        order_id: orderId,
        patient_count: mergedResult.patients.length,
        window_hours: mergedResult.windowHours,
        delivery_method: deliveryMethod,
        patients: mergedResult.patients.map((p) => p.recordNumber).filter(Boolean),
      },
    });

    return res.json({
      orderId,
      deliveryMethod,
      mailtoUrl: deliveryMethod === "mailto" ? mailtoUrl : undefined,
      mailtoBodyTruncated: deliveryMethod === "mailto" ? mailtoBodyTruncated : undefined,
    });
  } catch (err) {
    if (err instanceof ForecastParseSessionGoneError) {
      return res.status(400).json(apiError({
        code: "PARSE_SESSION_INVALID",
        reason: "PARSE_SESSION_INVALID",
        message: "Parse session is missing, expired, or invalid. Run Parse again before approving.",
        requestId,
      }));
    }
    console.error("[forecast/approve]", err);
    return res.status(500).json(apiError({
      code: "INTERNAL_ERROR",
      reason: "FORECAST_APPROVE_FAILED",
      message: "Approve failed",
      requestId,
    }));
  }
});

/** Admin: set pharmacy recipient email for ICU orders */
router.patch("/clinic/pharmacy-email", requireAuth, ensureUserClinicMembership, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  const schema = z.object({ pharmacyEmail: z.string().email().nullable().optional() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(apiError({
      code: "VALIDATION_FAILED",
      reason: "INVALID_EMAIL",
      message: "Invalid pharmacy email",
      requestId,
    }));
  }
  const email = parsed.data.pharmacyEmail?.trim() ?? null;
  try {
    await db
      .insert(clinics)
      .values({
        id: clinicId,
        pharmacyEmail: email,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: clinics.id,
        set: { pharmacyEmail: email, updatedAt: new Date() },
      });
    return res.json({ pharmacyEmail: email });
  } catch (err) {
    console.error("[forecast/clinic-email]", err);
    return res.status(500).json(apiError({
      code: "INTERNAL_ERROR",
      reason: "UPDATE_FAILED",
      message: "Could not update clinic email",
      requestId,
    }));
  }
});

router.get("/clinic/pharmacy-email", requireAuth, ensureUserClinicMembership, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  try {
    const [row] = await db.select().from(clinics).where(eq(clinics.id, clinicId)).limit(1);
    return res.json({ pharmacyEmail: row?.pharmacyEmail ?? null });
  } catch (err) {
    console.error("[forecast/clinic-email get]", err);
    return res.status(500).json(apiError({
      code: "INTERNAL_ERROR",
      reason: "READ_FAILED",
      message: "Could not read clinic email",
      requestId,
    }));
  }
});

/** Admin: substrings to exclude from pharmacy forecast output (non-pharmacy meds, etc.). */
router.get("/clinic/pharmacy-forecast-exclusions", requireAuth, ensureUserClinicMembership, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  try {
    const rows = await db
      .select()
      .from(pharmacyForecastExclusions)
      .where(eq(pharmacyForecastExclusions.clinicId, clinicId));
    return res.json({ exclusions: rows });
  } catch (err) {
    console.error("[forecast/exclusions get]", err);
    return res.status(500).json(apiError({
      code: "INTERNAL_ERROR",
      reason: "READ_FAILED",
      message: "Could not load exclusions",
      requestId,
    }));
  }
});

router.post("/clinic/pharmacy-forecast-exclusions", requireAuth, ensureUserClinicMembership, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  const schema = z.object({
    matchSubstring: z.string().min(1).max(200),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(apiError({
      code: "VALIDATION_FAILED",
      reason: "INVALID_BODY",
      message: "matchSubstring required (1–200 chars)",
      requestId,
    }));
  }
  const matchSubstring = parsed.data.matchSubstring.trim();
  try {
    const [row] = await db
      .insert(pharmacyForecastExclusions)
      .values({
        clinicId,
        matchSubstring,
        note: parsed.data.note?.trim() || null,
      })
      .returning();
    return res.json({ exclusion: row });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("unique") || msg.includes("duplicate")) {
      return res.status(409).json(apiError({
        code: "CONFLICT",
        reason: "DUPLICATE_EXCLUSION",
        message: "This match substring already exists for the clinic",
        requestId,
      }));
    }
    console.error("[forecast/exclusions post]", err);
    return res.status(500).json(apiError({
      code: "INTERNAL_ERROR",
      reason: "INSERT_FAILED",
      message: "Could not add exclusion",
      requestId,
    }));
  }
});

router.delete("/clinic/pharmacy-forecast-exclusions/:id", requireAuth, ensureUserClinicMembership, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  const id = z.string().uuid().safeParse(req.params.id);
  if (!id.success) {
    return res.status(400).json(apiError({
      code: "VALIDATION_FAILED",
      reason: "INVALID_ID",
      message: "Invalid exclusion id",
      requestId,
    }));
  }
  try {
    await db
      .delete(pharmacyForecastExclusions)
      .where(and(eq(pharmacyForecastExclusions.id, id.data), eq(pharmacyForecastExclusions.clinicId, clinicId)));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[forecast/exclusions delete]", err);
    return res.status(500).json(apiError({
      code: "INTERNAL_ERROR",
      reason: "DELETE_FAILED",
      message: "Could not delete exclusion",
      requestId,
    }));
  }
});

export default router;
