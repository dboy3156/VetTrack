import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, codeBlueEvents } from "../db.js";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { validateBody, validateUuid } from "../middleware/validate.js";

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

export default router;
