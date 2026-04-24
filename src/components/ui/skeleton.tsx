import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl bg-gradient-to-r from-muted/85 via-muted to-muted/85",
        "motion-safe:animate-pulse motion-reduce:animate-none",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
