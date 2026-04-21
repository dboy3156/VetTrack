/**
 * Inspect / safely activate a dev user row in vt_users.
 *
 * This replaces ad-hoc psql sessions and the temporary `.tmp-activate-user.ts`
 * workflow that kept hitting schema issues (missing clinic_id, wrong ON CONFLICT
 * targets). Designed to be agent-executable.
 *
 * Usage:
 *   pnpm exec tsx scripts/dev-user-status.ts --email=you@example.com
 *   pnpm exec tsx scripts/dev-user-status.ts --clerk-id=user_... --activate
 *   pnpm exec tsx scripts/dev-user-status.ts --email=you@example.com --activate \
 *       --clerk-id=user_xxx --clinic-id=dev-clinic-default --name="Dan"
 *
 * Safety:
 *   - Never inserts a user without explicit clinic_id + clerk_id.
 *   - Never promotes status to anything other than 'active'.
 *   - Refuses to run in NODE_ENV=production.
 *
 * Exit codes:
 *   0  found / updated / inserted successfully.
 *   2  user not found and insertion not requested.
 *   3  invalid args or refusing unsafe operation.
 *   1  unexpected error.
 */
import "dotenv/config";
import { Client } from "pg";

type Args = {
  email?: string;
  clerkId?: string;
  activate: boolean;
  clinicId?: string;
  name?: string;
  role: string;
};

function parseArgs(argv: string[]): Args {
  const out: Args = { activate: false, role: "technician" };
  for (const arg of argv.slice(2)) {
    if (arg === "--activate") { out.activate = true; continue; }
    const m = /^--([^=]+)=(.*)$/.exec(arg);
    if (!m) continue;
    const [, key, value] = m;
    switch (key) {
      case "email": out.email = value.trim(); break;
      case "clerk-id": out.clerkId = value.trim(); break;
      case "clinic-id": out.clinicId = value.trim(); break;
      case "name": out.name = value; break;
      case "role": out.role = value.trim() || "technician"; break;
    }
  }
  return out;
}

function usage(): never {
  console.error(
    [
      "Usage:",
      "  tsx scripts/dev-user-status.ts --email=<email>",
      "  tsx scripts/dev-user-status.ts --clerk-id=<clerk_id>",
      "  tsx scripts/dev-user-status.ts --email=<email> --activate",
      "  tsx scripts/dev-user-status.ts --email=<email> --clerk-id=<id> --clinic-id=<id> --activate --name=\"Dan\"",
      "",
      "Notes:",
      "  - Either --email or --clerk-id is required.",
      "  - Inserting a new user requires --clerk-id AND --clinic-id AND --activate.",
      "  - Refuses to run when NODE_ENV=production.",
    ].join("\n"),
  );
  process.exit(3);
}

function getDatabaseUrl(): string {
  const direct = (process.env.DATABASE_URL || process.env.POSTGRES_URL || "").trim();
  if (!direct) throw new Error("DATABASE_URL (or POSTGRES_URL) not set");
  return direct;
}

async function findUser(
  client: Client,
  { email, clerkId }: { email?: string; clerkId?: string },
) {
  if (clerkId) {
    const res = await client.query(
      `SELECT id, clerk_id, email, name, role, status, clinic_id
         FROM vt_users
        WHERE clerk_id = $1
        LIMIT 1`,
      [clerkId],
    );
    if (res.rows[0]) return res.rows[0];
  }
  if (email) {
    const res = await client.query(
      `SELECT id, clerk_id, email, name, role, status, clinic_id
         FROM vt_users
        WHERE LOWER(email) = LOWER($1)
        ORDER BY created_at ASC
        LIMIT 1`,
      [email],
    );
    if (res.rows[0]) return res.rows[0];
  }
  return null;
}

async function main(): Promise<void> {
  if ((process.env.NODE_ENV ?? "").toLowerCase() === "production") {
    console.error("dev-user-status refuses to run with NODE_ENV=production");
    process.exit(3);
  }

  const args = parseArgs(process.argv);
  if (!args.email && !args.clerkId) usage();

  const client = new Client({ connectionString: getDatabaseUrl() });
  await client.connect();

  try {
    const existing = await findUser(client, { email: args.email, clerkId: args.clerkId });

    if (existing) {
      if (!args.activate) {
        console.log(JSON.stringify({ action: "found", user: existing }, null, 2));
        return;
      }
      if (existing.status === "active") {
        console.log(JSON.stringify({ action: "already-active", user: existing }, null, 2));
        return;
      }
      // Safe targeted update: only flip status to 'active' for an existing row.
      const updated = await client.query(
        `UPDATE vt_users
            SET status = 'active'
          WHERE id = $1
        RETURNING id, clerk_id, email, name, role, status, clinic_id`,
        [existing.id],
      );
      console.log(JSON.stringify({ action: "activated", user: updated.rows[0] }, null, 2));
      return;
    }

    if (!args.activate) {
      console.log(JSON.stringify({ action: "not-found", query: { email: args.email, clerkId: args.clerkId } }, null, 2));
      process.exit(2);
    }

    // Insert path: enforce every NOT NULL column explicitly. No ON CONFLICT
    // because the caller has already proven the row does not exist and any
    // conflict here is a real bug we want to surface.
    if (!args.clerkId || !args.clinicId || !args.email) {
      console.error(
        "Refusing to insert: --email, --clerk-id, and --clinic-id are all required when creating a new user.",
      );
      process.exit(3);
    }

    const inserted = await client.query(
      `INSERT INTO vt_users (id, clinic_id, clerk_id, email, name, role, status)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5, 'active')
       RETURNING id, clerk_id, email, name, role, status, clinic_id`,
      [args.clinicId, args.clerkId, args.email, args.name ?? "Dev User", args.role],
    );
    console.log(JSON.stringify({ action: "created", user: inserted.rows[0] }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("[dev-user-status] failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
