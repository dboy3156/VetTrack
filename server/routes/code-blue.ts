import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import {
  db,
  codeBlueEvents,
  codeBlueSessions,
  codeBlueLogEntries,
  codeBluePresence,
  crashCartChecks,
  equipment,
  animals,
  hospitalizations,
} from "../db.js";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";
import { logAudit, resolveAuditActorRole } from "../lib/audit.js";
import { enqueueNotificationJob } from "../lib/queue.js";

const router = Router();

function resolveRequestId(
  res: { getHeader: (n: string) => unknown; setHeader?: (n: string, v: string) => void },
  incomingHeader: unknown,
): string {
  const incoming = typeof incomingHeader === "string" ? incomingHeader.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incoming || fromRes || randomUUID();
  if (typeof res.setHeader === "function") res.setHeader("x-request-id", requestId);
  return requestId;
}

function apiError(p: { code: string; reason: string; message: string; requestId: string }) {
  return { code: p.code, error: p.code, reason: p.reason, message: p.message, requestId: p.requestId };
}

const startSchema = z.object({
  localStartedAt: z.string().datetime().optional(),
});

const endSchema = z.object({
  outcome: z.enum(["rosc", "died", "transferred", "ongoing"]).optional(),
  notes: z.string().max(2000).optional(),
  timeline: z
    .array(z.object({ elapsed: z.number(), label: z.string().max(200) }))
    .max(500)
    .optional(),
});

const startSessionSchema = z.object({
  managerUserId: z.string().min(1),
  managerUserName: z.string().min(1),
  patientId: z.string().optional(),
  hospitalizationId: z.string().optional(),
  preCheckPassed: z.boolean().optional(),
  localStartedAt: z.string().datetime().optional(),
});

const logEntrySchema = z.object({
  idempotencyKey: z.string().uuid(),
  elapsedMs: z.number().int().min(0),
  label: z.string().min(1).max(200),
  category: z.enum(["drug", "shock", "cpr", "note", "equipment"]),
  equipmentId: z.string().optional(),
});

const endSessionSchema = z.object({
  outcome: z.enum(["rosc", "died", "transferred", "ongoing"]),
});

// POST /api/code-blue/events  — start a Code Blue event (fire-and-forget safe)
router.post("/events", requireAuth, validateBody(startSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const userId = req.authUser!.id;
    const { localStartedAt } = req.body as z.infer<typeof startSchema>;

    const id = randomUUID();
    const startedAt = localStartedAt ? new Date(localStartedAt) : new Date();

    await db.insert(codeBlueEvents).values({
      id,
      clinicId,
      startedByUserId: userId,
      startedAt,
    });

    logAudit({
      actorRole: resolveAuditActorRole(req),
      clinicId,
      actionType: "code_blue_started",
      performedBy: userId,
      performedByEmail: req.authUser!.email ?? "",
      targetId: id,
      targetType: "code_blue_event",
      metadata: { startedAt: startedAt.toISOString() },
    });

    res.status(201).json({ id, startedAt: startedAt.toISOString() });
  } catch (err) {
    console.error("[code-blue] start failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "CODE_BLUE_START_FAILED", message: "Failed to start Code Blue event", requestId }),
    );
  }
});

// PATCH /api/code-blue/events/:id  — close a Code Blue event with outcome + timeline
router.patch("/events/:id", requireAuth, validateUuid("id"), validateBody(endSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { id } = req.params;
    const body = req.body as z.infer<typeof endSchema>;

    const [updated] = await db
      .update(codeBlueEvents)
      .set({
        endedAt: new Date(),
        ...(body.outcome ? { outcome: body.outcome } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.timeline ? { timeline: body.timeline } : {}),
      })
      .where(and(eq(codeBlueEvents.id, id), eq(codeBlueEvents.clinicId, clinicId)))
      .returning({ id: codeBlueEvents.id, endedAt: codeBlueEvents.endedAt });

    if (!updated) {
      return res.status(404).json(
        apiError({ code: "NOT_FOUND", reason: "EVENT_NOT_FOUND", message: "Code Blue event not found", requestId }),
      );
    }

    logAudit({
      actorRole: resolveAuditActorRole(req),
      clinicId,
      actionType: "code_blue_ended",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? "",
      targetId: id,
      targetType: "code_blue_event",
      metadata: { outcome: body.outcome ?? null, endedAt: updated.endedAt?.toISOString() },
    });

    res.json({ id: updated.id, endedAt: updated.endedAt });
  } catch (err) {
    console.error("[code-blue] end failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "CODE_BLUE_END_FAILED", message: "Failed to end Code Blue event", requestId }),
    );
  }
});

// GET /api/code-blue/events  — admin: list recent events for this clinic
router.get("/events", requireAuth, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const items = await db
      .select()
      .from(codeBlueEvents)
      .where(eq(codeBlueEvents.clinicId, clinicId))
      .orderBy(desc(codeBlueEvents.startedAt))
      .limit(50);

    res.json(items);
  } catch (err) {
    console.error("[code-blue] list failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "CODE_BLUE_LIST_FAILED", message: "Failed to list Code Blue events", requestId }),
    );
  }
});

// POST /api/code-blue/sessions — start a new live session
router.post("/sessions", requireAuth, validateBody(startSessionSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const userId = req.authUser!.id;
    const body = req.body as z.infer<typeof startSessionSchema>;

    const id = randomUUID();
    const startedAt = body.localStartedAt ? new Date(body.localStartedAt) : new Date();

    await db.insert(codeBlueSessions).values({
      id,
      clinicId,
      startedAt,
      startedBy: userId,
      startedByName: req.authUser!.name,
      managerUserId: body.managerUserId,
      managerUserName: body.managerUserName,
      patientId: body.patientId ?? null,
      hospitalizationId: body.hospitalizationId ?? null,
      preCheckPassed: body.preCheckPassed ?? null,
      status: "active",
    });

    logAudit({
      actorRole: resolveAuditActorRole(req),
      clinicId,
      actionType: "code_blue_started",
      performedBy: userId,
      performedByEmail: req.authUser!.email ?? "",
      targetId: id,
      targetType: "code_blue_session",
      metadata: { startedAt: startedAt.toISOString(), managerUserId: body.managerUserId },
    });

    // Push notification to all staff — fire and forget
    const roles = ["admin", "vet", "senior_technician", "technician"] as const;
    for (const role of roles) {
      void enqueueNotificationJob({
        type: "automation_push_role",
        clinicId,
        role,
        title: "⚠ CODE BLUE",
        body: `CODE BLUE הופעל ע״י ${req.authUser!.name}`,
        tag: `code-blue-${id}`,
      }).catch(() => { /* non-critical */ });
    }

    res.status(201).json({ id, startedAt: startedAt.toISOString() });
  } catch (err) {
    console.error("[code-blue] start session failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "SESSION_START_FAILED", message: "Failed to start session", requestId }),
    );
  }
});

// GET /api/code-blue/sessions/active — poll: session + log entries + presence + cart status
router.get("/sessions/active", requireAuth, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;

    // Active session
    const [session] = await db
      .select()
      .from(codeBlueSessions)
      .where(and(eq(codeBlueSessions.clinicId, clinicId), eq(codeBlueSessions.status, "active")))
      .limit(1);

    // Latest crash cart check (last 24h)
    const [latestCheck] = await db
      .select()
      .from(crashCartChecks)
      .where(
        and(
          eq(crashCartChecks.clinicId, clinicId),
          sql`${crashCartChecks.performedAt} > NOW() - INTERVAL '24 hours'`,
        ),
      )
      .orderBy(desc(crashCartChecks.performedAt))
      .limit(1);

    const cartStatus = latestCheck
      ? { lastCheckedAt: latestCheck.performedAt, allPassed: latestCheck.allPassed, performedByName: latestCheck.performedByName }
      : null;

    if (!session) {
      return res.json({ session: null, logEntries: [], presence: [], cartStatus });
    }

    // Log entries ordered by elapsed time
    const logEntries = await db
      .select()
      .from(codeBlueLogEntries)
      .where(eq(codeBlueLogEntries.sessionId, session.id))
      .orderBy(codeBlueLogEntries.elapsedMs);

    // Presence — filter stale (>30s)
    const presence = await db
      .select()
      .from(codeBluePresence)
      .where(
        and(
          eq(codeBluePresence.sessionId, session.id),
          sql`${codeBluePresence.lastSeenAt} > NOW() - INTERVAL '30 seconds'`,
        ),
      );

    // Patient details if linked
    let patientName: string | null = null;
    let patientWeight: number | null = null;
    if (session.patientId) {
      const [animal] = await db
        .select({ name: animals.name, weight: animals.weightKg })
        .from(animals)
        .where(and(eq(animals.id, session.patientId), eq(animals.clinicId, clinicId)))
        .limit(1);
      if (animal) {
        patientName = animal.name;
        patientWeight = animal.weight !== null ? Number(animal.weight) : null;
      }
    }

    res.json({
      session: { ...session, patientName, patientWeight },
      logEntries,
      presence,
      cartStatus,
    });
  } catch (err) {
    console.error("[code-blue] poll failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "SESSION_POLL_FAILED", message: "Poll failed", requestId }),
    );
  }
});

// POST /api/code-blue/sessions/:id/logs — add a log entry
router.post("/sessions/:id/logs", requireAuth, validateUuid("id"), validateBody(logEntrySchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { id: sessionId } = req.params;
    const body = req.body as z.infer<typeof logEntrySchema>;

    // Verify session belongs to clinic
    const [session] = await db
      .select({ id: codeBlueSessions.id, patientId: codeBlueSessions.patientId })
      .from(codeBlueSessions)
      .where(and(eq(codeBlueSessions.id, sessionId), eq(codeBlueSessions.clinicId, clinicId)))
      .limit(1);

    if (!session) {
      return res.status(404).json(
        apiError({ code: "NOT_FOUND", reason: "SESSION_NOT_FOUND", message: "Session not found", requestId }),
      );
    }

    // Idempotency: check for existing key
    const [existing] = await db
      .select({ id: codeBlueLogEntries.id })
      .from(codeBlueLogEntries)
      .where(and(
        eq(codeBlueLogEntries.sessionId, sessionId),
        eq(codeBlueLogEntries.idempotencyKey, body.idempotencyKey),
      ))
      .limit(1);

    if (existing) {
      return res.json({ id: existing.id, duplicate: true });
    }

    const entryId = randomUUID();
    await db.insert(codeBlueLogEntries).values({
      id: entryId,
      sessionId,
      clinicId,
      idempotencyKey: body.idempotencyKey,
      elapsedMs: body.elapsedMs,
      label: body.label,
      category: body.category,
      equipmentId: body.equipmentId ?? null,
      loggedByUserId: req.authUser!.id,
      loggedByName: req.authUser!.name,
    });

    // If equipment log: mark equipment as checked out to this patient
    if (body.category === "equipment" && body.equipmentId && session.patientId) {
      await db
        .update(equipment)
        .set({
          checkedOutById: req.authUser!.id,
          checkedOutByEmail: req.authUser!.email ?? "",
          checkedOutAt: new Date(),
          checkedOutLocation: `Code Blue — patient ${session.patientId}`,
        })
        .where(and(eq(equipment.id, body.equipmentId), eq(equipment.clinicId, clinicId)));
    }

    res.status(201).json({ id: entryId, duplicate: false });
  } catch (err) {
    console.error("[code-blue] add log entry failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "LOG_ENTRY_FAILED", message: "Failed to add log entry", requestId }),
    );
  }
});

// PATCH /api/code-blue/sessions/:id/presence — heartbeat (every 10s)
router.patch("/sessions/:id/presence", requireAuth, validateUuid("id"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { id: sessionId } = req.params;
    const userId = req.authUser!.id;
    const userName = req.authUser!.name;

    // Verify session belongs to this clinic
    const [session] = await db
      .select({ id: codeBlueSessions.id })
      .from(codeBlueSessions)
      .where(and(eq(codeBlueSessions.id, sessionId), eq(codeBlueSessions.clinicId, clinicId)))
      .limit(1);

    if (!session) {
      return res.status(404).json(
        apiError({ code: "NOT_FOUND", reason: "SESSION_NOT_FOUND", message: "Session not found", requestId }),
      );
    }

    await db
      .insert(codeBluePresence)
      .values({ sessionId, userId, userName, lastSeenAt: new Date() })
      .onConflictDoUpdate({
        target: [codeBluePresence.sessionId, codeBluePresence.userId],
        set: { userName, lastSeenAt: new Date() },
      });

    res.json({ ok: true });
  } catch (err) {
    console.error("[code-blue] presence heartbeat failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "PRESENCE_FAILED", message: "Presence update failed", requestId }),
    );
  }
});

// PATCH /api/code-blue/sessions/:id/end — close session (manager only for ALL outcomes)
router.patch("/sessions/:id/end", requireAuth, validateUuid("id"), validateBody(endSessionSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { id: sessionId } = req.params;
    const { outcome } = req.body as z.infer<typeof endSessionSchema>;

    const [session] = await db
      .select()
      .from(codeBlueSessions)
      .where(and(eq(codeBlueSessions.id, sessionId), eq(codeBlueSessions.clinicId, clinicId)))
      .limit(1);

    if (!session) {
      return res.status(404).json(
        apiError({ code: "NOT_FOUND", reason: "SESSION_NOT_FOUND", message: "Session not found", requestId }),
      );
    }

    // Manager-only gate — applies to ALL outcomes
    if (session.managerUserId !== req.authUser!.id) {
      return res.status(403).json(
        apiError({ code: "MANAGER_ONLY", reason: "MANAGER_ONLY", message: "Only the resuscitation manager can end this session", requestId }),
      );
    }

    const endedAt = new Date();

    // Fetch log entries for auto-summary
    const logEntries = await db
      .select()
      .from(codeBlueLogEntries)
      .where(eq(codeBlueLogEntries.sessionId, sessionId));

    const participants = [...new Set(logEntries.map((e) => e.loggedByName))];
    if (!participants.includes(session.startedByName)) participants.unshift(session.startedByName);

    const interventionCounts = logEntries.reduce<Record<string, number>>((acc, e) => {
      acc[e.category] = (acc[e.category] ?? 0) + 1;
      return acc;
    }, {});

    const equipmentAttached = logEntries
      .filter((e) => e.category === "equipment")
      .map((e) => e.label);

    const durationMinutes = Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60000);

    const summary = JSON.stringify({
      duration_minutes: durationMinutes,
      manager: session.managerUserName,
      interventions: interventionCounts,
      equipment_attached: equipmentAttached,
      participants,
      pre_check_passed: session.preCheckPassed ?? null,
      outcome,
    });

    // Update session
    await db
      .update(codeBlueSessions)
      .set({ status: "ended", outcome, endedAt })
      .where(and(eq(codeBlueSessions.id, sessionId), eq(codeBlueSessions.clinicId, clinicId)));

    // Archive to vt_code_blue_events (backward compat)
    await db.insert(codeBlueEvents).values({
      id: randomUUID(),
      clinicId,
      startedByUserId: session.startedBy,
      startedAt: session.startedAt,
      endedAt,
      outcome,
      notes: summary,
      timeline: logEntries.map((e) => ({ elapsed: e.elapsedMs, label: e.label })),
    });

    logAudit({
      actorRole: resolveAuditActorRole(req),
      clinicId,
      actionType: "code_blue_ended",
      performedBy: req.authUser!.id,
      performedByEmail: req.authUser!.email ?? "",
      targetId: sessionId,
      targetType: "code_blue_session",
      metadata: { outcome, durationMinutes },
    });

    res.json({ id: sessionId, endedAt: endedAt.toISOString(), summary: JSON.parse(summary) });
  } catch (err) {
    console.error("[code-blue] end session failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "SESSION_END_FAILED", message: "Failed to end session", requestId }),
    );
  }
});

// GET /api/code-blue/history — admin: list ended sessions
router.get("/history", requireAuth, requireAdmin, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const sessions = await db
      .select()
      .from(codeBlueSessions)
      .where(and(eq(codeBlueSessions.clinicId, clinicId), eq(codeBlueSessions.status, "ended")))
      .orderBy(desc(codeBlueSessions.startedAt))
      .limit(100);

    res.json(sessions);
  } catch (err) {
    console.error("[code-blue] history list failed", err);
    res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "HISTORY_FAILED", message: "Failed to list history", requestId }),
    );
  }
});

export default router;
