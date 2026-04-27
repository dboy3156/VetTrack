import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { db, crashCartChecks, hospitalizations, animals } from "../db.js";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

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

const checkItemSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  checked: z.boolean(),
});

const submitCheckSchema = z.object({
  items: z.array(checkItemSchema).min(1).max(20),
  notes: z.string().max(500).optional(),
});

// POST /api/crash-cart/checks — submit a daily check
router.post("/checks", requireAuth, validateBody(submitCheckSchema), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const { items, notes } = req.body as z.infer<typeof submitCheckSchema>;

    const allPassed = items.every((item) => item.checked);

    const id = randomUUID();
    await db.insert(crashCartChecks).values({
      id,
      clinicId,
      performedByUserId: req.authUser!.id,
      performedByName: req.authUser!.name,
      itemsChecked: items,
      allPassed,
      notes: notes ?? null,
    });

    res.status(201).json({ id, allPassed });
  } catch (err) {
    console.error("[crash-cart] submit check failed", err);
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to save check", requestId });
  }
});

// GET /api/crash-cart/checks/latest — last check + recent history + high-risk patients
router.get("/checks/latest", requireAuth, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;

    // Last 7 checks
    const recentChecks = await db
      .select()
      .from(crashCartChecks)
      .where(eq(crashCartChecks.clinicId, clinicId))
      .orderBy(desc(crashCartChecks.performedAt))
      .limit(7);

    // High-risk patients: active hospitalizations with status='critical'
    const criticalPatients = await db
      .select({
        hospitalizationId: hospitalizations.id,
        ward: hospitalizations.ward,
        bay: hospitalizations.bay,
        animalId: animals.id,
        animalName: animals.name,
        species: animals.species,
        weightKg: animals.weightKg,
      })
      .from(hospitalizations)
      .innerJoin(animals, eq(animals.id, hospitalizations.animalId))
      .where(
        and(
          eq(hospitalizations.clinicId, clinicId),
          sql`${hospitalizations.status} = 'critical'`,
          sql`${hospitalizations.dischargedAt} IS NULL`,
        ),
      )
      .orderBy(hospitalizations.admittedAt);

    const latest = recentChecks[0] ?? null;
    const checkedToday = latest
      ? new Date(latest.performedAt).getTime() > Date.now() - 24 * 60 * 60 * 1000
      : false;

    res.json({ latest, checkedToday, recentChecks, criticalPatients });
  } catch (err) {
    console.error("[crash-cart] get latest failed", err);
    res.status(500).json({ code: "INTERNAL_ERROR", message: "Failed to get latest check", requestId });
  }
});

export default router;
