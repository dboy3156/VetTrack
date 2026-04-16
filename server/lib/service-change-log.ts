/**
 * Non-breaking audit trail for service-task mode (log only; never throws from here).
 */

export function logServiceChange(event: string, context: Record<string, unknown>): void {
  const payload = {
    event,
    ts: new Date().toISOString(),
    ...context,
  };
  console.log("[service-change]", JSON.stringify(payload));
}
