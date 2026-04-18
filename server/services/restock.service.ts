import { randomUUID } from "crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import {
  containerItems,
  containers,
  db,
  inventoryItems,
  restockEvents,
  restockSessions,
} from "../db.js";
import { resolveBlueprintEntryForContainerName } from "../config/inventoryBlueprint.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbTx = any;

export class RestockServiceError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "RestockServiceError";
    this.code = code;
    this.status = status;
  }
}

function ensureBlueprintEntry(containerName: string) {
  const entry = resolveBlueprintEntryForContainerName(containerName);
  if (!entry) {
    throw new RestockServiceError(
      "CONTAINER_TEMPLATE_NOT_FOUND",
      400,
      "Container template is not configured",
    );
  }
  return entry;
}

async function ensureTemplateItemsSeededInTx(
  tx: DbTx,
  clinicId: string,
  containerName: string,
  containerId: string,
) {
  const entry = ensureBlueprintEntry(containerName);
  const codes = entry.supplyTargets.map((s) => s.code);
  if (codes.length === 0) return entry;

  for (const target of entry.supplyTargets) {
    await tx
      .insert(inventoryItems)
      .values({
        id: randomUUID(),
        clinicId,
        code: target.code,
        label: target.label,
        category: entry.department,
      })
      .onConflictDoUpdate({
        target: [inventoryItems.clinicId, inventoryItems.code],
        set: {
          label: target.label,
          category: entry.department,
        },
      });
  }

  const seededItems = await tx
    .select({
      id: inventoryItems.id,
      code: inventoryItems.code,
    })
    .from(inventoryItems)
    .where(and(eq(inventoryItems.clinicId, clinicId), inArray(inventoryItems.code, codes)));

  for (const item of seededItems) {
    await tx
      .insert(containerItems)
      .values({
        id: randomUUID(),
        clinicId,
        containerId,
        itemId: item.id,
        quantity: 0,
      })
      .onConflictDoNothing();
  }

  return entry;
}

async function getSessionForMutation(
  tx: DbTx,
  clinicId: string,
  sessionId: string,
) {
  const [session] = await tx
    .select()
    .from(restockSessions)
    .where(and(eq(restockSessions.clinicId, clinicId), eq(restockSessions.id, sessionId)))
    .limit(1);

  if (!session) {
    throw new RestockServiceError("SESSION_NOT_FOUND", 404, "Restock session not found");
  }
  if (session.status !== "active" || session.finishedAt) {
    throw new RestockServiceError("SESSION_CLOSED", 400, "Restock session is already finished");
  }
  return session;
}

export function assertSessionOwned(
  session: Pick<typeof restockSessions.$inferSelect, "ownedByUserId">,
  userId: string,
): void {
  if (session.ownedByUserId !== userId) {
    throw new RestockServiceError("SESSION_NOT_OWNED", 403, "Session is owned by another user");
  }
}

function postgresErrorCode(err: unknown): string | undefined {
  let current: unknown = err;
  const seen = new Set<unknown>();
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    if ("code" in current && typeof (current as { code: unknown }).code === "string") {
      return (current as { code: string }).code;
    }
    if (!("cause" in current)) break;
    current = (current as { cause: unknown }).cause;
  }
  return undefined;
}

export async function startRestockSession(params: {
  clinicId: string;
  containerId: string;
  userId: string;
}) {
  return db.transaction(async (tx) => {
    const [container] = await tx
      .select()
      .from(containers)
      .where(and(eq(containers.clinicId, params.clinicId), eq(containers.id, params.containerId)))
      .limit(1);
    if (!container) {
      throw new RestockServiceError("CONTAINER_NOT_FOUND", 404, "Container not found");
    }

    await ensureTemplateItemsSeededInTx(tx, params.clinicId, container.name, params.containerId);

    const id = randomUUID();
    let session;
    try {
      [session] = await tx
        .insert(restockSessions)
        .values({
          id,
          clinicId: params.clinicId,
          containerId: params.containerId,
          ownedByUserId: params.userId,
          status: "active",
        })
        .returning();
    } catch (err) {
      const code = postgresErrorCode(err);
      if (code === "23505") {
        throw new RestockServiceError(
          "SESSION_ALREADY_ACTIVE",
          409,
          "An active restock session already exists for this container",
        );
      }
      throw err;
    }

    if (!session) {
      throw new Error("unexpected empty insert returning");
    }

    return session;
  });
}

export async function scanItem(params: {
  clinicId: string;
  sessionId: string;
  itemId: string;
  delta: number;
  userId: string;
}) {
  if (!Number.isInteger(params.delta) || params.delta === 0) {
    throw new RestockServiceError("INVALID_DELTA", 400, "delta must be a non-zero integer");
  }

  return db.transaction(async (tx) => {
    const session = await getSessionForMutation(tx, params.clinicId, params.sessionId);
    assertSessionOwned(session, params.userId);

    const [container] = await tx
      .select()
      .from(containers)
      .where(and(eq(containers.clinicId, params.clinicId), eq(containers.id, session.containerId)))
      .limit(1);
    if (!container) {
      throw new RestockServiceError("CONTAINER_NOT_FOUND", 404, "Container not found");
    }

    const template = await ensureTemplateItemsSeededInTx(tx, params.clinicId, container.name, session.containerId);
    const [item] = await tx
      .select()
      .from(inventoryItems)
      .where(and(eq(inventoryItems.clinicId, params.clinicId), eq(inventoryItems.id, params.itemId)))
      .limit(1);
    if (!item) {
      throw new RestockServiceError("ITEM_NOT_FOUND", 404, "Item not found");
    }

    const inTemplate = template.supplyTargets.some((target) => target.code === item.code);
    if (!inTemplate) {
      throw new RestockServiceError("ITEM_NOT_IN_TEMPLATE", 400, "Item does not belong to container template");
    }

    const now = new Date();

    const [updatedRow] = await tx
      .update(containerItems)
      .set({
        quantity: sql`${containerItems.quantity} + ${params.delta}`,
        updatedAt: now,
      })
      .where(
        and(
          eq(containerItems.containerId, session.containerId),
          eq(containerItems.itemId, item.id),
          sql`${containerItems.quantity} + ${params.delta} >= 0`,
        ),
      )
      .returning({ quantity: containerItems.quantity });

    let nextQuantity = updatedRow?.quantity;

    if (nextQuantity === undefined && params.delta > 0) {
      try {
        const [insertedRow] = await tx
          .insert(containerItems)
          .values({
            id: randomUUID(),
            clinicId: params.clinicId,
            containerId: session.containerId,
            itemId: item.id,
            quantity: params.delta,
            updatedAt: now,
          })
          .onConflictDoUpdate({
            target: [containerItems.containerId, containerItems.itemId],
            set: {
              quantity: sql`${containerItems.quantity} + ${params.delta}`,
              updatedAt: now,
            },
            setWhere: sql`${containerItems.quantity} + ${params.delta} >= 0`,
          })
          .returning({ quantity: containerItems.quantity });
        if (!insertedRow) {
          throw new RestockServiceError(
            "SCAN_CONFLICT_FAILED",
            409,
            "Scan conflict: upsert did not apply (concurrent update or guard failed)",
          );
        }
        nextQuantity = insertedRow.quantity;
      } catch (err) {
        if (err instanceof RestockServiceError) throw err;
        throw new RestockServiceError(
          "SCAN_UPDATE_FAILED",
          500,
          "Scan storage update failed",
        );
      }
    }

    if (nextQuantity === undefined) {
      const [existing] = await tx
        .select({ quantity: containerItems.quantity })
        .from(containerItems)
        .where(
          and(
            eq(containerItems.containerId, session.containerId),
            eq(containerItems.itemId, item.id),
          ),
        )
        .limit(1);

      if (!existing) {
        throw new RestockServiceError(
          "ITEM_NOT_IN_CONTAINER",
          409,
          "Cannot decrement quantity for an item not present in the container.",
        );
      }
      throw new RestockServiceError(
        "NEGATIVE_QUANTITY_NOT_ALLOWED",
        409,
        "Scan would produce a negative quantity.",
      );
    }

    const [event] = await tx
      .insert(restockEvents)
      .values({
        id: randomUUID(),
        clinicId: params.clinicId,
        sessionId: session.id,
        containerId: session.containerId,
        itemId: item.id,
        delta: params.delta,
      })
      .returning();

    return { event, quantity: nextQuantity, item };
  });
}

export async function finishSession(params: {
  clinicId: string;
  sessionId: string;
  userId: string;
}) {
  return db.transaction(async (tx) => {
    const session = await getSessionForMutation(tx, params.clinicId, params.sessionId);
    assertSessionOwned(session, params.userId);

    const [container] = await tx
      .select()
      .from(containers)
      .where(and(eq(containers.clinicId, params.clinicId), eq(containers.id, session.containerId)))
      .limit(1);
    if (!container) {
      throw new RestockServiceError("CONTAINER_NOT_FOUND", 404, "Container not found");
    }
    const template = await ensureTemplateItemsSeededInTx(tx, params.clinicId, container.name, session.containerId);

    const eventSums = await tx
      .select({
        totalAdded: sql<number>`COALESCE(SUM(CASE WHEN ${restockEvents.delta} > 0 THEN ${restockEvents.delta} ELSE 0 END), 0)`,
        totalRemoved: sql<number>`COALESCE(SUM(CASE WHEN ${restockEvents.delta} < 0 THEN ABS(${restockEvents.delta}) ELSE 0 END), 0)`,
      })
      .from(restockEvents)
      .where(and(eq(restockEvents.clinicId, params.clinicId), eq(restockEvents.sessionId, session.id)));

    const templateCodes = template.supplyTargets.map((target) => target.code);
    const itemRows = templateCodes.length
      ? await tx
          .select({
            id: inventoryItems.id,
            code: inventoryItems.code,
          })
          .from(inventoryItems)
          .where(and(eq(inventoryItems.clinicId, params.clinicId), inArray(inventoryItems.code, templateCodes)))
      : [];

    const lineRows = itemRows.length
      ? await tx
          .select({
            itemId: containerItems.itemId,
            quantity: containerItems.quantity,
          })
          .from(containerItems)
          .where(
            and(
              eq(containerItems.clinicId, params.clinicId),
              eq(containerItems.containerId, session.containerId),
              inArray(
                containerItems.itemId,
                itemRows.map((item) => item.id),
              ),
            ),
          )
      : [];
    const quantityByItemId = new Map(lineRows.map((line) => [line.itemId, line.quantity]));
    const itemByCode = new Map(itemRows.map((item) => [item.code, item.id]));

    const itemsMissingCount = template.supplyTargets.reduce((count, target) => {
      const itemId = itemByCode.get(target.code);
      const actual = itemId ? quantityByItemId.get(itemId) ?? 0 : 0;
      return target.targetUnits > actual ? count + 1 : count;
    }, 0);

    const finishedAt = new Date();
    const [updated] = await tx
      .update(restockSessions)
      .set({
        status: "finished",
        finishedAt,
      })
      .where(and(eq(restockSessions.clinicId, params.clinicId), eq(restockSessions.id, session.id)))
      .returning();

    return {
      session: updated,
      totalAdded: Number(eventSums[0]?.totalAdded ?? 0),
      totalRemoved: Number(eventSums[0]?.totalRemoved ?? 0),
      itemsMissingCount,
    };
  });
}

export async function resolveItemByNFCTag(params: {
  clinicId: string;
  nfcTagId: string;
}) {
  const normalized = params.nfcTagId.trim();
  if (!normalized) {
    throw new RestockServiceError("NFC_TAG_REQUIRED", 400, "nfcTagId is required");
  }
  const [item] = await db
    .select()
    .from(inventoryItems)
    .where(and(eq(inventoryItems.clinicId, params.clinicId), eq(inventoryItems.nfcTagId, normalized)))
    .limit(1);
  if (!item) {
    throw new RestockServiceError("ITEM_NOT_FOUND", 404, "No item found for the NFC tag");
  }
  return item;
}

export async function getContainerInventoryView(params: {
  clinicId: string;
  containerId: string;
}) {
  const [container] = await db
    .select()
    .from(containers)
    .where(and(eq(containers.clinicId, params.clinicId), eq(containers.id, params.containerId)))
    .limit(1);
  if (!container) {
    throw new RestockServiceError("CONTAINER_NOT_FOUND", 404, "Container not found");
  }

  const template = ensureBlueprintEntry(container.name);
  const codes = template.supplyTargets.map((target) => target.code);
  const itemRows = codes.length
    ? await db
        .select({
          id: inventoryItems.id,
          code: inventoryItems.code,
          label: inventoryItems.label,
        })
        .from(inventoryItems)
        .where(and(eq(inventoryItems.clinicId, params.clinicId), inArray(inventoryItems.code, codes)))
    : [];
  const itemByCode = new Map(itemRows.map((item) => [item.code, item]));
  const lineRows = itemRows.length
    ? await db
        .select({
          itemId: containerItems.itemId,
          quantity: containerItems.quantity,
        })
        .from(containerItems)
        .where(
          and(
            eq(containerItems.clinicId, params.clinicId),
            eq(containerItems.containerId, params.containerId),
            inArray(
              containerItems.itemId,
              itemRows.map((item) => item.id),
            ),
          ),
        )
    : [];
  const quantityByItemId = new Map(lineRows.map((line) => [line.itemId, line.quantity]));

  const lines = template.supplyTargets.map((target) => {
    const item = itemByCode.get(target.code);
    const actual = item ? quantityByItemId.get(item.id) ?? 0 : 0;
    return {
      itemId: item?.id ?? null,
      code: target.code,
      label: target.label,
      expected: target.targetUnits,
      actual,
      missing: Math.max(0, target.targetUnits - actual),
    };
  });

  const [activeSession] = await db
    .select()
    .from(restockSessions)
    .where(
      and(
        eq(restockSessions.clinicId, params.clinicId),
        eq(restockSessions.containerId, params.containerId),
        eq(restockSessions.status, "active"),
      ),
    )
    .limit(1);

  return {
    container,
    lines,
    activeSession: activeSession ?? null,
  };
}
