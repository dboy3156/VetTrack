import { randomUUID } from "crypto";
import { Router } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, drugFormulary } from "../db.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";
import { SEEDED_FORMULARY } from "../../shared/drug-formulary-seed.js";

const router = Router();

const createOrUpsertFormularySchema = z.object({
  name: z.string().trim().min(1).max(200),
  concentrationMgMl: z.number().finite().positive(),
  standardDose: z.number().finite().positive(),
  doseUnit: z.enum(["mg_per_kg", "mcg_per_kg"]),
});

function resolveRequestId(
  res: { getHeader: (n: string) => unknown; setHeader?: (n: string, v: string) => void },
  incoming: unknown,
): string {
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

function toResponseRow(row: typeof drugFormulary.$inferSelect) {
  return {
    id: row.id,
    clinicId: row.clinicId,
    name: row.name,
    concentrationMgMl: Number(row.concentrationMgMl),
    standardDose: Number(row.standardDose),
    doseUnit: row.doseUnit as "mg_per_kg" | "mcg_per_kg",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function seedDefaultsIfClinicHasNoRows(clinicId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: drugFormulary.id })
      .from(drugFormulary)
      .where(eq(drugFormulary.clinicId, clinicId))
      .limit(1);
    if (existing) return;

    const now = new Date();
    await tx.insert(drugFormulary).values(
      SEEDED_FORMULARY.map((entry) => ({
        id: randomUUID(),
        clinicId,
        name: entry.name,
        concentrationMgMl: String(entry.concentrationMgMl),
        standardDose: String(entry.standardDose),
        doseUnit: entry.doseUnit,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })),
    );
  });
}

router.get("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;

  try {
    try {
      await seedDefaultsIfClinicHasNoRows(clinicId);
    } catch (err) {
      console.warn("[formulary] initial seed failed", {
        clinicId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    const rows = await db
      .select()
      .from(drugFormulary)
      .where(and(eq(drugFormulary.clinicId, clinicId), isNull(drugFormulary.deletedAt)))
      .orderBy(asc(drugFormulary.name));

    return res.json(rows.map(toResponseRow));
  } catch (err) {
    console.error("[formulary] list failed", err);
    return res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "FORMULARY_LIST_FAILED",
        message: "Failed to list formulary",
        requestId,
      }),
    );
  }
});

router.post("/", requireAuth, requireEffectiveRole("vet"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  const parsed = createOrUpsertFormularySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      apiError({
        code: "VALIDATION_FAILED",
        reason: "INVALID_FORMULARY_PAYLOAD",
        message: "Invalid formulary payload",
        requestId,
      }),
    );
  }

  const payload = parsed.data;
  const now = new Date();
  const normalizedName = payload.name.trim();
  const normalizedLowerName = normalizedName.toLowerCase();

  try {
    const [existing] = await db
      .select()
      .from(drugFormulary)
      .where(
        and(
          eq(drugFormulary.clinicId, clinicId),
          sql`lower(${drugFormulary.name}) = ${normalizedLowerName}`,
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.deletedAt) {
        const [reactivated] = await db
          .update(drugFormulary)
          .set({
            name: normalizedName,
            concentrationMgMl: String(payload.concentrationMgMl),
            standardDose: String(payload.standardDose),
            doseUnit: payload.doseUnit,
            deletedAt: null,
            updatedAt: now,
          })
          .where(and(eq(drugFormulary.id, existing.id), eq(drugFormulary.clinicId, clinicId)))
          .returning();
        return res.json(toResponseRow(reactivated));
      }
      return res.status(409).json(
        apiError({
          code: "CONFLICT",
          reason: "FORMULARY_NAME_EXISTS",
          message: "A formulary entry with this name already exists",
          requestId,
        }),
      );
    }

    const [created] = await db
      .insert(drugFormulary)
      .values({
        id: randomUUID(),
        clinicId,
        name: normalizedName,
        concentrationMgMl: String(payload.concentrationMgMl),
        standardDose: String(payload.standardDose),
        doseUnit: payload.doseUnit,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      })
      .returning();

    return res.status(201).json(toResponseRow(created));
  } catch (err) {
    const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
    if (code === "23505") {
      return res.status(409).json(
        apiError({
          code: "CONFLICT",
          reason: "FORMULARY_NAME_EXISTS",
          message: "A formulary entry with this name already exists",
          requestId,
        }),
      );
    }
    console.error("[formulary] upsert failed", err);
    return res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "FORMULARY_UPSERT_FAILED",
        message: "Failed to save formulary entry",
        requestId,
      }),
    );
  }
});

router.delete("/:id", requireAuth, requireEffectiveRole("admin"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  const id = req.params.id?.trim();
  if (!id) {
    return res.status(400).json(
      apiError({
        code: "VALIDATION_FAILED",
        reason: "MISSING_ID_PARAM",
        message: "id param is required",
        requestId,
      }),
    );
  }

  try {
    const [deleted] = await db
      .update(drugFormulary)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(drugFormulary.id, id), eq(drugFormulary.clinicId, clinicId), isNull(drugFormulary.deletedAt)))
      .returning({ id: drugFormulary.id });

    if (!deleted) {
      return res.status(404).json(
        apiError({
          code: "NOT_FOUND",
          reason: "FORMULARY_NOT_FOUND",
          message: "Formulary entry not found",
          requestId,
        }),
      );
    }

    return res.status(204).send();
  } catch (err) {
    console.error("[formulary] delete failed", err);
    return res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "FORMULARY_DELETE_FAILED",
        message: "Failed to delete formulary entry",
        requestId,
      }),
    );
  }
});

export default router;
