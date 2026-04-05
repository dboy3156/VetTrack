export const spacing = {
  1: "4px",
  2: "8px",
  3: "12px",
  4: "16px",
  6: "24px",
} as const;

export const borderRadius = {
  sm: "rounded-md",
  card: "rounded-xl",
  full: "rounded-full",
} as const;

export const typography = {
  title: "text-2xl font-bold leading-tight",
  subtitle: "text-base font-semibold leading-snug",
  body: "text-sm font-normal leading-normal",
  caption: "text-xs font-medium leading-tight",
} as const;

export const badgeSemantics = {
  ok: "ok",
  warning: "maintenance",
  critical: "issue",
  neutral: "secondary",
  sterilization: "sterilized",
} as const;

export const shadow = {
  card: "shadow-sm",
} as const;

export type BadgeSemanticVariant = "ok" | "issue" | "maintenance" | "sterilized" | "secondary";

export function statusToBadgeVariant(status: string): BadgeSemanticVariant {
  const map: Record<string, BadgeSemanticVariant> = {
    ok: "ok",
    issue: "issue",
    maintenance: "maintenance",
    sterilized: "sterilized",
  };
  return map[status] ?? "secondary";
}
