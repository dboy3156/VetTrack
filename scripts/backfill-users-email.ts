/**
 * One-time backfill: set missing user emails from Clerk by clerkId.
 *
 * Requires DATABASE_URL and CLERK_SECRET_KEY (see .env or your shell).
 *
 * Run: npx tsx scripts/backfill-users-email.ts
 */
import "dotenv/config";
import { clerkClient } from "@clerk/clerk-sdk-node";
import { eq } from "drizzle-orm";
import { db, pool, users } from "../server/db.js";

const CLERK_DELAY_MS = 100;
const MAX_ATTEMPTS = 3;

type ClerkUser = Awaited<ReturnType<typeof clerkClient.users.getUser>>;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasEmail(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

function getPrimaryClerkEmail(clerkUser: ClerkUser): string {
  const primaryId = clerkUser.primaryEmailAddressId;
  if (!primaryId) return "";
  const addr = clerkUser.emailAddresses?.find((e) => e.id === primaryId);
  return addr?.emailAddress?.trim() ?? "";
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("DATABASE_URL is not set.");
    process.exit(1);
  }
  if (!process.env.CLERK_SECRET_KEY?.trim()) {
    console.error("CLERK_SECRET_KEY is not set.");
    process.exit(1);
  }

  const rows = await db
    .select({
      id: users.id,
      clerkId: users.clerkId,
      email: users.email,
    })
    .from(users);

  const missingEmail = rows.filter((u) => !hasEmail(u.email));
  const toBackfill = missingEmail.filter((u) => Boolean(u.clerkId?.trim()));
  const skippedNoClerkId = missingEmail.length - toBackfill.length;

  console.log(
    `Found ${rows.length} user row(s); ${missingEmail.length} missing email; ${toBackfill.length} will call Clerk (${skippedNoClerkId} skipped without clerkId).\n`,
  );

  let updated = 0;
  let missingClerkEmail = 0;
  let clerkCallIndex = 0;

  for (const user of toBackfill) {
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
        const primary = getPrimaryClerkEmail(clerkUser);

        if (!primary) {
          missingClerkEmail += 1;
          console.warn(
            `[missing Clerk email] id=${user.id} clerkId=${user.clerkId} (no primary email)`,
          );
        } else {
          await db.update(users).set({ email: primary }).where(eq(users.id, user.id));
          updated += 1;
          console.log(
            `[updated] id=${user.id} clerkId=${user.clerkId} email=${primary}`,
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
    `\nDone. Updated: ${updated}; missing primary email in Clerk: ${missingClerkEmail}; skipped (no clerkId): ${skippedNoClerkId}`,
  );
}

main()
  .catch((err) => {
    console.error("Fatal error:", err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
