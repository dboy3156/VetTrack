function envFlagEnabled(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export interface ForecastDeliveryPolicy {
  requireSmtp: boolean;
  allowMailtoFallback: boolean;
}

/**
 * Production defaults to SMTP-only delivery so users always receive the
 * designed HTML email. Fallback can be explicitly re-enabled via env.
 */
export function resolveForecastDeliveryPolicy(
  env: NodeJS.ProcessEnv = process.env,
): ForecastDeliveryPolicy {
  const forceRequireSmtp = envFlagEnabled(env.FORECAST_SMTP_REQUIRED);
  const forceAllowFallback = envFlagEnabled(env.FORECAST_ALLOW_MAILTO_FALLBACK);
  const isProduction = String(env.NODE_ENV ?? "").trim().toLowerCase() === "production";

  const requireSmtp = forceRequireSmtp || (isProduction && !forceAllowFallback);
  return { requireSmtp, allowMailtoFallback: !requireSmtp };
}
