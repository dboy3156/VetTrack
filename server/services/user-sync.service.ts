import { clerkClient } from "@clerk/express";
import { eq } from "drizzle-orm";
import { db, users } from "../db.js";

/**
 * Ensures a user has a valid email by self-healing from Clerk.
 * No-op if email already present; errors from Clerk do not propagate.
 */
export async function ensureUserEmail(user: {
  id: string;
  clerkId: string;
  email: string | null;
}) {
  if (user.email && user.email.trim() !== "") {
    return user;
  }
  if (!user.clerkId) {
    return user;
  }

  try {
    const clerkUser = await clerkClient.users.getUser(user.clerkId);

    const primaryId = clerkUser.primaryEmailAddressId;
    const primary = clerkUser.emailAddresses?.find((e) => e.id === primaryId);
    const email =
      primary?.emailAddress ||
      clerkUser.emailAddresses?.[0]?.emailAddress ||
      null;

    if (!email) return user;

    const [updated] = await db
      .update(users)
      .set({ email })
      .where(eq(users.id, user.id))
      .returning();

    console.log("SELF HEALED USER:", user.id);

    return updated ?? user;
  } catch (err) {
    console.error("SELF HEAL FAILED:", user.id, err);
    return user;
  }
}
