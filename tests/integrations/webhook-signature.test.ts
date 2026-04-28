import { describe, it, expect } from "vitest";
import { createHmac } from "crypto";
import { verifyVetTrackWebhookSignature } from "../../server/integrations/webhooks/verify-signature";

describe("verifyVetTrackWebhookSignature", () => {
  const secret = "test-secret";
  const body = Buffer.from(JSON.stringify({ hello: "world" }), "utf8");

  function sign(raw: Buffer, key: string): string {
    return "sha256=" + createHmac("sha256", key).update(raw).digest("hex");
  }

  it("accepts matching HMAC header", () => {
    expect(verifyVetTrackWebhookSignature(body, secret, sign(body, secret))).toBe(true);
  });

  it("rejects wrong secret", () => {
    expect(verifyVetTrackWebhookSignature(body, secret, sign(body, "other"))).toBe(false);
  });

  it("rejects mangled hex", () => {
    expect(verifyVetTrackWebhookSignature(body, secret, "sha256=zzz")).toBe(false);
  });

  it("rejects missing prefix", () => {
    expect(verifyVetTrackWebhookSignature(body, secret, sign(body, secret).replace("sha256=", ""))).toBe(false);
  });
});
