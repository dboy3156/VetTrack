/**
 * Restock service — Phase 2 (session concurrency) & Phase 3 (atomic scan) behavior.
 *
 * Requires: DATABASE_URL (e.g. from .env), migrations applied (including
 * `042_uniq_active_restock_session_per_container.sql`).
 *
 * Run: pnpm exec tsx tests/restock.service.test.ts
 */
import "dotenv/config";
import assert from "node:assert";
import { randomUUID } from "crypto";
import { eq, and } from "drizzle-orm";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log("⚠️  restock.service tests skipped (DATABASE_URL not set)");
    process.exit(0);
  }

  const { db, pool, users, containers, inventoryItems, containerItems, restockSessions } =
    await import("../server/db.js");
  const { startRestockSession, scanItem, RestockServiceError } = await import(
    "../server/services/restock.service.js",
  );

  async function purgeClinic(clinicId: string) {
    await db.delete(restockSessions).where(eq(restockSessions.clinicId, clinicId));
    await db.delete(containerItems).where(eq(containerItems.clinicId, clinicId));
    await db.delete(containers).where(eq(containers.clinicId, clinicId));
    await db.delete(inventoryItems).where(eq(inventoryItems.clinicId, clinicId));
    await db.delete(users).where(eq(users.clinicId, clinicId));
  }

  async function seedHospitalCart() {
    const clinicId = randomUUID();
    const userA = randomUUID();
    const userB = randomUUID();
    const containerId = randomUUID();
    await db.insert(users).values([
      {
        id: userA,
        clinicId,
        clerkId: `clerk_${randomUUID()}`,
        email: `u1_${randomUUID()}@example.com`,
        name: "Test A",
      },
      {
        id: userB,
        clinicId,
        clerkId: `clerk_${randomUUID()}`,
        email: `u2_${randomUUID()}@example.com`,
        name: "Test B",
      },
    ]);
    await db.insert(containers).values({
      id: containerId,
      clinicId,
      name: "Hospital Supply Cart",
      department: "Hospital",
    });
    return { clinicId, userA, userB, containerId };
  }

  try {
    // ─── Existing: single session start ─────────────────────────────────────
    {
      const { clinicId, userA, containerId } = await seedHospitalCart();
      try {
        const session = await startRestockSession({ clinicId, containerId, userId: userA });
        assert.strictEqual(session?.status, "active");
        assert.strictEqual(session?.containerId, containerId);
      } finally {
        await purgeClinic(clinicId);
      }
    }

    // ─── Phase 2: parallel session start (one wins, one 409) ──────────────
    {
      const { clinicId, userA, userB, containerId } = await seedHospitalCart();
      try {
        const results = await Promise.allSettled([
          startRestockSession({ clinicId, containerId, userId: userA }),
          startRestockSession({ clinicId, containerId, userId: userB }),
        ]);
        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejected = results.filter((r) => r.status === "rejected");
        assert.strictEqual(fulfilled.length, 1, "exactly one start should succeed");
        assert.strictEqual(rejected.length, 1, "exactly one start should fail");
        const reason = (rejected[0] as PromiseRejectedResult).reason;
        assert(reason instanceof RestockServiceError);
        assert.strictEqual(reason.code, "SESSION_ALREADY_ACTIVE");
        assert.strictEqual(reason.status, 409);
      } finally {
        await purgeClinic(clinicId);
      }
    }

    // ─── Phase 3: concurrent +1 scans (no lost updates) ───────────────────
    {
      const { clinicId, userA, containerId } = await seedHospitalCart();
      try {
        const session = await startRestockSession({ clinicId, containerId, userId: userA });
        const [syringe] = await db
          .select({ id: inventoryItems.id })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.code, "SYRINGE_5ML")))
          .limit(1);
        assert(syringe, "SYRINGE_5ML should be seeded for Hospital Supply Cart");

        const N = 20;
        await Promise.all(
          Array.from({ length: N }, () =>
            scanItem({
              clinicId,
              sessionId: session.id,
              itemId: syringe.id,
              delta: 1,
              userId: userA,
            }),
          ),
        );

        const [line] = await db
          .select({ quantity: containerItems.quantity })
          .from(containerItems)
          .where(
            and(
              eq(containerItems.clinicId, clinicId),
              eq(containerItems.containerId, containerId),
              eq(containerItems.itemId, syringe.id),
            ),
          )
          .limit(1);
        assert.strictEqual(line?.quantity, N);
      } finally {
        await purgeClinic(clinicId);
      }
    }

    // ─── Negative scan blocked ─────────────────────────────────────────────
    {
      const { clinicId, userA, containerId } = await seedHospitalCart();
      try {
        const session = await startRestockSession({ clinicId, containerId, userId: userA });
        const [syringe] = await db
          .select({ id: inventoryItems.id })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.code, "SYRINGE_5ML")))
          .limit(1);
        assert(syringe);

        await db
          .update(containerItems)
          .set({ quantity: 1, updatedAt: new Date() })
          .where(
            and(
              eq(containerItems.clinicId, clinicId),
              eq(containerItems.containerId, containerId),
              eq(containerItems.itemId, syringe.id),
            ),
          );

        let threw = false;
        try {
          await scanItem({
            clinicId,
            sessionId: session.id,
            itemId: syringe.id,
            delta: -2,
            userId: userA,
          });
        } catch (e) {
          threw = true;
          assert(e instanceof RestockServiceError);
          assert.strictEqual(e.code, "NEGATIVE_QUANTITY_NOT_ALLOWED");
          assert.strictEqual(e.status, 409);
        }
        assert(threw, "expected NEGATIVE_QUANTITY_NOT_ALLOWED");

        const [line] = await db
          .select({ quantity: containerItems.quantity })
          .from(containerItems)
          .where(
            and(
              eq(containerItems.clinicId, clinicId),
              eq(containerItems.containerId, containerId),
              eq(containerItems.itemId, syringe.id),
            ),
          )
          .limit(1);
        assert.strictEqual(line?.quantity, 1);
      } finally {
        await purgeClinic(clinicId);
      }
    }

    // ─── Existing: single positive scan shape ─────────────────────────────
    {
      const { clinicId, userA, containerId } = await seedHospitalCart();
      try {
        const session = await startRestockSession({ clinicId, containerId, userId: userA });
        const [syringe] = await db
          .select({ id: inventoryItems.id })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.code, "SYRINGE_5ML")))
          .limit(1);
        assert(syringe);

        const out = await scanItem({
          clinicId,
          sessionId: session.id,
          itemId: syringe.id,
          delta: 3,
          userId: userA,
        });
        assert(out.event?.id);
        assert.strictEqual(out.quantity, 3);
        assert.strictEqual(out.item?.id, syringe.id);
      } finally {
        await purgeClinic(clinicId);
      }
    }

    // ─── Scan: mixed increment/decrement ───────────────────────────────────
    {
      const { clinicId, userA, containerId } = await seedHospitalCart();
      try {
        const session = await startRestockSession({ clinicId, containerId, userId: userA });
        const [syringe] = await db
          .select({ id: inventoryItems.id })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.clinicId, clinicId), eq(inventoryItems.code, "SYRINGE_5ML")))
          .limit(1);
        assert(syringe);

        await db
          .update(containerItems)
          .set({ quantity: 5, updatedAt: new Date() })
          .where(
            and(
              eq(containerItems.clinicId, clinicId),
              eq(containerItems.containerId, containerId),
              eq(containerItems.itemId, syringe.id),
            ),
          );

        await scanItem({
          clinicId,
          sessionId: session.id,
          itemId: syringe.id,
          delta: 2,
          userId: userA,
        });
        await scanItem({
          clinicId,
          sessionId: session.id,
          itemId: syringe.id,
          delta: -3,
          userId: userA,
        });

        const [line] = await db
          .select({ quantity: containerItems.quantity })
          .from(containerItems)
          .where(
            and(
              eq(containerItems.clinicId, clinicId),
              eq(containerItems.containerId, containerId),
              eq(containerItems.itemId, syringe.id),
            ),
          )
          .limit(1);
        assert.strictEqual(line?.quantity, 4);
      } finally {
        await purgeClinic(clinicId);
      }
    }

    console.log("✅ restock.service.test.ts passed");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
