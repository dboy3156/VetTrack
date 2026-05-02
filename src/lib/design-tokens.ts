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
