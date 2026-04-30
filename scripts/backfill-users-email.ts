/**
 * Backfill missing email / name / displayName on existing vt_users rows (by clerkId).
 * Does not create users; to import org members into the DB use POST /api/users/backfill-clerk (admin).
 *
 * Requires DATABASE_URL or POSTGRES_URL and CLERK_SECRET_KEY (see .env or your shell).
 *
 * Run: npx tsx scripts/backfill-users-email.ts
 */
import "dotenv/config";
import { isPostgresqlConfigured } from "../server/lib/postgresql.js";

const CLERK_DELAY_MS = 100;
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEmpty(value: string | null | undefined): boolean {
  return !value?.trim();
}

/** Clerk getUser throws when the user id was deleted or belongs to another instance. */
function isClerkUserNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const any = err as { status?: number; statusCode?: number; errors?: Array<{ code?: string }>; message?: string };
  const code = any.errors?.[0]?.code;
  if (code === "resource_not_found") return true;
  const st = any.status ?? any.statusCode;
  if (st === 404) return true;
  const msg = (any.message ?? "").trim().toLowerCase();
  if (msg === "not found") return true;
  return msg.includes("not found") && (msg.includes("user") || msg.includes("could not find"));
}

async function main(): Promise<void> {
  console.log("Starting backfill…");
  console.log("PostgreSQL URL:", isPostgresqlConfigured() ? "set" : "MISSING");
  console.log("CLERK_SECRET_KEY:", process.env.CLERK_SECRET_KEY ? "set" : "MISSING");

  if (!isPostgresqlConfigured()) {
    throw new Error("DATABASE_URL or POSTGRES_URL is not set");
  }
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is not set");
  }

  const { clerkClient } = await import("@clerk/clerk-sdk-node");
  const { eq } = await import("drizzle-orm");
  const { db, pool, users } = await import("../server/db.js");

  type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;

  /** Prefer primary; otherwise first verified; otherwise any address (accounts often lack a marked primary). */
  function getBestClerkEmail(clerkUser: ClerkUser): string {
    const addresses = clerkUser.emailAddresses ?? [];
    const primaryId = clerkUser.primaryEmailAddressId;
    if (primaryId) {
      const primary = addresses.find((e) => e.id === primaryId);
      const s = primary?.emailAddress?.trim();
      if (s) return s;
    }
    const verified = addresses.find((e) => {
      const st = (e as { verification?: { status?: string } }).verification?.status;
      return st === "verified";
    });
    if (verified?.emailAddress?.trim()) return verified.emailAddress.trim();
    const first = addresses.find((e) => e.emailAddress?.trim());
    return first?.emailAddress?.trim() ?? "";
  }

  function getClerkName(clerkUser: ClerkUser): string {
    const fromNames = `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();
    if (fromNames) return fromNames;
    const username = (clerkUser as { username?: string | null }).username?.trim();
    return username ?? "";
  }

  try {
    const rows = await db
      .select({
        id: users.id,
        clerkId: users.clerkId,
        email: users.email,
        name: users.name,
        displayName: users.displayName,
      })
      .from(users);

    const needsBackfill = rows.filter(
      (u) =>
        Boolean(u.clerkId?.trim()) &&
        (isEmpty(u.email) || isEmpty(u.name) || isEmpty(u.displayName)),
    );

    console.log(
      `Found ${rows.length} user row(s); ${needsBackfill.length} need backfill (missing email, name, or displayName).\n`,
    );

    if (needsBackfill.length === 0) {
      console.log(
        "Every row already has email, name, and displayName — nothing for this script to update.",
      );
      console.log(
        "This script does not create new users. To sync your Clerk organization roster into the DB, call POST /api/users/backfill-clerk as an admin.\n",
      );
    }

    let updated = 0;
    let skipped = 0;
    let failedNotFound = 0;
    let failedOther = 0;
    const orphanIds: string[] = [];
    let clerkCallIndex = 0;

    for (const user of needsBackfill) {
      if (clerkCallIndex > 0) {
        await sleep(CLERK_DELAY_MS);
      }
      clerkCallIndex += 1;

      let resolved = false;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          await sleep(CLERK_DELAY_MS);
        }
        try {
          const clerkUser = await clerkClient.users.getUser(user.clerkId);
          const clerkEmail = getBestClerkEmail(clerkUser);
          const clerkName = getClerkName(clerkUser);

          const patch: Record<string, string> = {};
          if (isEmpty(user.email) && clerkEmail) patch.email = clerkEmail;
          if (isEmpty(user.name) && clerkName) patch.name = clerkName;
          if (isEmpty(user.displayName) && (clerkName || clerkEmail)) {
            patch.displayName = clerkName || clerkEmail;
          }

          if (Object.keys(patch).length === 0) {
            skipped += 1;
            console.warn(
              `[skipped] id=${user.id} clerkId=${user.clerkId} — nothing to apply (Clerk email=${clerkEmail ? `"${clerkEmail}"` : "none"} name=${clerkName ? `"${clerkName}"` : "none"}; DB still missing: email=${isEmpty(user.email)} name=${isEmpty(user.name)} displayName=${isEmpty(user.displayName)})`,
            );
          } else {
            await db.update(users).set(patch).where(eq(users.id, user.id));
            updated += 1;
            console.log(
              `[updated] id=${user.id} clerkId=${user.clerkId} fields=${Object.keys(patch).join(",")} → ${JSON.stringify(patch)}`,
            );
          }
          resolved = true;
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (isClerkUserNotFoundError(err)) {
            failedNotFound += 1;
            orphanIds.push(user.id);
            console.error(
              `[not found in Clerk] id=${user.id} clerkId=${user.clerkId} — ${message} (no retries: user deleted, or CLERK_SECRET_KEY is a different Clerk instance than these ids)`,
            );
            resolved = true;
            break;
          }
          if (attempt === MAX_ATTEMPTS) {
            console.error(
              `[error] id=${user.id} clerkId=${user.clerkId} after ${MAX_ATTEMPTS} attempts: ${message}`,
            );
          } else {
            console.warn(
              `[retry ${attempt}/${MAX_ATTEMPTS}] id=${user.id} clerkId=${user.clerkId}: ${message}`,
            );
          }
        }
      }

      if (!resolved) failedOther += 1;
    }

    console.log(`\nDone. Updated: ${updated}; skipped (nothing to apply): ${skipped}; Clerk user not found: ${failedNotFound}; other errors: ${failedOther}.`);
    if (orphanIds.length > 0) {
      console.log(
        `\nOrphan vt_users rows (no matching Clerk user): ${orphanIds.join(", ")}\n` +
          "You can fix by: using the same CLERK_SECRET_KEY instance that created those ids, soft-deleting the row if the user left, or setting email/name manually in SQL if you know them.",
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
