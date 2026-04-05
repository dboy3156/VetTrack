import { randomBytes } from "crypto";

export const STABILITY_TOKEN = randomBytes(32).toString("hex");
