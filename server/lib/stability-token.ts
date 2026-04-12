import { randomBytes } from "crypto";
export const STABILITY_TOKEN =
  process.env.STABILITY_TOKEN?.trim() ?? randomBytes(32).toString("hex");
