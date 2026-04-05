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
  iconBg = "bg-muted",
  iconColor = "text-muted-foreground",
  borderColor,
}: EmptyStateProps) {
  return (
    <Card className={cn("border-2 border-dashed", borderColor)}>
      <CardContent className="p-10 text-center">
        <div className={cn("w-16 h-16 rounded-xl flex items-center justify-center mx-auto mb-4", iconBg)}>
          <Icon className={cn("w-8 h-8", iconColor)} />
        </div>
        <h3 className="font-bold text-base mb-1">{message}</h3>
        {subMessage && (
          <p className="text-sm text-muted-foreground mt-1">{subMessage}</p>
        )}
        {action && <div className="mt-4">{action}</div>}
      </CardContent>
    </Card>
  );
}
