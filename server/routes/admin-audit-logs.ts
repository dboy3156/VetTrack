import { Router } from "express";
import { db, scanLogs, transferLogs, equipment, users } from "../db.js";
import { desc, eq, and, gte, lte, ilike, or, sql } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

/*
 * PERMISSIONS MATRIX — /api/admin/audit-logs
 * ─────────────────────────────────────────────────────
 * GET  /   admin only   Paginated audit log viewer with filters
 * ─────────────────────────────────────────────────────
 */

const router = Router();

const PAGE_SIZE = 50;

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const {
      user: userFilter,
      action,
      from,
      to,
      page,
    } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || "1", 10));
    const offset = (pageNum - 1) * PAGE_SIZE;

    const fromDate = from ? new Date(from) : null;
    const toDate = to ? new Date(to + "T23:59:59.999Z") : null;

    const scanWheres = [];
    const transferWheres = [];

    if (fromDate && !isNaN(fromDate.getTime())) {
      scanWheres.push(gte(scanLogs.timestamp, fromDate));
      transferWheres.push(gte(transferLogs.timestamp, fromDate));
    }
    if (toDate && !isNaN(toDate.getTime())) {
      scanWheres.push(lte(scanLogs.timestamp, toDate));
      transferWheres.push(lte(transferLogs.timestamp, toDate));
    }
    if (userFilter) {
      scanWheres.push(
        or(
          ilike(scanLogs.userEmail, `%${userFilter}%`),
          ilike(scanLogs.userId, `%${userFilter}%`)
        )!
      );
      transferWheres.push(
        ilike(users.email, `%${userFilter}%`)
      );
    }

    const wantScans = !action || action === "scan";
    const wantTransfers = !action || action === "transfer";

    let scans: {
      id: string;
      type: "scan";
      equipmentId: string | null;
      equipmentName: string;
      userId: string;
      userEmail: string;
      userName: string;
      action: string;
      details: string;
      timestamp: string;
    }[] = [];

    let transfers: {
      id: string;
      type: "transfer";
      equipmentId: string | null;
      equipmentName: string;
      userId: string;
      userEmail: string;
      userName: string;
      action: string;
      details: string;
      timestamp: string;
    }[] = [];

    if (wantScans) {
      const rows = await db
        .select({
          id: scanLogs.id,
          equipmentId: scanLogs.equipmentId,
          equipmentName: equipment.name,
          userId: scanLogs.userId,
          userEmail: scanLogs.userEmail,
          status: scanLogs.status,
          note: scanLogs.note,
          timestamp: scanLogs.timestamp,
        })
        .from(scanLogs)
        .leftJoin(equipment, eq(scanLogs.equipmentId, equipment.id))
        .where(scanWheres.length > 0 ? and(...scanWheres) : undefined)
        .orderBy(desc(scanLogs.timestamp))
        .limit(PAGE_SIZE * 3);

      scans = rows.map((r) => ({
        id: r.id,
        type: "scan" as const,
        equipmentId: r.equipmentId ?? null,
        equipmentName: r.equipmentName || "Unknown Equipment",
        userId: r.userId,
        userEmail: r.userEmail,
        userName: r.userEmail,
        action: "scan",
        details: buildScanDetails(r.userEmail, r.equipmentName || "Unknown Equipment", r.status, r.note),
        timestamp: new Date(r.timestamp).toISOString(),
      }));
    }

    if (wantTransfers) {
      const rows = await db
        .select({
          id: transferLogs.id,
          equipmentId: transferLogs.equipmentId,
          equipmentName: equipment.name,
          userId: transferLogs.userId,
          userEmail: sql<string>`COALESCE(${users.email}, '')`,
          userName: sql<string>`COALESCE(${users.name}, ${users.email}, '')`,
          fromFolderName: transferLogs.fromFolderName,
          toFolderName: transferLogs.toFolderName,
          note: transferLogs.note,
          timestamp: transferLogs.timestamp,
        })
        .from(transferLogs)
        .leftJoin(equipment, eq(transferLogs.equipmentId, equipment.id))
        .leftJoin(users, eq(transferLogs.userId, users.id))
        .where(transferWheres.length > 0 ? and(...transferWheres) : undefined)
        .orderBy(desc(transferLogs.timestamp))
        .limit(PAGE_SIZE * 3);

      transfers = rows.map((r) => ({
        id: r.id,
        type: "transfer" as const,
        equipmentId: r.equipmentId ?? null,
        equipmentName: r.equipmentName || "Unknown Equipment",
        userId: r.userId,
        userEmail: r.userEmail,
        userName: r.userName || r.userEmail,
        action: "transfer",
        details: buildTransferDetails(r.userEmail, r.equipmentName || "Unknown Equipment", r.fromFolderName, r.toFolderName),
        timestamp: new Date(r.timestamp).toISOString(),
      }));
    }

    const combined = [...scans, ...transfers]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const total = combined.length;
    const paginated = combined.slice(offset, offset + PAGE_SIZE);
    const hasMore = offset + PAGE_SIZE < total;

    res.json({
      items: paginated,
      page: pageNum,
      pageSize: PAGE_SIZE,
      hasMore,
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get audit logs" });
  }
});

function buildScanDetails(
  userEmail: string,
  equipmentName: string,
  status: string,
  note: string | null | undefined
): string {
  const statusLabel: Record<string, string> = {
    ok: "OK",
    issue: "Issue",
    maintenance: "Maintenance",
    sterilized: "Sterilized",
  };
  const label = statusLabel[status] || status;
  let detail = `${userEmail} marked ${equipmentName} as ${label}`;
  if (note) detail += ` — "${note}"`;
  return detail;
}

function buildTransferDetails(
  userEmail: string,
  equipmentName: string,
  fromFolder: string | null | undefined,
  toFolder: string | null | undefined
): string {
  const from = fromFolder || "Unfiled";
  const to = toFolder || "Unfiled";
  return `${userEmail} moved ${equipmentName} from ${from} to ${to}`;
}

export default router;
