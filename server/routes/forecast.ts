import { createHash, randomUUID } from "crypto";
import { Router, type Request } from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { and, eq, gt } from "drizzle-orm";
import { z } from "zod";
import nodemailer from "nodemailer";
import pdfParse from "pdf-parse";

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
import {
  fingerprintForecastExclusions,
  loadForecastExclusionSubstrings,
  runForecastPipeline,
} from "../lib/forecast/pipeline.js";

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

function parseTimeoutEnv(raw: string | undefined, fallbackMs: number): number {
  if (!raw || !raw.trim()) return fallbackMs;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return parsed;
}

/**
 * Coerce SMTP_IP_FAMILY env to a value Node `net.connect` understands (0 | 4 | 6).
 * 0 = let the OS choose (default Node behavior — tries AAAA first on Linux).
 * 4 = IPv4 only (safe default for Railway/Fly containers without v6 egress).
 * 6 = IPv6 only.
 */
function parseIpFamilyEnv(raw: string | undefined, fallback: 0 | 4 | 6): 0 | 4 | 6 {
  if (!raw || !raw.trim()) return fallback;
  const parsed = parseInt(raw, 10);
  if (parsed === 0 || parsed === 4 || parsed === 6) return parsed;
  return fallback;
}

/**
 * Produce a short, safe description of an SMTP failure for the client UI.
 * Never includes credentials; only the library error code / summary line.
 */
function sanitizeSmtpError(err: unknown): string {
  if (!err || typeof err !== "object") return "SMTP error";
  const anyErr = err as { code?: unknown; command?: unknown; message?: unknown };
  const code = typeof anyErr.code === "string" ? anyErr.code : "";
  const command = typeof anyErr.command === "string" ? anyErr.command : "";
  const raw = typeof anyErr.message === "string" ? anyErr.message : "";
  // Keep to the first line, trim, and cap so we don't leak long server traces.
  const firstLine = raw.split("\n")[0]?.trim() ?? "";
  const summary = firstLine.length > 160 ? `${firstLine.slice(0, 157)}…` : firstLine;
  const parts = [code, command, summary].filter((s) => s && s.length > 0);
  return parts.length > 0 ? parts.join(" · ") : "SMTP error";
}

function apiError(params: {
  code: string;
  reason: string;
  message: string;
  requestId: string;
  errors?: unknown[];
}) {
  return {
    code: params.code,
    error: params.code,
    reason: params.reason,
    message: params.message,
    requestId: params.requestId,
    ...(params.errors != null ? { errors: params.errors } : {}),
  };
}

/**
 * Thursday (Israel) → 72 h weekend pharmacy window; else 24 h.
 * Uses Asia/Jerusalem so server UTC does not shift the weekday at night.
 */
function defaultWindowHoursFromCalendar(): 24 | 72 {
  const formatter = new Intl.DateTimeFormat("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
  });
  const hebrewDay = formatter.format(new Date());
  return hebrewDay.includes("חמישי") ? 72 : 24;
}

const parseRateLimit = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const xf = req.headers["x-forwarded-for"];
    const fromHeader = typeof xf === "string" ? xf.split(",")[0]?.trim() : "";
    return fromHeader || req.ip || "unknown";
  },
});

function multipartOrJsonBody(req: Request): Record<string, unknown> {
  const b = req.body;
  if (b && typeof b === "object" && !Array.isArray(b)) return b as Record<string, unknown>;
  return {};
}

router.post(
  "/parse",
  parseRateLimit,
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
          const buf = file.buffer as Buffer;
          const out = await pdfParse(buf);
          rawText = typeof out.text === "string" ? out.text : "";
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

      /**
       * Fold clinic exclusions + window into the idempotency hash so that adding/removing
       * an exclusion (or switching 24h/72h) invalidates cached parses for the same PDF.
       * Otherwise a re-upload of the same flowsheet returns a stale forecast that still
       * contains just-excluded drugs.
       */
      const exclusionSubstrings = await loadForecastExclusionSubstrings(clinicId);
      const windowHours = parsed.data.windowHours ?? defaultWindowHoursFromCalendar();
      const weekendMode =
        parsed.data.weekendMode ?? (windowHours === 72 && defaultWindowHoursFromCalendar() === 72);

      const contentHash = createHash("sha256")
        .update(rawText, "utf8")
        .update("\u0000window:", "utf8")
        .update(`${windowHours}:${weekendMode ? 1 : 0}`, "utf8")
        .update("\u0000exclusions:", "utf8")
        .update(fingerprintForecastExclusions(exclusionSubstrings), "utf8")
        .digest("hex");
      console.info(
        `[forecast/parse] ${new Date().toISOString()} contentHash=${contentHash} requestId=${requestId} clinicId=${clinicId}`,
      );

      const [idem] = await db
        .select()
        .from(pharmacyForecastParses)
        .where(
          and(
            eq(pharmacyForecastParses.clinicId, clinicId),
            eq(pharmacyForecastParses.createdBy, authUser.id),
            eq(pharmacyForecastParses.contentHash, contentHash),
            gt(pharmacyForecastParses.expiresAt, new Date()),
          ),
        )
        .limit(1);

      if (idem?.result != null) {
        const cached = forecastResultSchema.safeParse(idem.result);
        if (cached.success) {
          return res.json({ parseId: idem.id, ...cached.data });
        }
      }

      const result = await runForecastPipeline({
        rawText,
        clinicId,
        windowHours,
        weekendMode,
        exclusionSubstrings,
      });

      const parseId = randomUUID();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      await db.insert(pharmacyForecastParses).values({
        id: parseId,
        clinicId,
        createdBy: authUser.id,
        expiresAt,
        result: result as unknown as Record<string, unknown>,
        contentHash,
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

    const gate = validateMergedForecastForApproval(mergedResult, {
      pharmacistDoseAckKeys: new Set(parsed.data.pharmacistDoseAcks ?? []),
      patientFlagAckKeys: new Set(parsed.data.patientFlagAcks ?? []),
      weightOverrideRecordNumbers: new Set(Object.keys(parsed.data.patientWeightOverrides ?? {})),
      confirmedDrugKeys: new Set(parsed.data.confirmedDrugKeys ?? []),
    });
    if (!gate.ok) {
      return res.status(400).json(apiError({
        code: "VALIDATION_FAILED",
        reason: gate.code,
        message: gate.message,
        requestId,
        errors: gate.errors,
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

    if (mergedResult.patients.some((p) => p.flags.includes("PATIENT_UNKNOWN"))) {
      console.warn(`[forecast/approve] PATIENT_UNKNOWN present in approved order orderId=${orderId}`);
    }

    const { subject, html, text } = buildPharmacyOrderEmail({
      result: mergedResult,
      technicianName: authUser.name || authUser.email,
      auditOrOrderHint: orderId,
      auditTrace: parsed.data.auditTrace,
      patientWeightOverrides: parsed.data.patientWeightOverrides,
    });

    let deliveryMethod: "smtp" | "mailto" = hasSmtp ? "smtp" : "mailto";
    let smtpFallbackReason: string | undefined;

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
          // Force IPv4. Railway / Fly / Heroku containers commonly have no
          // outbound IPv6 route, so letting DNS resolve smtp.gmail.com to AAAA
          // first causes `ESOCKET · ENETUNREACH <ipv6>:587` before nodemailer
          // ever falls back to A records. Override via SMTP_IP_FAMILY=0 if a
          // host actually does have v6 and prefers it.
          family: parseIpFamilyEnv(process.env.SMTP_IP_FAMILY, 4),
          // Explicit timeouts keep the request from hanging when a network path
          // blocks port 587 (common on residential ISPs / corporate networks).
          // Defaults are intentionally short; override via env if needed.
          connectionTimeout: parseTimeoutEnv(process.env.SMTP_CONNECTION_TIMEOUT_MS, 10_000),
          greetingTimeout: parseTimeoutEnv(process.env.SMTP_GREETING_TIMEOUT_MS, 10_000),
          socketTimeout: parseTimeoutEnv(process.env.SMTP_SOCKET_TIMEOUT_MS, 15_000),
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
        smtpFallbackReason = sanitizeSmtpError(e);
        console.error(
          `[forecast/approve] SMTP failed, falling back to mailto orderId=${orderId} reason=${smtpFallbackReason}`,
          e,
        );
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
      smtpFallbackReason: deliveryMethod === "mailto" && smtpFallbackReason ? smtpFallbackReason : undefined,
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

/** Admin/API only: clinic substrings excluded in `runForecastPipeline` when computing pharmacy order output (not exposed in the SPA). */
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
    note: z.string().max(500).nullish(),
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
    /** Invalidate cached parses so re-uploads immediately apply the new exclusion. */
    await db
      .delete(pharmacyForecastParses)
      .where(eq(pharmacyForecastParses.clinicId, clinicId));
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
    /** Invalidate cached parses so re-uploads immediately reflect the removed exclusion. */
    await db
      .delete(pharmacyForecastParses)
      .where(eq(pharmacyForecastParses.clinicId, clinicId));
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
