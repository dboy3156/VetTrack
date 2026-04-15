/**
 * One-time backfill: set missing user emails / names from Clerk by clerkId.
 *
 * Requires DATABASE_URL and CLERK_SECRET_KEY (see .env or your shell).
 *
 * Run: npx tsx scripts/backfill-users-email.ts
 */
import "dotenv/config";

const CLERK_DELAY_MS = 100;
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isEmpty(value: string | null | undefined): boolean {
  return !value?.trim();
}

async function main(): Promise<void> {
  console.log("Starting backfill…");
  console.log("DATABASE_URL:", process.env.DATABASE_URL ? "set" : "MISSING");
  console.log("CLERK_SECRET_KEY:", process.env.CLERK_SECRET_KEY ? "set" : "MISSING");

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!process.env.CLERK_SECRET_KEY) {
    throw new Error("CLERK_SECRET_KEY is not set");
  }

  const { clerkClient } = await import("@clerk/clerk-sdk-node");
  const { eq } = await import("drizzle-orm");
  const { db, pool, users } = await import("../server/db.js");

  type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;

  function getPrimaryClerkEmail(clerkUser: ClerkUser): string {
    const primaryId = clerkUser.primaryEmailAddressId;
    if (!primaryId) return "";
    const addr = clerkUser.emailAddresses?.find((e) => e.id === primaryId);
    return addr?.emailAddress?.trim() ?? "";
  }

  function getClerkName(clerkUser: ClerkUser): string {
    return `${clerkUser.firstName ?? ""} ${clerkUser.lastName ?? ""}`.trim();
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

    let updated = 0;
    let skipped = 0;
    let clerkCallIndex = 0;

    for (const user of needsBackfill) {
      if (clerkCallIndex > 0) {
        await sleep(CLERK_DELAY_MS);
      }
      clerkCallIndex += 1;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (attempt > 1) {
          await sleep(CLERK_DELAY_MS);
        }
        try {
          const clerkUser = await clerkClient.users.getUser(user.clerkId);
          const clerkEmail = getPrimaryClerkEmail(clerkUser);
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
              `[skipped] id=${user.id} clerkId=${user.clerkId} — Clerk has no data to fill`,
            );
          } else {
            await db.update(users).set(patch).where(eq(users.id, user.id));
            updated += 1;
            console.log(
              `[updated] id=${user.id} clerkId=${user.clerkId} fields=${Object.keys(patch).join(",")} → ${JSON.stringify(patch)}`,
            );
          }
          break;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
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
    }

    console.log(
      `\nDone. Updated: ${updated}; skipped (no Clerk data): ${skipped}; total checked: ${needsBackfill.length}`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exitCode = 1;
});
