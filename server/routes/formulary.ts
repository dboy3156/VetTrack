import { randomUUID } from "crypto";
import { Router } from "express";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, drugFormulary } from "../db.js";
import { normalizeJsonStringArray, syncFormularyFromSeed } from "../lib/formulary-seed-sync.js";
import { requireAuth, requireEffectiveRole } from "../middleware/auth.js";

const router = Router();

const createOrUpsertFormularySchema = z.object({
  name: z.string().trim().min(1).max(200),
  genericName: z.string().trim().min(1).max(200),
  brandNames: z.array(z.string().trim().min(1)).max(50).optional(),
  targetSpecies: z.array(z.string().trim().min(1)).max(20).optional(),
  category: z.string().trim().max(120).optional().nullable(),
  dosageNotes: z.string().trim().max(2000).optional().nullable(),
  concentrationMgMl: z.number().finite().positive(),
  standardDose: z.number().finite().positive(),
  minDose: z.number().finite().positive().optional().nullable(),
  maxDose: z.number().finite().positive().optional().nullable(),
  doseUnit: z.enum(["mg_per_kg", "mcg_per_kg", "mEq_per_kg", "tablet"]),
  defaultRoute: z.string().trim().max(100).optional().nullable(),
  unitType: z.enum(["vial", "ampule", "tablet", "capsule", "bag"]).optional().nullable(),
  unitVolumeMl: z.number().finite().positive().optional().nullable(),
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
    genericName: row.genericName,
    brandNames: normalizeJsonStringArray(row.brandNames),
    targetSpecies: row.targetSpecies == null ? null : normalizeJsonStringArray(row.targetSpecies),
    category: row.category ?? null,
    dosageNotes: row.dosageNotes ?? null,
    concentrationMgMl: Number(row.concentrationMgMl),
    standardDose: Number(row.standardDose),
    minDose: row.minDose != null ? Number(row.minDose) : null,
    maxDose: row.maxDose != null ? Number(row.maxDose) : null,
    doseUnit: row.doseUnit as "mg_per_kg" | "mcg_per_kg" | "mEq_per_kg" | "tablet",
    defaultRoute: row.defaultRoute ?? null,
    unitType: row.unitType ?? null,
    unitVolumeMl: row.unitVolumeMl != null ? Number(row.unitVolumeMl) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function seedDefaultsIfClinicHasNoRows(clinicId: string): Promise<void> {
  await syncFormularyFromSeed(clinicId);
}

router.get("/", requireAuth, requireEffectiveRole("technician"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;

  try {
    try {
      await syncFormularyFromSeed(clinicId);
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
  const normalizedGeneric = payload.genericName.trim();
  const normalizedLowerGeneric = normalizedGeneric.toLowerCase();

  try {
    const [existing] = await db
      .select()
      .from(drugFormulary)
      .where(
        and(
          eq(drugFormulary.clinicId, clinicId),
          sql`lower(trim(${drugFormulary.genericName})) = ${normalizedLowerGeneric}`,
          eq(drugFormulary.concentrationMgMl, String(payload.concentrationMgMl)),
        ),
      )
      .limit(1);

    if (existing) {
      if (existing.deletedAt) {
        const [reactivated] = await db
          .update(drugFormulary)
          .set({
            name: normalizedName,
            genericName: normalizedGeneric,
            brandNames: payload.brandNames ?? [],
            targetSpecies: payload.targetSpecies ?? null,
            category: payload.category ?? null,
            dosageNotes: payload.dosageNotes ?? null,
            concentrationMgMl: String(payload.concentrationMgMl),
            standardDose: String(payload.standardDose),
            minDose: payload.minDose != null ? String(payload.minDose) : null,
            maxDose: payload.maxDose != null ? String(payload.maxDose) : null,
            doseUnit: payload.doseUnit,
            defaultRoute: payload.defaultRoute ?? null,
            unitType: payload.unitType ?? null,
            unitVolumeMl: payload.unitVolumeMl != null ? String(payload.unitVolumeMl) : null,
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
          reason: "FORMULARY_DUPLICATE_GENERIC_CONCENTRATION",
          message: "An active formulary entry already exists for this generic name and concentration",
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
        genericName: normalizedGeneric,
        brandNames: payload.brandNames ?? [],
        targetSpecies: payload.targetSpecies ?? null,
        category: payload.category ?? null,
        dosageNotes: payload.dosageNotes ?? null,
        concentrationMgMl: String(payload.concentrationMgMl),
        standardDose: String(payload.standardDose),
        minDose: payload.minDose != null ? String(payload.minDose) : null,
        maxDose: payload.maxDose != null ? String(payload.maxDose) : null,
        doseUnit: payload.doseUnit,
        defaultRoute: payload.defaultRoute ?? null,
        unitType: payload.unitType ?? null,
        unitVolumeMl: payload.unitVolumeMl != null ? String(payload.unitVolumeMl) : null,
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
          reason: "FORMULARY_DUPLICATE_GENERIC_CONCENTRATION",
          message: "An active formulary entry already exists for this generic name and concentration",
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

router.patch("/:id", requireAuth, requireEffectiveRole("vet"), async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  const clinicId = req.clinicId!;
  const id = req.params.id?.trim();
  if (!id) {
    return res.status(400).json(
      apiError({ code: "VALIDATION_FAILED", reason: "MISSING_ID_PARAM", message: "id param is required", requestId }),
    );
  }

  const patchSchema = z.object({
    name: z.string().trim().min(1).max(200).optional(),
    genericName: z.string().trim().min(1).max(200).optional(),
    brandNames: z.array(z.string().trim().min(1)).max(50).optional(),
    targetSpecies: z.array(z.string().trim().min(1)).max(20).optional().nullable(),
    category: z.string().trim().max(120).optional().nullable(),
    dosageNotes: z.string().trim().max(2000).optional().nullable(),
    concentrationMgMl: z.number().finite().positive().optional(),
    standardDose: z.number().finite().positive().optional(),
    minDose: z.number().finite().positive().optional().nullable(),
    maxDose: z.number().finite().positive().optional().nullable(),
    doseUnit: z.enum(["mg_per_kg", "mcg_per_kg", "mEq_per_kg", "tablet"]).optional(),
    defaultRoute: z.string().trim().max(100).optional().nullable(),
    unitType: z.enum(["vial", "ampule", "tablet", "capsule", "bag"]).optional().nullable(),
    unitVolumeMl: z.number().finite().positive().optional().nullable(),
  });
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json(
      apiError({ code: "VALIDATION_FAILED", reason: "INVALID_FORMULARY_PAYLOAD", message: "Invalid patch payload", requestId }),
    );
  }

  const patch = parsed.data;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json(
      apiError({ code: "VALIDATION_FAILED", reason: "EMPTY_PATCH", message: "No fields to update", requestId }),
    );
  }

  try {
    const now = new Date();
    const updateFields: Record<string, unknown> = { updatedAt: now };
    if (patch.name !== undefined) updateFields.name = patch.name.trim();
    if (patch.genericName !== undefined) updateFields.genericName = patch.genericName.trim();
    if (patch.brandNames !== undefined) updateFields.brandNames = patch.brandNames;
    if ("targetSpecies" in patch) updateFields.targetSpecies = patch.targetSpecies ?? null;
    if ("category" in patch) updateFields.category = patch.category ?? null;
    if ("dosageNotes" in patch) updateFields.dosageNotes = patch.dosageNotes ?? null;
    if (patch.concentrationMgMl !== undefined) updateFields.concentrationMgMl = String(patch.concentrationMgMl);
    if (patch.standardDose !== undefined) updateFields.standardDose = String(patch.standardDose);
    if ("minDose" in patch) updateFields.minDose = patch.minDose != null ? String(patch.minDose) : null;
    if ("maxDose" in patch) updateFields.maxDose = patch.maxDose != null ? String(patch.maxDose) : null;
    if (patch.doseUnit !== undefined) updateFields.doseUnit = patch.doseUnit;
    if ("defaultRoute" in patch) updateFields.defaultRoute = patch.defaultRoute ?? null;
    if ("unitType" in patch) updateFields.unitType = patch.unitType ?? null;
    if ("unitVolumeMl" in patch) updateFields.unitVolumeMl = patch.unitVolumeMl != null ? String(patch.unitVolumeMl) : null;

    let updated: typeof drugFormulary.$inferSelect | undefined;
    try {
      const rows = await db
        .update(drugFormulary)
        .set(updateFields)
        .where(and(eq(drugFormulary.id, id), eq(drugFormulary.clinicId, clinicId), isNull(drugFormulary.deletedAt)))
        .returning();
      updated = rows[0];
    } catch (err) {
      const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
      if (code === "23505") {
        return res.status(409).json(
          apiError({
            code: "CONFLICT",
            reason: "FORMULARY_DUPLICATE_GENERIC_CONCENTRATION",
            message: "Update would duplicate generic name and concentration",
            requestId,
          }),
        );
      }
      throw err;
    }

    if (!updated) {
      return res.status(404).json(
        apiError({ code: "NOT_FOUND", reason: "FORMULARY_NOT_FOUND", message: "Formulary entry not found", requestId }),
      );
    }

    return res.json(toResponseRow(updated));
  } catch (err) {
    console.error("[formulary] patch failed", err);
    return res.status(500).json(
      apiError({ code: "INTERNAL_ERROR", reason: "FORMULARY_PATCH_FAILED", message: "Failed to update formulary entry", requestId }),
    );
  }
});

router.delete("/:id", requireAuth, requireEffectiveRole("vet"), async (req, res) => {
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
