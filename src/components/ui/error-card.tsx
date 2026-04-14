import { useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

const MAX_RETRIES = 3;
const MIN_SPINNER_MS = 1000;

interface ErrorCardProps {
  message?: string;
  onRetry?: () => unknown;
}

export function ErrorCard({
  message = t.errorCard.defaultMessage,
  onRetry,
}: ErrorCardProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  async function handleRetry() {
    if (!onRetry || isRetrying) return;
    setIsRetrying(true);
    let succeeded = false;
    try {
      const [result] = await Promise.all([
        onRetry(),
        new Promise<void>((resolve) => setTimeout(resolve, MIN_SPINNER_MS)),
      ]);
      // react-query refetch() resolves with { isError, isSuccess, ... }
      // Treat as success unless the result explicitly signals an error
      if (result && typeof result === "object" && "isError" in result) {
        succeeded = !(result as { isError: boolean }).isError;
      } else {
        succeeded = true;
      }
    } catch {
      succeeded = false;
    } finally {
      setIsRetrying(false);
    }
    if (succeeded) {
      setRetryCount(0);
    } else {
      setRetryCount((c) => c + 1);
    }
  }

  const exhausted = retryCount >= MAX_RETRIES;
  const displayMessage = exhausted
    ? t.errorCard.exhaustedMessage
    : message;

  return (
    <Card className="border-destructive bg-destructive/5">
      <CardContent className="p-4 flex items-center gap-3">
        <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
        <p className="text-sm text-destructive flex-1">{displayMessage}</p>
        {exhausted ? (
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0 h-11 px-2.5 gap-1 text-xs"
            onClick={() => window.location.reload()}
          >
            {t.errorCard.refreshPage}
          </Button>
        ) : (
          onRetry && (
            <Button
              size="sm"
              variant="outline"
              className="border-destructive/50 text-destructive hover:bg-destructive/10 shrink-0 h-11 px-2.5 gap-1 text-xs"
              onClick={handleRetry}
              disabled={isRetrying}
            >
              <RefreshCw className={`w-3 h-3 ${isRetrying ? "animate-spin" : ""}`} />
              {isRetrying ? t.errorCard.retrying : t.errorCard.retry}
            </Button>
          )
        )}
      </CardContent>
    </Card>
  );
}
