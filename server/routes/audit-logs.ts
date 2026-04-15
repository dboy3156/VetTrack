import { Router } from "express";
import { db, auditLogs } from "../db.js";
import { desc, eq, and, gte, lte, ilike } from "drizzle-orm";
import { requireAuth, requireAdmin } from "../middleware/auth.js";

const router = Router();

const PAGE_SIZE = 50;

router.get("/", requireAuth, requireAdmin, async (req, res) => {
  try {
    const clinicId = req.clinicId!;
    const { actionType, performedBy, from, to, page } = req.query as Record<string, string | undefined>;

    const pageNum = Math.max(1, parseInt(page || "1", 10));
    const offset = (pageNum - 1) * PAGE_SIZE;

    const conditions = [eq(auditLogs.clinicId, clinicId)];

    if (actionType) {
      conditions.push(eq(auditLogs.actionType, actionType));
    }

    // Case-insensitive partial name match — "sig" matches "Sigal", "dana" matches "Dana"
    if (performedBy && performedBy.trim()) {
      conditions.push(ilike(auditLogs.performedBy, `%${performedBy.trim()}%`));
    }

    if (from) {
      const fromDate = new Date(from);
      if (!isNaN(fromDate.getTime())) {
        conditions.push(gte(auditLogs.timestamp, fromDate));
      }
    }

    if (to) {
      const toDate = new Date(to);
      if (!isNaN(toDate.getTime())) {
        toDate.setHours(23, 59, 59, 999);
        conditions.push(lte(auditLogs.timestamp, toDate));
      }
    }

    const query = db
      .select()
      .from(auditLogs)
      .orderBy(desc(auditLogs.timestamp))
      .limit(PAGE_SIZE + 1)
      .offset(offset);

    const rows = conditions.length > 0
      ? await query.where(and(...conditions))
      : await query;

    const hasMore = rows.length > PAGE_SIZE;
    const items = rows.slice(0, PAGE_SIZE);

    res.json({
      items,
      hasMore,
      page: pageNum,
      pageSize: PAGE_SIZE,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

export default router;
