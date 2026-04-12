export const STABILITY_TOKEN =
  process.env.STABILITY_TOKEN ?? randomBytes(32).toString("hex");
