import { Router } from "express";
import { db, equipment, scanLogs } from "../db.js";
import { gte, desc, eq, and, isNull, sql } from "drizzle-orm";
import { requireAuth } from "../middleware/auth.js";
import { subDays } from "date-fns";
import { analyticsCache } from "../lib/analytics-cache.js";
import { computeUsageTrends } from "../lib/analytics-engine.js";
import { INACTIVE_THRESHOLD_DAYS } from "../../shared/constants.js";

/*
 * PERMISSIONS MATRIX — /api/analytics
 * ─────────────────────────────────────────────────────
 * GET  /   viewer+   Aggregate dashboard statistics
 * ─────────────────────────────────────────────────────
 * Viewer read access is intentional — dashboard stats are informational
 * and do not expose any PII or mutation capability.
 */

const router = Router();

router.get("/", requireAuth, async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const cached = analyticsCache.get(clinicId);
    if (cached) {
      res.setHeader("X-Analytics-Cache", "HIT");
      return res.json(cached);
    }

    const allEquipment = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.clinicId, clinicId), isNull(equipment.deletedAt)));
    const total = allEquipment.length;

    const statusBreakdown = {
      ok: 0,
      issue: 0,
      maintenance: 0,
      sterilized: 0,
      overdue: 0,
      inactive: 0,
    };

    const now = new Date();
    const inactiveCutoff = subDays(now, INACTIVE_THRESHOLD_DAYS);
    const sevenDaysAgo = subDays(now, 7);

    for (const item of allEquipment) {
      const status = (item.status || "ok") as string;
      if (status in statusBreakdown) {
        statusBreakdown[status as keyof typeof statusBreakdown]++;
      }

      if (item.maintenanceIntervalDays && item.lastMaintenanceDate) {
        const dueDate = new Date(item.lastMaintenanceDate);
        dueDate.setDate(dueDate.getDate() + item.maintenanceIntervalDays);
        if (now > dueDate) statusBreakdown.overdue++;
      }

      if (!item.lastSeen || new Date(item.lastSeen) < inactiveCutoff) {
        statusBreakdown.inactive++;
      }
    }

    const withMaintenance = allEquipment.filter(
      (e) => e.maintenanceIntervalDays && e.maintenanceIntervalDays > 0
    );
    const compliant = withMaintenance.filter((e) => {
      if (!e.lastMaintenanceDate) return false;
      const dueDate = new Date(e.lastMaintenanceDate);
      dueDate.setDate(dueDate.getDate() + e.maintenanceIntervalDays!);
      return now <= dueDate;
    });
    const maintenanceComplianceRate =
      withMaintenance.length > 0
        ? Math.round((compliant.length / withMaintenance.length) * 100)
        : 100;

    const withSterilization = allEquipment.filter((e) => e.lastSterilizationDate);
    const sterilizationCompliant = withSterilization.filter(
      (e) => new Date(e.lastSterilizationDate!) >= sevenDaysAgo
    );
    const sterilizationComplianceRate =
      withSterilization.length > 0
        ? Math.round((sterilizationCompliant.length / withSterilization.length) * 100)
        : 100;

    const thirtyDaysAgo = subDays(now, 29);
    const recentScans = await db
      .select()
      .from(scanLogs)
      .where(and(eq(scanLogs.clinicId, clinicId), gte(scanLogs.timestamp, thirtyDaysAgo)))
      .orderBy(desc(scanLogs.timestamp));

    const scanActivity = computeUsageTrends(recentScans);

    // Single grouped query (JOIN + GROUP BY + LIMIT) avoids N+1 lookups.
    const topProblemEquipment = await db
      .select({
        equipmentId: scanLogs.equipmentId,
        name: sql<string>`COALESCE(${equipment.name}, 'Unknown')`,
        issueCount: sql<number>`count(*)::int`,
      })
      .from(scanLogs)
      .leftJoin(equipment, and(eq(scanLogs.equipmentId, equipment.id), eq(equipment.clinicId, clinicId)))
      .where(
        and(
          eq(scanLogs.clinicId, clinicId),
          gte(scanLogs.timestamp, thirtyDaysAgo),
          eq(scanLogs.status, "issue")
        )
      )
      // Keep deleted equipment in history; no deletedAt filter by design.
      .groupBy(scanLogs.equipmentId, equipment.name)
      .orderBy(desc(sql`count(*)`))
      .limit(5);

    const payload = {
      totalEquipment: total,
      statusBreakdown,
      maintenanceComplianceRate,
      sterilizationComplianceRate,
      scanActivity,
      topProblemEquipment,
    };

    analyticsCache.set(clinicId, payload);
    res.setHeader("X-Analytics-Cache", "MISS");
    res.json(payload);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

export default router;
