import { describe, expect, it } from "vitest";
import { resolveForecastDeliveryPolicy } from "../server/lib/forecast/deliveryPolicy.ts";

describe("Forecast delivery policy", () => {
  it("allows mailto fallback by default outside production", () => {
    const policy = resolveForecastDeliveryPolicy({ NODE_ENV: "development" });
    expect(policy.requireSmtp).toBe(false);
    expect(policy.allowMailtoFallback).toBe(true);
  });

  it("requires SMTP by default in production", () => {
    const policy = resolveForecastDeliveryPolicy({ NODE_ENV: "production" });
    expect(policy.requireSmtp).toBe(true);
    expect(policy.allowMailtoFallback).toBe(false);
  });

  it("allows overriding production fallback policy with env flag", () => {
    const policy = resolveForecastDeliveryPolicy({
      NODE_ENV: "production",
      FORECAST_ALLOW_MAILTO_FALLBACK: "true",
    });
    expect(policy.requireSmtp).toBe(false);
    expect(policy.allowMailtoFallback).toBe(true);
  });

  it("enforces SMTP when explicitly configured in non-production", () => {
    const policy = resolveForecastDeliveryPolicy({
      NODE_ENV: "development",
      FORECAST_SMTP_REQUIRED: "1",
    });
    expect(policy.requireSmtp).toBe(true);
    expect(policy.allowMailtoFallback).toBe(false);
  });
});
