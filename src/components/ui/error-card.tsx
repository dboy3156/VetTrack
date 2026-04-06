import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface ErrorCardProps {
  message?: string;
  onRetry?: () => unknown;
}

export function ErrorCard({
  message = "Failed to load data. Please try again.",
  onRetry,
}: ErrorCardProps) {
  const [isRetrying, setIsRetrying] = useState(false);

  async function handleRetry() {
    if (!onRetry) return;
    setIsRetrying(true);
    try {
      await onRetry();
    } finally {
      setIsRetrying(false);
    }
  }

  return (
    <Card className="border-destructive bg-destructive/5">
      <CardContent className="p-4 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <p className="text-sm text-destructive flex-1">{message}</p>
        {onRetry && (
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0 h-8 px-2.5 gap-1 text-xs"
            onClick={handleRetry}
            disabled={isRetrying}
          >
            <RefreshCw className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`} />
            {isRetrying ? "Trying…" : "Try again"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
