import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground",
        ok: "border-emerald-200 bg-emerald-100 text-emerald-800",
        issue: "border-red-200 bg-red-100 text-red-800",
        maintenance: "border-amber-200 bg-amber-100 text-amber-800",
        sterilized: "border-primary/30 bg-primary/10 text-primary",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

type BadgeVariant = NonNullable<VariantProps<typeof badgeVariants>["variant"]>;

export type BadgeProps = Omit<
  React.ComponentPropsWithoutRef<"div">,
  "children"
> & {
  variant?: BadgeVariant | null;
  children?: React.ReactNode;
};

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };

// ── StatusBadge — Ivory design system ──────────────────────────────────────
// Dot-prefix pill for equipment / patient status. Separate from the existing
// Badge component — do not merge; they serve different contexts.

export type EquipmentStatus =
  | "Operational"
  | "Due Check"
  | "Review Needed"
  | "Sterilized"
  | "Maintenance";

interface StatusConfig {
  bg: string;
  text: string;
  border: string;
  dot: string;
}

const STATUS_CONFIG: Record<string, StatusConfig> = {
  Operational:     { bg: "bg-[#f0faf2]", text: "text-[#166534]", border: "border-[#a7f3bd]", dot: "bg-[#16a34a]" },
  "Due Check":     { bg: "bg-[#fffbeb]", text: "text-[#78350f]", border: "border-[#fcd34d]", dot: "bg-[#d97706]" },
  "Review Needed": { bg: "bg-[#fff1f1]", text: "text-[#7f1d1d]", border: "border-[#fca5a5]", dot: "bg-[#dc2626]" },
  Sterilized:      { bg: "bg-[#eff6ff]", text: "text-[#1e40af]", border: "border-[#93c5fd]", dot: "bg-[#2563eb]" },
  Maintenance:     { bg: "bg-[#fffbeb]", text: "text-[#78350f]", border: "border-[#fcd34d]", dot: "bg-[#d97706]" },
};

const FALLBACK: StatusConfig = {
  bg: "bg-[#f5f5f5]",
  text: "text-[#555]",
  border: "border-[#ddd]",
  dot: "bg-[#aaa]",
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CONFIG[status] ?? FALLBACK;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-2 py-px rounded-[4px] border",
        "text-[11px] font-semibold",
        s.bg,
        s.text,
        s.border
      )}
    >
      <span className={cn("w-[5px] h-[5px] rounded-full shrink-0", s.dot)} aria-hidden />
      {status}
    </span>
  );
}
