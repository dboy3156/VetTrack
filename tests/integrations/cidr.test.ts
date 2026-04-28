import { describe, it, expect } from "vitest";
import { isWebhookSourceAllowed } from "../../server/integrations/webhooks/cidr";

describe("isWebhookSourceAllowed", () => {
  it("allows everything when rules empty", () => {
    expect(isWebhookSourceAllowed("1.2.3.4", [])).toBe(true);
  });

  it("matches exact IPv4", () => {
    expect(isWebhookSourceAllowed("10.0.0.1", ["10.0.0.1"])).toBe(true);
    expect(isWebhookSourceAllowed("10.0.0.2", ["10.0.0.1"])).toBe(false);
  });

  it("matches /24 CIDR", () => {
    expect(isWebhookSourceAllowed("192.168.1.50", ["192.168.1.0/24"])).toBe(true);
    expect(isWebhookSourceAllowed("192.168.2.1", ["192.168.1.0/24"])).toBe(false);
  });

  it("normalizes ipv4-mapped ipv6 localhost form", () => {
    expect(isWebhookSourceAllowed("::ffff:127.0.0.1", ["127.0.0.1"])).toBe(true);
  });
});
