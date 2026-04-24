import { describe, expect, it } from "vitest";
import { resolveForecastDeliveryPolicy } from "../server/lib/forecast/deliveryPolicy.ts";

describe("Forecast delivery policy", () => {
  it("allows mailto fallback by default outside production", () => {
    const policy = resolveForecastDeliveryPolicy({ NODE_ENV: "development" });
    expect(policy.requireSmtp).toBe(false);
    expect(policy.allowMailtoWithoutSmtp).toBe(true);
    expect(policy.allowMailtoOnSmtpFailure).toBe(true);
  });

  it("requires SMTP by default in production", () => {
    const policy = resolveForecastDeliveryPolicy({ NODE_ENV: "production" });
    expect(policy.requireSmtp).toBe(true);
    expect(policy.allowMailtoWithoutSmtp).toBe(false);
    expect(policy.allowMailtoOnSmtpFailure).toBe(true);
  });

  it("allows overriding production fallback policy with env flag", () => {
    const policy = resolveForecastDeliveryPolicy({
      NODE_ENV: "production",
      FORECAST_ALLOW_MAILTO_FALLBACK: "true",
    });
    expect(policy.requireSmtp).toBe(false);
    expect(policy.allowMailtoWithoutSmtp).toBe(true);
    expect(policy.allowMailtoOnSmtpFailure).toBe(true);
  });

  it("enforces SMTP when explicitly configured in non-production", () => {
    const policy = resolveForecastDeliveryPolicy({
      NODE_ENV: "development",
      FORECAST_SMTP_REQUIRED: "1",
    });
    expect(policy.requireSmtp).toBe(true);
    expect(policy.allowMailtoWithoutSmtp).toBe(false);
    expect(policy.allowMailtoOnSmtpFailure).toBe(true);
  });

  it("can hard-block fallback even after SMTP send failure", () => {
    const policy = resolveForecastDeliveryPolicy({
      NODE_ENV: "production",
      FORECAST_SMTP_REQUIRED: "true",
      FORECAST_DISABLE_MAILTO_ON_SMTP_FAILURE: "true",
    });
    expect(policy.requireSmtp).toBe(true);
    expect(policy.allowMailtoWithoutSmtp).toBe(false);
    expect(policy.allowMailtoOnSmtpFailure).toBe(false);
  });
});
