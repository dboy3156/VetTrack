import type { ReactNode, ElementType } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: ElementType;
  message: string;
  subMessage?: string;
  action?: ReactNode;
  iconBg?: string;
  iconColor?: string;
  borderColor?: string;
}

export function EmptyState({
  icon: Icon,
  message,
  subMessage,
  action,
  iconBg = "bg-gradient-to-br from-primary/10 to-muted/60 ring-1 ring-border/50",
  iconColor = "text-primary",
  borderColor,
}: EmptyStateProps) {
  return (
    <Card
      className={cn(
        "border border-dashed border-border/70 bg-muted/5 shadow-sm",
        "motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 motion-safe:duration-300",
        borderColor
      )}
    >
      <CardContent className="p-8 md:p-10 text-center space-y-4">
        <div
          className={cn(
            "w-16 h-16 rounded-2xl flex items-center justify-center mx-auto shadow-inner",
            iconBg
          )}
        >
          <Icon className={cn("w-8 h-8", iconColor)} />
        </div>
        <h3 className="font-semibold text-lg tracking-tight text-foreground">{message}</h3>
        {subMessage && (
          <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">{subMessage}</p>
        )}
        {action && <div className="pt-1">{action}</div>}
      </CardContent>
    </Card>
  );
}
