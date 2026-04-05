import { pool, initDb } from "./db.js";
import { randomUUID } from "crypto";
import { subDays } from "date-fns";

async function seed() {
  await initDb();

  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query(
      "SELECT COUNT(*) FROM vt_equipment"
    );
    if (parseInt(existing[0].count) > 0) {
      console.log("Database already has data, skipping seed.");
      return;
    }

    const folderIds = {
      surgery: randomUUID(),
      imaging: randomUUID(),
      anesthesia: randomUUID(),
      dental: randomUUID(),
    };

    await client.query(`
      INSERT INTO vt_folders (id, name, type) VALUES
        ('${folderIds.surgery}', 'Surgery Room 1', 'manual'),
        ('${folderIds.imaging}', 'Imaging Suite', 'manual'),
        ('${folderIds.anesthesia}', 'Anesthesia Dept', 'manual'),
        ('${folderIds.dental}', 'Dental Suite', 'manual')
    `);

    const now = new Date();

    const equipment = [
      {
        id: randomUUID(),
        name: "Autoclave Unit A",
        serialNumber: "ACL-001",
        model: "STATIM 5000",
        manufacturer: "SciCan",
        location: "Surgery Room 1",
        folderId: folderIds.surgery,
        status: "ok",
        lastSeen: now.toISOString(),
        lastStatus: "sterilized",
        lastMaintenanceDate: subDays(now, 5).toISOString(),
        lastSterilizationDate: subDays(now, 2).toISOString(),
        maintenanceIntervalDays: 30,
      },
      {
        id: randomUUID(),
        name: "Digital X-Ray System",
        serialNumber: "XRY-002",
        model: "MinXray HF100",
        manufacturer: "MinXray",
        location: "Imaging Suite",
        folderId: folderIds.imaging,
        status: "ok",
        lastSeen: subDays(now, 1).toISOString(),
        lastStatus: "ok",
        lastMaintenanceDate: subDays(now, 15).toISOString(),
        maintenanceIntervalDays: 60,
      },
      {
        id: randomUUID(),
        name: "Anesthesia Machine",
        serialNumber: "ANS-003",
        model: "Vetland 9900",
        manufacturer: "Vetland",
        location: "Surgery Room 1",
        folderId: folderIds.anesthesia,
        status: "maintenance",
        lastSeen: subDays(now, 3).toISOString(),
        lastStatus: "maintenance",
        lastMaintenanceDate: subDays(now, 45).toISOString(),
        maintenanceIntervalDays: 30,
      },
      {
        id: randomUUID(),
        name: "Ultrasound Scanner",
        serialNumber: "ULT-004",
        model: "GE Logiq",
        manufacturer: "GE Healthcare",
        location: "Imaging Suite",
        folderId: folderIds.imaging,
        status: "ok",
        lastSeen: now.toISOString(),
        lastStatus: "ok",
        lastMaintenanceDate: subDays(now, 10).toISOString(),
        maintenanceIntervalDays: 90,
      },
      {
        id: randomUUID(),
        name: "Dental Drill Set",
        serialNumber: "DNT-005",
        model: "iM3 Advantage",
        manufacturer: "iM3",
        location: "Dental Suite",
        folderId: folderIds.dental,
        status: "issue",
        lastSeen: subDays(now, 1).toISOString(),
        lastStatus: "issue",
        lastSterilizationDate: subDays(now, 10).toISOString(),
      },
      {
        id: randomUUID(),
        name: "Patient Monitor",
        serialNumber: "MON-006",
        model: "Mindray PM-9000",
        manufacturer: "Mindray",
        location: "Surgery Room 1",
        folderId: folderIds.surgery,
        status: "ok",
        lastSeen: now.toISOString(),
        lastStatus: "ok",
        lastMaintenanceDate: subDays(now, 8).toISOString(),
        maintenanceIntervalDays: 30,
      },
      {
        id: randomUUID(),
        name: "Electrosurgical Unit",
        serialNumber: "ESU-007",
        model: "Bovie A952",
        manufacturer: "Bovie",
        location: "Surgery Room 1",
        folderId: folderIds.surgery,
        status: "ok",
        lastSeen: subDays(now, 2).toISOString(),
        lastStatus: "sterilized",
        lastMaintenanceDate: subDays(now, 20).toISOString(),
        lastSterilizationDate: subDays(now, 8).toISOString(),
        maintenanceIntervalDays: 30,
      },
      {
        id: randomUUID(),
        name: "Laser Therapy Unit",
        serialNumber: "LSR-008",
        model: "LightForce LFX",
        manufacturer: "LightForce",
        location: "Rehab Suite",
        status: "ok",
        lastSeen: subDays(now, 7).toISOString(),
        lastStatus: "ok",
        maintenanceIntervalDays: 90,
      },
    ];

    for (const eq of equipment) {
      await client.query(
        `INSERT INTO vt_equipment (id, name, serial_number, model, manufacturer, location, folder_id, status, last_seen, last_status, last_maintenance_date, last_sterilization_date, maintenance_interval_days)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          eq.id,
          eq.name,
          eq.serialNumber || null,
          eq.model || null,
          eq.manufacturer || null,
          eq.location || null,
          eq.folderId || null,
          eq.status,
          eq.lastSeen || null,
          eq.lastStatus || null,
          eq.lastMaintenanceDate || null,
          (eq as any).lastSterilizationDate || null,
          eq.maintenanceIntervalDays || null,
        ]
      );
    }

    for (const eq of equipment) {
      await client.query(
        `INSERT INTO vt_scan_logs (id, equipment_id, user_id, user_email, status, note, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          randomUUID(),
          eq.id,
          "dev-admin-001",
          "admin@vettrack.dev",
          eq.lastStatus || "ok",
          null,
          eq.lastSeen || now.toISOString(),
        ]
      );
    }

    console.log(`✅ Seeded ${equipment.length} equipment items across 4 folders`);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(console.error);
