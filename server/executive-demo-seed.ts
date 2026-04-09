/**
 * VetTrack Executive Demo Seed
 * Run with: tsx server/executive-demo-seed.ts
 *
 * Full reset + high-fidelity clinic simulation for executive/staff demo.
 */
import "dotenv/config";
import { randomUUID } from "crypto";
import {
  db,
  pool,
  equipment,
  rooms,
  scanLogs,
  auditLogs,
  transferLogs,
  folders,
  bulkAuditLog,
  alertAcks,
  undoTokens,
} from "./db.js";

// ─── Staff personas ──────────────────────────────────────────────────────────
const S = {
  dan:   { id: "staff-dan-001",   name: "Dan",   email: "dan@vettrack.app" },
  aseel: { id: "staff-aseel-001", name: "Aseel", email: "aseel@vettrack.app" },
  dana:  { id: "staff-dana-001",  name: "Dana",  email: "dana@vettrack.app" },
  sigal: { id: "staff-sigal-001", name: "Sigal", email: "sigal@vettrack.app" },
  gal:   { id: "staff-gal-001",   name: "Gal",   email: "gal@vettrack.app" },
  lihi:  { id: "staff-lihi-001",  name: "Lihi",  email: "lihi@vettrack.app" },
  ofir:  { id: "staff-ofir-001",  name: "Ofir",  email: "ofir@vettrack.app" },
  guy:   { id: "staff-guy-001",   name: "Guy",   email: "guy@vettrack.app" },
};

// ─── Time helpers ─────────────────────────────────────────────────────────────
const now = new Date();
function hAgo(h: number): Date { return new Date(now.getTime() - h * 3_600_000); }
function dAgo(d: number): Date { return new Date(now.getTime() - d * 86_400_000); }

// ─── Step 1: Full wipe ───────────────────────────────────────────────────────
async function wipeAll() {
  console.log("🗑  Wiping all data…");
  // Use raw SQL to bypass the PostgreSQL RULE on vt_audit_logs
  // TRUNCATE also clears serial sequences if any; safe for UUID PKs
  await pool.query(`
    TRUNCATE TABLE
      vt_audit_logs,
      vt_bulk_audit_log,
      vt_undo_tokens,
      vt_alert_acks,
      vt_transfer_logs,
      vt_scan_logs,
      vt_equipment,
      vt_rooms,
      vt_folders
    RESTART IDENTITY CASCADE;
  `);
  console.log("   ✓ All tables cleared");
}

// ─── Step 2: Rooms ────────────────────────────────────────────────────────────
async function seedRooms() {
  console.log("🏥 Creating rooms…");
  const roomDefs = [
    { name: "ICU",         floor: "1" },
    { name: "Exam Room 1", floor: "1" },
    { name: "Kennel",      floor: "2" },
    { name: "Cattery",     floor: "2" },
  ];
  const created: Record<string, string> = {};
  for (const r of roomDefs) {
    const [row] = await db.insert(rooms).values({
      id: randomUUID(),
      name: r.name,
      floor: r.floor,
      syncStatus: "synced",
      lastAuditAt: hAgo(2),
    }).returning();
    created[r.name] = row.id;
    console.log(`   ✓ Room: ${r.name}`);
  }
  return created;
}

// ─── Step 3: Folder ───────────────────────────────────────────────────────────
async function seedFolder() {
  const [row] = await db.insert(folders).values({
    id: randomUUID(),
    name: "Hospital Equipment",
    type: "manual",
    color: "#2563EB",
  }).returning();
  return row.id;
}

// ─── Step 4: Equipment & Logs ─────────────────────────────────────────────────
async function seedEquipmentAndLogs(roomIds: Record<string, string>, folderId: string) {
  console.log("🔧 Creating equipment…");

  // ── Infusion Pumps IP-01 … IP-06 ──────────────────────────────────────────
  const pumpIds: Record<string, string> = {};

  // IP-01: OK, verified by Sigal this morning
  const ip01 = randomUUID();
  pumpIds["IP-01"] = ip01;
  await db.insert(equipment).values({
    id: ip01,
    name: "Infusion Pump IP-01",
    serialNumber: "IP-001",
    model: "Baxter Sigma Spectrum",
    manufacturer: "Baxter",
    location: "ICU",
    folderId,
    roomId: roomIds["ICU"],
    status: "ok",
    lastSeen: hAgo(3),
    lastStatus: "ok",
    lastVerifiedAt: hAgo(3),
    lastVerifiedById: S.sigal.id,
    maintenanceIntervalDays: 90,
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: ip01,
    userId: S.sigal.id, userEmail: S.sigal.email,
    status: "ok", note: "Morning rounds check — all clear",
    timestamp: hAgo(3),
  });

  // IP-02: OK, verified by Sigal this morning
  const ip02 = randomUUID();
  pumpIds["IP-02"] = ip02;
  await db.insert(equipment).values({
    id: ip02,
    name: "Infusion Pump IP-02",
    serialNumber: "IP-002",
    model: "Baxter Sigma Spectrum",
    manufacturer: "Baxter",
    location: "ICU",
    folderId,
    roomId: roomIds["ICU"],
    status: "ok",
    lastSeen: hAgo(3),
    lastStatus: "ok",
    lastVerifiedAt: hAgo(3),
    lastVerifiedById: S.sigal.id,
    maintenanceIntervalDays: 90,
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: ip02,
    userId: S.sigal.id, userEmail: S.sigal.email,
    status: "ok", note: "Morning rounds check — all clear",
    timestamp: hAgo(2.9),
  });

  // IP-03: ISSUE — battery failing, reported by Ofir on night shift
  const ip03 = randomUUID();
  pumpIds["IP-03"] = ip03;
  await db.insert(equipment).values({
    id: ip03,
    name: "Infusion Pump IP-03",
    serialNumber: "IP-003",
    model: "Baxter Sigma Spectrum",
    manufacturer: "Baxter",
    location: "ICU",
    folderId,
    roomId: roomIds["ICU"],
    status: "issue",
    lastSeen: hAgo(9),
    lastStatus: "issue",
    lastVerifiedAt: hAgo(9),
    lastVerifiedById: S.ofir.id,
    maintenanceIntervalDays: 90,
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: ip03,
    userId: S.ofir.id, userEmail: S.ofir.email,
    status: "issue",
    note: "Battery failing - spotted during night shift",
    timestamp: hAgo(9),
  });

  // IP-04: OK, checked out by Gal mid-morning
  const ip04 = randomUUID();
  pumpIds["IP-04"] = ip04;
  await db.insert(equipment).values({
    id: ip04,
    name: "Infusion Pump IP-04",
    serialNumber: "IP-004",
    model: "Baxter Sigma Spectrum",
    manufacturer: "Baxter",
    location: "ICU",
    folderId,
    roomId: roomIds["ICU"],
    status: "ok",
    lastSeen: hAgo(6),
    lastStatus: "ok",
    lastVerifiedAt: hAgo(6),
    lastVerifiedById: S.gal.id,
    maintenanceIntervalDays: 90,
    checkedOutById: S.gal.id,
    checkedOutByEmail: S.gal.email,
    checkedOutAt: hAgo(6),
    checkedOutLocation: "ICU",
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: ip04,
    userId: S.gal.id, userEmail: S.gal.email,
    status: "ok", note: "Checked out for patient in bay 3",
    timestamp: hAgo(6),
  });

  // IP-05: ISSUE — electrical fault, reported by Dan
  const ip05 = randomUUID();
  pumpIds["IP-05"] = ip05;
  await db.insert(equipment).values({
    id: ip05,
    name: "Infusion Pump IP-05",
    serialNumber: "IP-005",
    model: "Baxter Sigma Spectrum",
    manufacturer: "Baxter",
    location: "ICU",
    folderId,
    roomId: roomIds["ICU"],
    status: "issue",
    lastSeen: hAgo(5),
    lastStatus: "issue",
    lastVerifiedAt: hAgo(5),
    lastVerifiedById: S.dan.id,
    maintenanceIntervalDays: 90,
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: ip05,
    userId: S.dan.id, userEmail: S.dan.email,
    status: "issue",
    note: "Electrical fault - housing gets hot during operation. Pulled from service.",
    timestamp: hAgo(5),
  });

  // IP-06: OK, last seen this morning
  const ip06 = randomUUID();
  pumpIds["IP-06"] = ip06;
  await db.insert(equipment).values({
    id: ip06,
    name: "Infusion Pump IP-06",
    serialNumber: "IP-006",
    model: "Baxter Sigma Spectrum",
    manufacturer: "Baxter",
    location: "ICU",
    folderId,
    roomId: roomIds["ICU"],
    status: "ok",
    lastSeen: hAgo(4),
    lastStatus: "ok",
    lastVerifiedAt: hAgo(4),
    lastVerifiedById: S.sigal.id,
    maintenanceIntervalDays: 90,
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: ip06,
    userId: S.sigal.id, userEmail: S.sigal.email,
    status: "ok", note: "Verified during ICU inventory check",
    timestamp: hAgo(4),
  });

  console.log("   ✓ Infusion Pumps IP-01 → IP-06");

  // ── BP Monitor — the "shortage scenario" ──────────────────────────────────
  // Final state: back in ICU (Dan returned it per Dana's request)
  const bpMonId = randomUUID();
  await db.insert(equipment).values({
    id: bpMonId,
    name: "BP Monitor",
    serialNumber: "BPM-001",
    model: "Welch Allyn ABPM 7100",
    manufacturer: "Welch Allyn",
    location: "ICU",
    folderId,
    roomId: roomIds["ICU"],
    status: "ok",
    lastSeen: hAgo(1),
    lastStatus: "ok",
    lastVerifiedAt: hAgo(1),
    lastVerifiedById: S.dan.id,
    maintenanceIntervalDays: 180,
  });

  // Log 1: Gal moved it to Exam Room 1 (emergency)
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: bpMonId,
    userId: S.gal.id, userEmail: S.gal.email,
    status: "ok",
    note: "Emergency in Exam 1 - No other units available. Relocating from ICU.",
    timestamp: hAgo(8),
  });
  // Transfer log: ICU → Exam Room 1
  await db.insert(transferLogs).values({
    id: randomUUID(),
    equipmentId: bpMonId,
    fromFolderId: null,
    fromFolderName: "ICU",
    toFolderId: null,
    toFolderName: "Exam Room 1",
    userId: S.gal.id,
    note: "Emergency in Exam 1 - No other units available",
    timestamp: hAgo(8),
  });

  // Log 2: Dan located via Audit Log and returned to ICU
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: bpMonId,
    userId: S.dan.id, userEmail: S.dan.email,
    status: "ok",
    note: "Located unit via Audit Log - returning to ICU per Dana's request",
    timestamp: hAgo(1),
  });
  // Transfer log: Exam Room 1 → ICU
  await db.insert(transferLogs).values({
    id: randomUUID(),
    equipmentId: bpMonId,
    fromFolderId: null,
    fromFolderName: "Exam Room 1",
    toFolderId: null,
    toFolderName: "ICU",
    userId: S.dan.id,
    note: "Located via Audit Log, returned per Dana's request",
    timestamp: hAgo(1),
  });
  console.log("   ✓ BP Monitor (shortage scenario + return)");

  // ── Mindray Patient Monitor — upcoming maintenance ─────────────────────────
  const mindrayId = randomUUID();
  // nextMaintenance = 2026-04-25. Set lastMaintenanceDate so it's visible.
  const maintenanceNextDate = new Date("2026-04-25T00:00:00.000Z");
  const maintenanceIntervalDays = 30;
  const lastMaintenanceDateCalc = new Date(
    maintenanceNextDate.getTime() - maintenanceIntervalDays * 86_400_000
  );
  await db.insert(equipment).values({
    id: mindrayId,
    name: "Mindray Patient Monitor",
    serialNumber: "MPM-001",
    model: "Mindray MEC-1200",
    manufacturer: "Mindray",
    location: "ICU",
    folderId,
    roomId: roomIds["ICU"],
    status: "ok",
    lastSeen: hAgo(2),
    lastStatus: "ok",
    lastMaintenanceDate: lastMaintenanceDateCalc,
    maintenanceIntervalDays,
    lastVerifiedAt: hAgo(2),
    lastVerifiedById: S.dana.id,
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: mindrayId,
    userId: S.dana.id, userEmail: S.dana.email,
    status: "ok",
    note: `Maintenance schedule reviewed. Next due: 25 Apr 2026.`,
    timestamp: hAgo(2),
  });
  console.log("   ✓ Mindray Patient Monitor (maintenance: 2026-04-25)");

  // ── Clipper — Kennel, issue reported by Lihi ──────────────────────────────
  const clipperId = randomUUID();
  await db.insert(equipment).values({
    id: clipperId,
    name: "Grooming Clipper",
    serialNumber: "GRC-001",
    model: "Heiniger Saphir",
    manufacturer: "Heiniger",
    location: "Kennel",
    folderId,
    roomId: roomIds["Kennel"],
    status: "issue",
    lastSeen: hAgo(7),
    lastStatus: "issue",
    lastVerifiedAt: hAgo(7),
    lastVerifiedById: S.lihi.id,
    maintenanceIntervalDays: 60,
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: clipperId,
    userId: S.lihi.id, userEmail: S.lihi.email,
    status: "issue",
    note: "Blade dull - causing skin irritation. Needs replacement before next use.",
    timestamp: hAgo(7),
  });
  console.log("   ✓ Grooming Clipper (Kennel — issue)");

  // ── Glucose Meter — Cattery, STALE (forgotten in cage for 4 days) ─────────
  const glucoseId = randomUUID();
  await db.insert(equipment).values({
    id: glucoseId,
    name: "Glucose Meter",
    serialNumber: "GLU-001",
    model: "AlphaTRAK 2",
    manufacturer: "Zoetis",
    location: "Cattery",
    folderId,
    roomId: roomIds["Cattery"],
    status: "ok",
    lastSeen: dAgo(4),
    lastStatus: "ok",
    lastVerifiedAt: dAgo(4),   // 4 days ago → stale state
    lastVerifiedById: S.guy.id,
    maintenanceIntervalDays: 365,
  });
  await db.insert(scanLogs).values({
    id: randomUUID(), equipmentId: glucoseId,
    userId: S.guy.id, userEmail: S.guy.email,
    status: "ok",
    note: "Last check before holiday weekend",
    timestamp: dAgo(4),
  });
  console.log("   ✓ Glucose Meter (Cattery — stale, 4 days ago)");

  return { pumpIds, bpMonId, mindrayId, clipperId, glucoseId };
}

// ─── Step 5: 24-hour audit trail ─────────────────────────────────────────────
async function seedAuditLog(
  roomIds: Record<string, string>,
  eq: { pumpIds: Record<string, string>; bpMonId: string; mindrayId: string; clipperId: string; glucoseId: string }
) {
  console.log("📋 Generating 24-hour audit trail…");

  type AuditEntry = {
    by: typeof S[keyof typeof S];
    action: string;
    targetId?: string;
    targetType?: string;
    metadata?: Record<string, unknown>;
    ts: Date;
  };

  const entries: AuditEntry[] = [
    // T-24h: Dan — system init
    { by: S.dan, action: "system.init",
      metadata: { note: "VetTrack system initialised. All equipment registered and verified." },
      ts: hAgo(24) },

    // T-23h: Sigal — starts morning rounds
    { by: S.sigal, action: "rounds.started",
      metadata: { note: "Morning rounds started — ICU", room: "ICU" },
      ts: hAgo(23) },

    // T-22.5h: Sigal — verified IP-01
    { by: S.sigal, action: "equipment.scan",
      targetId: eq.pumpIds["IP-01"], targetType: "equipment",
      metadata: { equipmentName: "Infusion Pump IP-01", status: "ok", note: "Morning rounds check — all clear", room: "ICU" },
      ts: hAgo(22.5) },

    // T-22h: Sigal — verified IP-02
    { by: S.sigal, action: "equipment.scan",
      targetId: eq.pumpIds["IP-02"], targetType: "equipment",
      metadata: { equipmentName: "Infusion Pump IP-02", status: "ok", note: "Morning rounds check — all clear", room: "ICU" },
      ts: hAgo(22) },

    // T-21h: Sigal — verified IP-06
    { by: S.sigal, action: "equipment.scan",
      targetId: eq.pumpIds["IP-06"], targetType: "equipment",
      metadata: { equipmentName: "Infusion Pump IP-06", status: "ok", note: "Verified during ICU inventory check", room: "ICU" },
      ts: hAgo(21) },

    // T-20h: Sigal — ICU inventory complete
    { by: S.sigal, action: "rounds.completed",
      metadata: { note: "ICU morning inventory complete. 4 of 6 pumps verified OK. 2 pending.", room: "ICU", verifiedCount: 4 },
      ts: hAgo(20) },

    // T-18h: Aseel — viewed asset report
    { by: S.aseel, action: "report.viewed",
      metadata: { reportType: "asset-status", note: "Aseel viewed the weekly asset status report" },
      ts: hAgo(18) },

    // T-16h: Gal — checked out IP-04
    { by: S.gal, action: "equipment.checkout",
      targetId: eq.pumpIds["IP-04"], targetType: "equipment",
      metadata: { equipmentName: "Infusion Pump IP-04", note: "Checked out for patient in bay 3", room: "ICU" },
      ts: hAgo(16) },

    // T-15h: Gal — scanned IP-04
    { by: S.gal, action: "equipment.scan",
      targetId: eq.pumpIds["IP-04"], targetType: "equipment",
      metadata: { equipmentName: "Infusion Pump IP-04", status: "ok", note: "Checked out for patient in bay 3", room: "ICU" },
      ts: hAgo(15.5) },

    // T-14h: Gal — moved BP Monitor to Exam Room 1 (shortage emergency)
    { by: S.gal, action: "equipment.transfer",
      targetId: eq.bpMonId, targetType: "equipment",
      metadata: { equipmentName: "BP Monitor", from: "ICU", to: "Exam Room 1",
        note: "Emergency in Exam 1 - No other units available" },
      ts: hAgo(14) },

    // T-13h: Ofir — night shift starts, reports IP-03
    { by: S.ofir, action: "equipment.scan",
      targetId: eq.pumpIds["IP-03"], targetType: "equipment",
      metadata: { equipmentName: "Infusion Pump IP-03", status: "issue",
        note: "Battery failing - spotted during night shift", room: "ICU" },
      ts: hAgo(13) },

    // T-12.5h: Dan — received alert for IP-03
    { by: S.dan, action: "alert.received",
      targetId: eq.pumpIds["IP-03"], targetType: "equipment",
      metadata: { equipmentName: "Infusion Pump IP-03", alertType: "issue",
        note: "Issue alert received from Ofir. Will investigate." },
      ts: hAgo(12.5) },

    // T-12h: Dana — reviewed Mindray maintenance schedule
    { by: S.dana, action: "equipment.maintenance_review",
      targetId: eq.mindrayId, targetType: "equipment",
      metadata: { equipmentName: "Mindray Patient Monitor",
        note: "Maintenance schedule reviewed. Next service due 25 Apr 2026.", nextDue: "2026-04-25" },
      ts: hAgo(12) },

    // T-11h: Aseel — reviewed staff activity
    { by: S.aseel, action: "report.viewed",
      metadata: { reportType: "staff-activity", note: "Aseel reviewed 24-hour staff activity log" },
      ts: hAgo(11) },

    // T-10h: Dan — marked IP-05 as issue
    { by: S.dan, action: "equipment.scan",
      targetId: eq.pumpIds["IP-05"], targetType: "equipment",
      metadata: { equipmentName: "Infusion Pump IP-05", status: "issue",
        note: "Electrical fault - housing gets hot during operation. Pulled from service.", room: "ICU" },
      ts: hAgo(10) },

    // T-9h: Lihi — inspected Kennel
    { by: S.lihi, action: "rounds.started",
      metadata: { note: "Kennel equipment inspection", room: "Kennel" },
      ts: hAgo(9) },

    // T-8.5h: Lihi — reported clipper issue
    { by: S.lihi, action: "equipment.scan",
      targetId: eq.clipperId, targetType: "equipment",
      metadata: { equipmentName: "Grooming Clipper", status: "issue",
        note: "Blade dull - causing skin irritation. Needs replacement before next use.", room: "Kennel" },
      ts: hAgo(8.5) },

    // T-8h: Guy — checked Cattery
    { by: S.guy, action: "equipment.scan",
      targetId: eq.glucoseId, targetType: "equipment",
      metadata: { equipmentName: "Glucose Meter", status: "ok",
        note: "Last check before holiday weekend", room: "Cattery" },
      ts: hAgo(8) },

    // T-7h: Dana — requested BP Monitor return to ICU
    { by: S.dana, action: "equipment.request",
      targetId: eq.bpMonId, targetType: "equipment",
      metadata: { equipmentName: "BP Monitor", note: "Requesting return of BP Monitor to ICU. ICU patient requires continuous BP monitoring." },
      ts: hAgo(7) },

    // T-6h: Dan — located BP Monitor via audit log
    { by: S.dan, action: "audit_log.search",
      targetId: eq.bpMonId, targetType: "equipment",
      metadata: { equipmentName: "BP Monitor",
        note: "Located BP Monitor in Exam Room 1 via Audit Log. Confirming transfer to ICU per Dana's request." },
      ts: hAgo(6) },

    // T-5h: Dan — returned BP Monitor to ICU
    { by: S.dan, action: "equipment.transfer",
      targetId: eq.bpMonId, targetType: "equipment",
      metadata: { equipmentName: "BP Monitor", from: "Exam Room 1", to: "ICU",
        note: "Located unit via Audit Log - returning to ICU per Dana's request" },
      ts: hAgo(5) },

    // T-4h: Sigal — afternoon rounds
    { by: S.sigal, action: "rounds.completed",
      metadata: { note: "Afternoon rounds complete — ICU. IP-03 and IP-05 flagged as out of service.", room: "ICU" },
      ts: hAgo(4) },

    // T-3h: Dana — verified Mindray
    { by: S.dana, action: "equipment.scan",
      targetId: eq.mindrayId, targetType: "equipment",
      metadata: { equipmentName: "Mindray Patient Monitor", status: "ok",
        note: "Visual inspection OK. Maintenance date confirmed for 25 Apr 2026.", room: "ICU" },
      ts: hAgo(3) },

    // T-2h: Aseel — final oversight review
    { by: S.aseel, action: "report.viewed",
      metadata: { reportType: "end-of-day", note: "End-of-day oversight review. 2 equipment items flagged (IP-03, IP-05). BP Monitor returned to ICU." },
      ts: hAgo(2) },

    // T-1h: Dan — system sign-off
    { by: S.dan, action: "system.verified",
      metadata: { note: "All critical ICU equipment verified. 2 issues open (IP-03 battery, IP-05 electrical). Maintenance team notified." },
      ts: hAgo(1) },
  ];

  for (const e of entries) {
    await db.insert(auditLogs).values({
      id: randomUUID(),
      actionType: e.action,
      performedBy: e.by.name,
      performedByEmail: e.by.email,
      targetId: e.targetId ?? null,
      targetType: e.targetType ?? null,
      metadata: e.metadata ?? null,
      timestamp: e.ts,
    });
  }

  console.log(`   ✓ ${entries.length} audit log entries created (spanning 24 hours)`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║   VetTrack — Executive Demo Seed             ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  await wipeAll();
  const roomIds = await seedRooms();
  const folderId = await seedFolder();
  const eqIds = await seedEquipmentAndLogs(roomIds, folderId);
  await seedAuditLog(roomIds, eqIds);

  console.log("\n✅ Executive demo seed complete!");
  console.log("   Rooms:     ICU · Exam Room 1 · Kennel · Cattery");
  console.log("   Equipment: 10 items (6 pumps, BP Monitor, Mindray, Clipper, Glucose Meter)");
  console.log("   Staff:     Dan · Aseel · Dana · Sigal · Gal · Lihi · Ofir · Guy");
  console.log("   Audit log: 25 entries spanning last 24 hours\n");

  await pool.end();
}

main().catch((err) => {
  console.error("\n❌ Seed failed:", err);
  process.exit(1);
});
