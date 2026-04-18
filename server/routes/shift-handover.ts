import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { and, asc, desc, eq, gte, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { billingLedger, db, equipment, scanLogs, shiftSessions, usageSessions } from "../db.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

const router = Router();

const startSessionSchema = z.object({
  note: z.string().max(500).optional(),
});

const endSessionSchema = z.object({
  note: z.string().max(500).optional(),
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

/** Latest open shift session for clinic, or null. */
async function getOpenShiftSession(clinicId: string) {
  const [row] = await db
    .select()
    .from(shiftSessions)
    .where(and(eq(shiftSessions.clinicId, clinicId), isNull(shiftSessions.endedAt)))
    .orderBy(desc(shiftSessions.startedAt))
    .limit(1);
  return row ?? null;
}

function addDaysYmd(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function resolveReportWindow(
  clinicId: string,
): Promise<{ windowStart: Date; source: "open_shift" | "fallback_12h" }> {
  const open = await getOpenShiftSession(clinicId);
  if (open) {
    return { windowStart: new Date(open.startedAt), source: "open_shift" };
  }
  return { windowStart: new Date(Date.now() - 12 * 60 * 60 * 1000), source: "fallback_12h" };
}

// GET /api/shift-handover/discharge/:animalId — open usage sessions (equipment still "in use" for billing)
router.get("/discharge/:animalId", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const animalId = req.params.animalId?.trim();
    if (!animalId) {
      return res.status(400).json(
        apiError({
          code: "VALIDATION_FAILED",
          reason: "ANIMAL_ID_REQUIRED",
          message: "animalId is required",
          requestId,
        }),
      );
    }

    const rows = await db
      .select({
        sessionId: usageSessions.id,
        equipmentId: equipment.id,
        equipmentName: equipment.name,
        startedAt: usageSessions.startedAt,
      })
      .from(usageSessions)
      .leftJoin(equipment, eq(usageSessions.equipmentId, equipment.id))
      .where(
        and(
          eq(usageSessions.clinicId, clinicId),
          eq(usageSessions.animalId, animalId),
          eq(usageSessions.status, "open"),
        ),
      );

    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "DISCHARGE_FETCH_FAILED",
        message: "Failed to load discharge checklist",
        requestId,
      }),
    );
  }
});

// GET /api/shift-handover/summary
router.get("/summary", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { windowStart, source } = await resolveReportWindow(clinicId);
    const now = new Date();

    const revenueRows = await db
      .select({ total: sql<number>`coalesce(sum(${billingLedger.totalAmountCents}), 0)::int` })
      .from(billingLedger)
      .where(
        and(eq(billingLedger.clinicId, clinicId), gte(billingLedger.createdAt, windowStart)),
      );

    const revenueCents = revenueRows[0]?.total ?? 0;

    const unreturned = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        checkedOutAt: equipment.checkedOutAt,
        checkedOutByEmail: equipment.checkedOutByEmail,
        checkedOutLocation: equipment.checkedOutLocation,
      })
      .from(equipment)
      .where(
        and(
          eq(equipment.clinicId, clinicId),
          isNull(equipment.deletedAt),
          isNotNull(equipment.checkedOutAt),
        ),
      )
      .orderBy(desc(equipment.checkedOutAt));

    const scanCounts = await db
      .select({
        equipmentId: scanLogs.equipmentId,
        cnt: sql<number>`count(*)::int`,
      })
      .from(scanLogs)
      .where(
        and(
          eq(scanLogs.clinicId, clinicId),
          gte(scanLogs.timestamp, windowStart),
          isNotNull(scanLogs.equipmentId),
        ),
      )
      .groupBy(scanLogs.equipmentId);

    const scanMap = new Map<string, number>();
    for (const r of scanCounts) {
      if (r.equipmentId) scanMap.set(r.equipmentId, r.cnt);
    }

    const expiringAssets = await db
      .select({
        id: equipment.id,
        name: equipment.name,
        expiryDate: equipment.expiryDate,
      })
      .from(equipment)
      .where(
        and(
          eq(equipment.clinicId, clinicId),
          isNull(equipment.deletedAt),
          isNotNull(equipment.expiryDate),
          lte(equipment.expiryDate, addDaysYmd(90)),
        ),
      )
      .orderBy(asc(equipment.expiryDate))
      .limit(50);

    const allActive = await db
      .select({ id: equipment.id, name: equipment.name })
      .from(equipment)
      .where(and(eq(equipment.clinicId, clinicId), isNull(equipment.deletedAt)));

    const hotAssets = [...allActive]
      .map((e) => ({ ...e, scans: scanMap.get(e.id) ?? 0 }))
      .filter((e) => e.scans > 0)
      .sort((a, b) => b.scans - a.scans)
      .slice(0, 10);

    const openSession = await getOpenShiftSession(clinicId);

    res.json({
      windowStart: windowStart.toISOString(),
      windowEnd: now.toISOString(),
      windowSource: source,
      revenueCents,
      unreturned,
      expiringAssets,
      hotAssets,
      openShiftSession: openSession
        ? {
            id: openSession.id,
            startedAt: openSession.startedAt,
            startedByUserId: openSession.startedByUserId,
            note: openSession.note,
          }
        : null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "HANDOVER_SUMMARY_FAILED",
        message: "Failed to load shift handover summary",
        requestId,
      }),
    );
  }
});

// POST /api/shift-handover/session/start
router.post(
  "/session/start",
  requireAuth,
  requireEffectiveRole("technician"),
  validateBody(startSessionSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const existing = await getOpenShiftSession(clinicId);
      if (existing) {
        return res.status(409).json(
          apiError({
            code: "CONFLICT",
            reason: "SHIFT_ALREADY_OPEN",
            message: "A shift session is already open",
            requestId,
          }),
        );
      }
      const { note } = req.body as z.infer<typeof startSessionSchema>;
      const id = randomUUID();
      const startedAt = new Date();
      await db.insert(shiftSessions).values({
        id,
        clinicId,
        startedAt,
        endedAt: null,
        startedByUserId: req.authUser!.id,
        note: note?.trim() || null,
      });
      res.status(201).json({
        id,
        clinicId,
        startedAt: startedAt.toISOString(),
        endedAt: null,
        startedByUserId: req.authUser!.id,
        note: note?.trim() || null,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({
          code: "INTERNAL_ERROR",
          reason: "SHIFT_START_FAILED",
          message: "Failed to start shift session",
          requestId,
        }),
      );
    }
  },
);

// POST /api/shift-handover/session/end
router.post(
  "/session/end",
  requireAuth,
  requireEffectiveRole("technician"),
  validateBody(endSessionSchema),
  async (req, res) => {
    const requestId = resolveRequestId(res, req.headers["x-request-id"]);
    try {
      const clinicId = req.clinicId!;
      const open = await getOpenShiftSession(clinicId);
      if (!open) {
        return res.status(404).json(
          apiError({
            code: "NOT_FOUND",
            reason: "NO_OPEN_SHIFT",
            message: "No open shift session",
            requestId,
          }),
        );
      }
      const { note } = req.body as z.infer<typeof endSessionSchema>;
      const endedAt = new Date();
      const mergedNote =
        note?.trim() ? [open.note, note.trim()].filter(Boolean).join(" | ") : open.note;
      await db
        .update(shiftSessions)
        .set({ endedAt, note: mergedNote })
        .where(and(eq(shiftSessions.id, open.id), eq(shiftSessions.clinicId, clinicId)));
      res.json({
        id: open.id,
        clinicId,
        startedAt: open.startedAt,
        endedAt: endedAt.toISOString(),
        startedByUserId: open.startedByUserId,
        note: mergedNote,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json(
        apiError({
          code: "INTERNAL_ERROR",
          reason: "SHIFT_END_FAILED",
          message: "Failed to end shift session",
          requestId,
        }),
      );
    }
  },
);

export default router;
