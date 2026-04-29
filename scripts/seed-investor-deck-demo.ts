/**
 * Idempotent demo data for investor-deck screenshots (local dev).
 *
 * Prerequisites: DATABASE_URL (or POSTGRES_URL), migrations applied.
 *
 * Usage:
 *   $env:DATABASE_URL="postgresql://USER:PASS@HOST:5432/DB"; $env:NODE_ENV="development"; pnpm deck:seed
 *
 * Then dev WITHOUT Clerk so Vite uses DevAuthProvider:
 *   Unset CLERK_SECRET_KEY / VITE_CLERK_PUBLISHABLE_KEY (or leave Clerk unset locally).
 *   $env:PORT="3001"; $env:DATABASE_URL="..."; pnpm dev
 *
 * Capture PNGs:
 *   pnpm deck:capture
 */
import "dotenv/config";
import { subHours, subMinutes, subDays } from "date-fns";
import { and, eq, inArray, like } from "drizzle-orm";
import {
  animals,
  appointments,
  auditLogs,
  billingItems,
  billingLedger,
  clinics,
  containers,
  db,
  equipment,
  folders,
  hospitalizations,
  inventoryLogs,
  pool,
  users,
} from "../server/db.js";
import {
  ensureDefaultBillingItemsForClinic,
} from "../server/lib/ensure-clinic-phase2-defaults.js";
import {
  seedContainersFromBlueprint,
  syncContainerTargetQuantitiesFromBlueprint,
} from "../server/services/inventory.service.js";

const PREFIX = "investor-demo";

function resolveDbUrl(): string | undefined {
  const pg = process.env.POSTGRES_URL?.trim();
  const url = process.env.DATABASE_URL?.trim();
  return pg || url;
}

const DEV_USER_ID = "dev-admin-001";
const DEV_CLERK_ID = "dev-admin-001";
const DEFAULT_CLINIC_ID = "dev-clinic-default";

async function main(): Promise<void> {
  const force = process.argv.includes("--force");
  const dbUrl = resolveDbUrl();
  if (!dbUrl) {
    console.error("DATABASE_URL or POSTGRES_URL is required.");
    process.exit(1);
  }
  if (dbUrl.includes(".railway.internal")) {
    console.error("DATABASE_URL uses Railway private DNS — run from Railway shell or use a public TCP URL.");
    process.exit(1);
  }

  const clinicId = process.env.DEV_DEFAULT_CLINIC_ID?.trim() || DEFAULT_CLINIC_ID;
  console.info(`[deck:seed] starting (clinicId=${clinicId}, force=${force})…`);
  const now = new Date();
  const startLater = new Date(now.getTime() + 45 * 60 * 1000);
  const endLater = new Date(now.getTime() + 90 * 60 * 1000);
  const overdueStart = subHours(now, 5);
  const overdueEnd = subHours(now, 4);

  await db.insert(clinics).values({ id: clinicId }).onConflictDoNothing();

  await db
    .insert(users)
    .values({
      id: DEV_USER_ID,
      clinicId,
      clerkId: DEV_CLERK_ID,
      email: "admin@vettrack.dev",
      name: "Dev Admin",
      displayName: "Dev Admin",
      role: "admin",
      status: "active",
    })
    .onConflictDoUpdate({
      target: users.clerkId,
      set: {
        clinicId,
        email: "admin@vettrack.dev",
        name: "Dev Admin",
        displayName: "Dev Admin",
        role: "admin",
        status: "active",
      },
    });

  await ensureDefaultBillingItemsForClinic(clinicId);
  await seedContainersFromBlueprint(clinicId);
  await syncContainerTargetQuantitiesFromBlueprint();

  const [consumableBi] = await db
    .select({ id: billingItems.id, unitPriceCents: billingItems.unitPriceCents })
    .from(billingItems)
    .where(and(eq(billingItems.clinicId, clinicId), eq(billingItems.code, "DEFAULT_CONSUMABLE")))
    .limit(1);

  const [firstContainer] = await db
    .select()
    .from(containers)
    .where(eq(containers.clinicId, clinicId))
    .limit(1);

  const [existingLeakLog] = await db
    .select({ id: inventoryLogs.id })
    .from(inventoryLogs)
    .where(eq(inventoryLogs.id, `${PREFIX}-inv-adjust`))
    .limit(1);

  if (!existingLeakLog && consumableBi && firstContainer) {
    await db
      .update(containers)
      .set({ billingItemId: consumableBi.id })
      .where(eq(containers.id, firstContainer.id));

    const qb = firstContainer.currentQuantity;
    const dispensed = 14;
    const billedQty = 6;
    const afterQty = Math.max(0, qb - dispensed);

    await db.insert(inventoryLogs).values({
      id: `${PREFIX}-inv-adjust`,
      clinicId,
      containerId: firstContainer.id,
      taskId: null,
      logType: "adjustment",
      quantityBefore: qb,
      quantityAdded: -dispensed,
      quantityAfter: afterQty,
      consumedDerived: dispensed,
      variance: null,
      animalId: null,
      roomId: null,
      note: `${PREFIX}: simulated ward dispense for leakage screenshot`,
      createdByUserId: DEV_USER_ID,
    });

    await db
      .update(containers)
      .set({ currentQuantity: afterQty })
      .where(eq(containers.id, firstContainer.id));

    const unitPrice = consumableBi.unitPriceCents;
    await db
      .insert(billingLedger)
      .values({
        id: `${PREFIX}-ledger-partial`,
        clinicId,
        animalId: null,
        itemType: "CONSUMABLE",
        itemId: consumableBi.id,
        quantity: billedQty,
        unitPriceCents: unitPrice,
        totalAmountCents: billedQty * unitPrice,
        idempotencyKey: `${PREFIX}-leakage-demo-v1`,
        status: "pending",
      })
      .onConflictDoNothing();
  }

  const folderIds = {
    surgery: `${PREFIX}-fld-surgery`,
    imaging: `${PREFIX}-fld-imaging`,
    anesthesia: `${PREFIX}-fld-anesthesia`,
    dental: `${PREFIX}-fld-dental`,
  };

  for (const [name, id] of Object.entries(folderIds)) {
    await db
      .insert(folders)
      .values({
        id,
        clinicId,
        name:
          name === "surgery"
            ? "Surgery — Bay A"
            : name === "imaging"
              ? "Imaging Suite"
              : name === "anesthesia"
                ? "Anesthesia"
                : "Dental",
        type: "manual",
      })
      .onConflictDoNothing();
  }

  type EqSeed = {
    id: string;
    name: string;
    serialNumber: string;
    model: string;
    manufacturer: string;
    location: string | null;
    checkedOutLocation?: string | null;
    folderId: string | null;
    status: string;
    lastSeen: Date;
    lastStatus: string | null;
  };

  const equipmentRows: EqSeed[] = [
    {
      id: `${PREFIX}-eq-crash-cart`,
      name: "Emergency crash cart",
      serialNumber: "CRASH-01",
      model: "Emergency cart",
      manufacturer: "Technimount",
      location: "ICU — Station 2",
      folderId: folderIds.surgery,
      status: "critical",
      lastSeen: subMinutes(now, 4),
      lastStatus: "critical",
    },
    {
      id: `${PREFIX}-eq-defib`,
      name: "Defibrillator",
      serialNumber: "DEF-204",
      model: "HeartStart",
      manufacturer: "Philips",
      location: "Treatment room 1",
      checkedOutLocation: "Treatment room 1",
      folderId: folderIds.surgery,
      status: "needs_attention",
      lastSeen: subMinutes(now, 12),
      lastStatus: "ok",
    },
    {
      id: `${PREFIX}-eq-monitor`,
      name: "Multi-parameter monitor",
      serialNumber: "MON-991",
      model: "MX700",
      manufacturer: "Mindray",
      location: "Recovery ward",
      folderId: folderIds.surgery,
      status: "ok",
      lastSeen: subMinutes(now, 2),
      lastStatus: "ok",
    },
    {
      id: `${PREFIX}-eq-xray`,
      name: "Digital radiography",
      serialNumber: "DRX-55",
      model: "DRX-Evolution Plus",
      manufacturer: "Carestream",
      location: "Radiology",
      folderId: folderIds.imaging,
      status: "ok",
      lastSeen: subHours(now, 1),
      lastStatus: "ok",
    },
    {
      id: `${PREFIX}-eq-anes`,
      name: "Anesthesia workstation",
      serialNumber: "ANS-440",
      model: "Aisys CS²",
      manufacturer: "GE",
      location: "Theatre 1",
      folderId: folderIds.anesthesia,
      status: "maintenance",
      lastSeen: subHours(now, 6),
      lastStatus: "maintenance",
    },
    {
      id: `${PREFIX}-eq-drill`,
      name: "Dental high-speed handpiece",
      serialNumber: "DNT-HP-02",
      model: "Midwest Quiet-Air",
      manufacturer: "Dentsply",
      location: "Dental",
      folderId: folderIds.dental,
      status: "issue",
      lastSeen: subHours(now, 20),
      lastStatus: "issue",
    },
    {
      id: `${PREFIX}-eq-pump`,
      name: "Syringe infusion pump",
      serialNumber: "PMP-778",
      model: "Alaris PC",
      manufacturer: "BD",
      location: "ICU — Bay 3",
      folderId: folderIds.surgery,
      status: "ok",
      lastSeen: now,
      lastStatus: "ok",
    },
  ];

  if (force) {
    await db
      .delete(equipment)
      .where(and(eq(equipment.clinicId, clinicId), like(equipment.id, `${PREFIX}%`)));
  }

  for (const row of equipmentRows) {
    await db
      .insert(equipment)
      .values({
        id: row.id,
        clinicId,
        name: row.name,
        serialNumber: row.serialNumber,
        model: row.model,
        manufacturer: row.manufacturer,
        location: row.location,
        folderId: row.folderId,
        status: row.status,
        lastSeen: row.lastSeen,
        lastStatus: row.lastStatus,
        checkedOutLocation: row.checkedOutLocation ?? null,
        checkedOutById: null,
        checkedOutByEmail: null,
        checkedOutAt: null,
        maintenanceIntervalDays: row.status === "maintenance" ? 180 : 90,
      })
      .onConflictDoUpdate({
        target: equipment.id,
        set: {
          name: row.name,
          serialNumber: row.serialNumber,
          model: row.model,
          manufacturer: row.manufacturer,
          location: row.location,
          folderId: row.folderId,
          status: row.status,
          lastSeen: row.lastSeen,
          lastStatus: row.lastStatus,
          checkedOutLocation: row.checkedOutLocation ?? null,
        },
      });
  }

  const auditSamples: {
    id: string;
    actionType: string;
    performedBy: string;
    performedByEmail: string;
    targetId: string | null;
    targetType: string | null;
    metadata: Record<string, unknown> | null;
    timestamp: Date;
  }[] = [
    {
      id: `${PREFIX}-audit-1`,
      actionType: "CHECKOUT",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-monitor`,
      targetType: "equipment",
      metadata: { location: "Recovery ward" },
      timestamp: subMinutes(now, 25),
    },
    {
      id: `${PREFIX}-audit-2`,
      actionType: "RETURN",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-pump`,
      targetType: "equipment",
      metadata: { note: "Returned after flush" },
      timestamp: subMinutes(now, 40),
    },
    {
      id: `${PREFIX}-audit-3`,
      actionType: "EQUIPMENT_VERIFY",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-crash-cart`,
      targetType: "equipment",
      metadata: { scanned: true },
      timestamp: subMinutes(now, 8),
    },
    {
      id: `${PREFIX}-audit-4`,
      actionType: "USER_ROLE_CHANGE",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: DEV_USER_ID,
      targetType: "user",
      metadata: { role: "admin" },
      timestamp: subHours(now, 30),
    },
    {
      id: `${PREFIX}-audit-5`,
      actionType: "EQUIPMENT_CREATED",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-defib`,
      targetType: "equipment",
      metadata: { name: "Defibrillator" },
      timestamp: subHours(now, 2),
    },
    {
      id: `${PREFIX}-audit-6`,
      actionType: "CHECKOUT",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-xray`,
      targetType: "equipment",
      metadata: { location: "Radiology" },
      timestamp: subMinutes(now, 90),
    },
    {
      id: `${PREFIX}-audit-7`,
      actionType: "EQUIPMENT_VERIFY",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-anes`,
      targetType: "equipment",
      metadata: { scanned: true, location: "Theatre 1" },
      timestamp: subMinutes(now, 55),
    },
    {
      id: `${PREFIX}-audit-8`,
      actionType: "EQUIPMENT_UPDATED",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-drill`,
      targetType: "equipment",
      metadata: { status: "needs_attention", note: "Reported issue" },
      timestamp: subDays(now, 1),
    },
    {
      id: `${PREFIX}-audit-9`,
      actionType: "RETURN",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-monitor`,
      targetType: "equipment",
      metadata: { location: "Recovery ward" },
      timestamp: subHours(now, 3),
    },
    {
      id: `${PREFIX}-audit-10`,
      actionType: "EQUIPMENT_VERIFY",
      performedBy: DEV_USER_ID,
      performedByEmail: "admin@vettrack.dev",
      targetId: `${PREFIX}-eq-pump`,
      targetType: "equipment",
      metadata: { scanned: true, location: "ICU — Bay 3" },
      timestamp: subMinutes(now, 15),
    },
  ];

  // vt_audit_logs has PostgreSQL RULEs (immutable audit); INSERT ... ON CONFLICT is not allowed.
  const auditIds = auditSamples.map((a) => a.id);
  const existingAudit = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(inArray(auditLogs.id, auditIds));
  const existingAuditIds = new Set(existingAudit.map((r) => r.id));

  for (const a of auditSamples) {
    if (existingAuditIds.has(a.id)) continue;
    await db.insert(auditLogs).values({
      id: a.id,
      clinicId,
      actionType: a.actionType,
      performedBy: a.performedBy,
      performedByEmail: a.performedByEmail,
      targetId: a.targetId,
      targetType: a.targetType,
      metadata: a.metadata,
      timestamp: a.timestamp,
    });
  }

  await db
    .insert(animals)
    .values({
      id: `${PREFIX}-animal-1`,
      clinicId,
      name: "Luna",
      species: "Canine",
      recordNumber: `${PREFIX.toUpperCase()}-5012`,
      weightKg: "12.4",
    })
    .onConflictDoNothing();

  await db
    .insert(hospitalizations)
    .values({
      id: `${PREFIX}-hosp-1`,
      clinicId,
      animalId: `${PREFIX}-animal-1`,
      admittedAt: subHours(now, 14),
      dischargedAt: null,
      status: "observation",
      ward: "ICU",
      bay: "Bay 2",
      admissionReason: "Post-op monitoring",
      admittingVetId: DEV_USER_ID,
    })
    .onConflictDoNothing();

  await db
    .insert(appointments)
    .values({
      id: `${PREFIX}-appt-med-active`,
      clinicId,
      animalId: `${PREFIX}-animal-1`,
      ownerId: null,
      vetId: DEV_USER_ID,
      startTime: now,
      endTime: startLater,
      scheduledAt: now,
      completedAt: null,
      status: "in_progress",
      conflictOverride: false,
      notes: "IV medication — verify weight",
      metadata: {
        drugName: "Meloxicam",
        medicationName: "Meloxicam 2 mg/mL injectable",
        route: "SC",
        vetApproved: true,
        scheduled_at: now.toISOString(),
      },
      priority: "high",
      taskType: "medication",
      containerId: null,
    })
    .onConflictDoNothing();

  await db
    .insert(appointments)
    .values({
      id: `${PREFIX}-appt-overdue`,
      clinicId,
      animalId: `${PREFIX}-animal-1`,
      ownerId: null,
      vetId: DEV_USER_ID,
      startTime: overdueStart,
      endTime: overdueEnd,
      scheduledAt: overdueStart,
      completedAt: null,
      status: "pending",
      conflictOverride: false,
      notes: "Scheduled antibiotic — overdue follow-up",
      metadata: {
        drugName: "Cefazolin",
        medicationName: "Cefazolin 100 mg/mL",
        route: "IV",
        scheduled_at: overdueStart.toISOString(),
      },
      priority: "normal",
      taskType: "medication",
      containerId: null,
    })
    .onConflictDoNothing();

  console.info(`Investor demo seed OK for clinic ${clinicId} (${equipmentRows.length} equipment rows).`);
  console.info(`Re-run is safe; use --force to replace demo equipment rows for this clinic only.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await pool.end();
  });
