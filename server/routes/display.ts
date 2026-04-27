// server/routes/display.ts
import { randomUUID } from "crypto";
import { Router } from "express";
import { and, desc, eq, gte, inArray, isNull, lt, lte, notInArray, sql } from "drizzle-orm";
import {
  db,
  animals,
  appointments,
  codeBlueSessions,
  codeBlueLogEntries,
  codeBluePresence,
  crashCartChecks,
  equipment,
  hospitalizations,
  shifts,
  users,
} from "../db.js";
import { requireAuth } from "../middleware/auth.js";

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

router.get("/snapshot", requireAuth, async (req, res) => {
  const requestId = resolveRequestId(res, req.headers["x-request-id"]);
  try {
    const clinicId = req.clinicId!;
    const now = new Date();
    const twoHoursLater = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // ── 1. Active hospitalizations ─────────────────────────────────────────
    const hospRows = await db
      .select({ hosp: hospitalizations, animal: animals, vetName: users.name })
      .from(hospitalizations)
      .innerJoin(animals, eq(hospitalizations.animalId, animals.id))
      .leftJoin(users, eq(hospitalizations.admittingVetId, users.id))
      .where(
        and(
          eq(hospitalizations.clinicId, clinicId),
          notInArray(hospitalizations.status, ["discharged", "deceased"]),
        ),
      )
      .orderBy(hospitalizations.admittedAt);

    // ── 2. Overdue medication tasks ────────────────────────────────────────
    const overdueRows = await db
      .select({
        animalId: appointments.animalId,
        startTime: appointments.startTime,
        notes: appointments.notes,
        taskType: appointments.taskType,
      })
      .from(appointments)
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          inArray(appointments.status, ["pending", "assigned"]),
          lt(appointments.startTime, now),
          sql`${appointments.animalId} is not null`,
        ),
      )
      .orderBy(appointments.startTime);

    // Group overdue by animalId
    const overdueByAnimal = new Map<
      string,
      Array<{ startTime: Date; notes: string | null; taskType: string | null }>
    >();
    for (const row of overdueRows) {
      if (!row.animalId) continue;
      if (!overdueByAnimal.has(row.animalId)) overdueByAnimal.set(row.animalId, []);
      overdueByAnimal.get(row.animalId)!.push({
        startTime: row.startTime,
        notes: row.notes,
        taskType: row.taskType,
      });
    }

    // ── 3. Upcoming tasks (next 2h) ────────────────────────────────────────
    const upcomingRows = await db
      .select({
        id: appointments.id,
        startTime: appointments.startTime,
        taskType: appointments.taskType,
        notes: appointments.notes,
        status: appointments.status,
        animalName: animals.name,
      })
      .from(appointments)
      .innerJoin(animals, eq(appointments.animalId, animals.id))
      .where(
        and(
          eq(appointments.clinicId, clinicId),
          inArray(appointments.status, ["pending", "assigned", "scheduled"]),
          gte(appointments.startTime, now),
          lte(appointments.startTime, twoHoursLater),
        ),
      )
      .orderBy(appointments.startTime)
      .limit(20);

    // ── 4. Equipment ───────────────────────────────────────────────────────
    const equipRows = await db
      .select()
      .from(equipment)
      .where(and(eq(equipment.clinicId, clinicId), isNull(equipment.deletedAt)));

    // ── 5. Active alert count (equipment with critical/issue/needs_attention) ─
    const [alertCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(equipment)
      .where(
        and(
          eq(equipment.clinicId, clinicId),
          isNull(equipment.deletedAt),
          inArray(equipment.status, ["critical", "issue", "needs_attention"]),
        ),
      );

    // ── 6. Current shift ───────────────────────────────────────────────────
    const todayDate = now.toISOString().slice(0, 10); // "YYYY-MM-DD"
    const nowTimeStr = now.toTimeString().slice(0, 5); // "HH:MM"
    const shiftRows = await db
      .select()
      .from(shifts)
      .where(
        and(
          eq(shifts.clinicId, clinicId),
          eq(shifts.date, todayDate),
          lte(shifts.startTime, nowTimeStr),
          gte(shifts.endTime, nowTimeStr),
        ),
      );

    // ── 7. Crash cart — latest check ───────────────────────────────────────
    const [latestCart] = await db
      .select()
      .from(crashCartChecks)
      .where(eq(crashCartChecks.clinicId, clinicId))
      .orderBy(desc(crashCartChecks.performedAt))
      .limit(1);

    // ── 8. Active Code Blue session ────────────────────────────────────────
    const [activeSession] = await db
      .select()
      .from(codeBlueSessions)
      .where(
        and(eq(codeBlueSessions.clinicId, clinicId), eq(codeBlueSessions.status, "active")),
      );

    let codeBluePayload = null;
    if (activeSession) {
      const logEntries = await db
        .select()
        .from(codeBlueLogEntries)
        .where(eq(codeBlueLogEntries.sessionId, activeSession.id))
        .orderBy(codeBlueLogEntries.elapsedMs);

      const presence = await db
        .select()
        .from(codeBluePresence)
        .where(eq(codeBluePresence.sessionId, activeSession.id));

      let patientName: string | null = null;
      let patientWeight: number | null = null;
      let patientSpecies: string | null = null;
      let cbWard: string | null = null;
      let cbBay: string | null = null;

      if (activeSession.patientId) {
        const [animal] = await db
          .select()
          .from(animals)
          .where(eq(animals.id, activeSession.patientId));
        if (animal) {
          patientName = animal.name;
          patientWeight = animal.weightKg ? Number(animal.weightKg) : null;
          patientSpecies = animal.species ?? null;
        }
        const [cbHosp] = await db
          .select()
          .from(hospitalizations)
          .where(
            and(
              eq(hospitalizations.animalId, activeSession.patientId),
              notInArray(hospitalizations.status, ["discharged", "deceased"]),
            ),
          );
        if (cbHosp) {
          cbWard = cbHosp.ward;
          cbBay = cbHosp.bay;
        }
      }

      codeBluePayload = {
        id: activeSession.id,
        startedAt: activeSession.startedAt.toISOString(),
        managerUserName: activeSession.managerUserName,
        patientId: activeSession.patientId,
        patientName,
        patientWeight,
        patientSpecies,
        ward: cbWard,
        bay: cbBay,
        preCheckPassed: activeSession.preCheckPassed,
        pushSentAt: activeSession.startedAt.toISOString(),
        logEntries: logEntries.map((e) => ({
          elapsedMs: e.elapsedMs,
          label: e.label,
          category: e.category,
          loggedByName: e.loggedByName,
        })),
        presence: presence.map((p) => ({
          userId: p.userId,
          userName: p.userName,
          lastSeenAt: p.lastSeenAt.toISOString(),
        })),
      };
    }

    // ── Build response ─────────────────────────────────────────────────────
    const hospData = hospRows.map(({ hosp, animal, vetName }) => {
      const overdueList = overdueByAnimal.get(hosp.animalId) ?? [];
      let overdueLabel: string | null = null;
      if (overdueList.length > 0) {
        const first = overdueList[0];
        const minutesLate = Math.floor((now.getTime() - first.startTime.getTime()) / 60_000);
        const drugName = first.notes ?? "תרופה";
        const timeStr = first.startTime.toLocaleTimeString("he-IL", {
          hour: "2-digit",
          minute: "2-digit",
        });
        overdueLabel = `${drugName} — ${timeStr} (${minutesLate} דק׳ באיחור)`;
      }
      return {
        id: hosp.id,
        status: hosp.status,
        ward: hosp.ward,
        bay: hosp.bay,
        admittingVetName: vetName ?? null,
        admittedAt: hosp.admittedAt.toISOString(),
        animal: {
          name: animal.name,
          species: animal.species,
          breed: animal.breed,
          weightKg: animal.weightKg ? Number(animal.weightKg) : null,
        },
        overdueTaskCount: overdueList.length,
        overdueTaskLabel: overdueLabel,
      };
    });

    res.json({
      currentTime: now.toISOString(),
      currentShift: shiftRows.map((s) => ({
        employeeName: s.employeeName,
        role: s.role,
      })),
      hospitalizations: hospData,
      equipment: equipRows.map((e) => ({
        id: e.id,
        name: e.name,
        status: e.status,
        inUse: !!e.checkedOutAt,
        location: e.checkedOutLocation ?? e.location ?? null,
      })),
      upcomingTasks: upcomingRows.map((r) => ({
        id: r.id,
        startTime: r.startTime.toISOString(),
        taskType: r.taskType,
        notes: r.notes,
        animalName: r.animalName,
        status: r.status,
      })),
      activeAlertCount: alertCountRow?.count ?? 0,
      totalOverdueCount: overdueRows.filter((r) => r.animalId).length,
      crashCartStatus: latestCart
        ? {
            lastCheckedAt: latestCart.performedAt.toISOString(),
            allPassed: latestCart.allPassed,
            performedByName: latestCart.performedByName,
          }
        : null,
      codeBlueSession: codeBluePayload,
    });
  } catch (err) {
    console.error("[display snapshot]", err);
    res.status(500).json(
      apiError({
        code: "INTERNAL_ERROR",
        reason: "SNAPSHOT_FAILED",
        message: "Failed to load display snapshot",
        requestId,
      }),
    );
  }
});

export default router;
