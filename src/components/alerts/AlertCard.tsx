// src/components/alerts/AlertCard.tsx
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export type AlertTone = "err" | "warn" | "ok";

interface AlertCardProps {
  icon: LucideIcon;
  title: string;
  tone: AlertTone;
}

const TONE_STYLES: Record<AlertTone, string> = {
  err:  "bg-[#fff1f1] text-[#b91c1c] border-[#fca5a5]",
  warn: "bg-[#fffbeb] text-[#b45309] border-[#fcd34d]",
  ok:   "bg-[#f0fdf4] text-[#15803d] border-[#a7f3bd]",
};

export function AlertCard({ icon: Icon, title, tone }: AlertCardProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-[7px] border",
        "text-[12.5px] font-semibold",
        TONE_STYLES[tone]
      )}
    >
      <Icon size={16} strokeWidth={2.2} aria-hidden className="shrink-0" />
      <span>{title}</span>
    </div>
  );
}
