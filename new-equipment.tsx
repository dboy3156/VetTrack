// client/src/lib/constants.ts

import {
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Sparkles,
  Clock,
  Ban
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import React from "react";

/**
 * Status Types
 */
export type EquipmentStatus =
  | "ok"
  | "issue"
  | "maintenance"
  | "sterilized"
  | "overdue"
  | "inactive";

/**
 * Status Config Type
 */
type StatusConfig = {
  label: string;
  icon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  hex: string;
};

/**
 * Centralized STATUS CONFIG
 */
export const STATUS_CONFIG: Record<EquipmentStatus, StatusConfig> = {
  ok: {
    label: "OK",
    icon: CheckCircle2,
    color: "text-green-600",
    bg: "bg-green-100",
    border: "border-green-200",
    hex: "#16a34a"
  },
  issue: {
    label: "Issue",
    icon: AlertTriangle,
    color: "text-orange-600",
    bg: "bg-orange-100",
    border: "border-orange-200",
    hex: "#ea580c"
  },
  maintenance: {
    label: "Maintenance",
    icon: Wrench,
    color: "text-blue-600",
    bg: "bg-blue-100",
    border: "border-blue-200",
    hex: "#2563eb"
  },
  sterilized: {
    label: "Sterilized",
    icon: Sparkles,
    color: "text-teal-600",
    bg: "bg-teal-100",
    border: "border-teal-200",
    hex: "#0d9488"
  },
  overdue: {
    label: "Overdue",
    icon: Clock,
    color: "text-red-600",
    bg: "bg-red-100",
    border: "border-red-200",
    hex: "#dc2626"
  },
  inactive: {
    label: "Inactive",
    icon: Ban,
    color: "text-gray-600",
    bg: "bg-gray-100",
    border: "border-gray-200",
    hex: "#6b7280"
  }
};

/**
 * Reusable StatusBadge Component
 */
export function StatusBadge({
  status,
  className = ""
}: {
  status: EquipmentStatus;
  className?: string;
}) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.ok;
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.bg} ${cfg.color} ${cfg.border} ${className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}