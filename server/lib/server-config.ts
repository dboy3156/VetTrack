import { eq } from "drizzle-orm";
import { db, serverConfig } from "../db.js";

/** Reads a global config row by key (`vt_server_config` has no clinic scope today). */
export async function getServerConfigValue(
  _clinicId: string,
  key: string,
): Promise<string | null> {
  const [row] = await db
    .select({ value: serverConfig.value })
    .from(serverConfig)
    .where(eq(serverConfig.key, key))
    .limit(1);
  return row?.value ?? null;
}
