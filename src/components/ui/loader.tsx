import { cn } from "@/lib/utils";

interface LoaderProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "syncing";
  className?: string;
}

const SIZE_CLASS: Record<NonNullable<LoaderProps["size"]>, string> = {
  sm: "w-4 h-4 border-2",
  md: "w-6 h-6 border-2",
  lg: "w-10 h-10 border-[3px]",
};

const VARIANT_CLASS: Record<NonNullable<LoaderProps["variant"]>, string> = {
  default: "border-primary/20 border-t-primary",
  syncing: "border-amber-300/30 border-t-amber-400",
};

export function Loader({ label, size = "md", variant = "default", className }: LoaderProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-2", className)}>
      <div
        className={cn("rounded-full animate-spin", SIZE_CLASS[size], VARIANT_CLASS[variant])}
        aria-hidden="true"
      />
      {label && (
        <p className={cn("text-muted-foreground", size === "sm" ? "text-xs" : "text-sm")}>
          {label}
        </p>
      )}
    </div>
  );
}
