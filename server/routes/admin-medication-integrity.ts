import { Router, type Response } from "express";
import { randomUUID } from "crypto";
import { and, desc, eq, isNotNull, isNull, lt } from "drizzle-orm";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import {
  animals,
  billingLedger,
  db,
  hospitalizations,
  inventoryLogs,
} from "../db.js";

const router = Router();

function resolveRequestId(
  res: { getHeader: (name: string) => unknown; setHeader?: (name: string, value: string) => void },
  incomingHeader: unknown,
): string {
  const incoming = typeof incomingHeader === "string" ? incomingHeader.trim() : "";
  const existing = res.getHeader("x-request-id");
  const fromRes = typeof existing === "string" ? existing.trim() : "";
  const requestId = incoming || fromRes || randomUUID();
  if (typeof res.setHeader === "function") {
    res.setHeader("x-request-id", requestId);
  }
  return requestId;
}

/**
 * GET /api/admin/medication-integrity
 * Dispense rows vs active hospitalization (management / integration oversight).
 */
router.get("/medication-integrity", requireAuth, requireAdmin, async (req, res: Response) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId?.trim();
    if (!clinicId) {
      res.status(400).json({
        code: "MISSING_CLINIC_ID",
        error: "MISSING_CLINIC_ID",
        reason: "MISSING_CLINIC_ID",
        message: "clinicId is required",
        requestId,
      });

      return;
    }

    const rows = await db
      .select({
        inventoryLogId: inventoryLogs.id,
        createdAt: inventoryLogs.createdAt,
        animalId: inventoryLogs.animalId,
        animalName: animals.name,
        containerId: inventoryLogs.containerId,
        quantityAdded: inventoryLogs.quantityAdded,
        billingEventId: inventoryLogs.billingEventId,
        billingTotalCents: billingLedger.totalAmountCents,
        billingStatus: billingLedger.status,
        activeHospitalizationId: hospitalizations.id,
      })
      .from(inventoryLogs)
      .leftJoin(animals, and(eq(animals.id, inventoryLogs.animalId), eq(animals.clinicId, clinicId)))
      .leftJoin(
        billingLedger,
        and(eq(billingLedger.id, inventoryLogs.billingEventId), eq(billingLedger.clinicId, clinicId)),
      )
      .leftJoin(
        hospitalizations,
        and(
          eq(hospitalizations.clinicId, clinicId),
          eq(hospitalizations.animalId, inventoryLogs.animalId),
          isNull(hospitalizations.dischargedAt),
        ),
      )
      .where(
        and(
          eq(inventoryLogs.clinicId, clinicId),
          eq(inventoryLogs.logType, "adjustment"),
          lt(inventoryLogs.quantityAdded, 0),
          isNotNull(inventoryLogs.animalId),
        ),
      )
      .orderBy(desc(inventoryLogs.createdAt))
      .limit(400);

    const enriched = rows.map((r) => {
      const flags: string[] = [];
      if (r.animalId && !r.activeHospitalizationId) {
        flags.push("NO_ACTIVE_HOSPITALIZATION");
      }
      return {
        ...r,
        discrepancyFlags: flags,
      };
    });

    res.status(200).json({
      clinicId,
      rows: enriched,
      requestId,
    });
  } catch (err) {
    console.error("[admin-medication-integrity]", err);
    res.status(500).json({
      code: "INTERNAL_ERROR",
      error: "INTERNAL_ERROR",
      reason: "INTERNAL_ERROR",
      message: "Failed to load medication integrity report",
      requestId,
    });
  }
});

export default router;
