import { useState, useEffect, useCallback } from "react";
import { AlertTriangle, X, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ServerErrorBannerProps {
  message?: string;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export function ServerErrorBanner({
  message = "The server is currently unavailable. Some features may not work.",
  onDismiss,
  onRetry,
  className,
}: ServerErrorBannerProps) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm",
        className
      )}
      role="alert"
    >
      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
      <p className="flex-1 text-destructive font-medium">{message}</p>
      <div className="flex items-center gap-1 shrink-0">
        {onRetry && (
          <button
            onClick={onRetry}
            className="p-1 rounded hover:bg-destructive/20 transition-colors text-destructive"
            aria-label="Retry"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-destructive/20 transition-colors text-destructive"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

const SERVER_ERROR_EVENT = "vettrack:server-error";
const SERVER_ERROR_CLEAR_EVENT = "vettrack:server-error-clear";

export function emitServerError(message?: string) {
  window.dispatchEvent(new CustomEvent(SERVER_ERROR_EVENT, { detail: { message } }));
}

export function clearServerError() {
  window.dispatchEvent(new CustomEvent(SERVER_ERROR_CLEAR_EVENT));
}

export function GlobalServerErrorBanner() {
  const [error, setError] = useState<{ message?: string } | null>(null);

  const handleError = useCallback((e: Event) => {
    const detail = (e as CustomEvent).detail;
    setError(detail || {});
  }, []);

  const handleClear = useCallback(() => {
    setError(null);
  }, []);

  useEffect(() => {
    window.addEventListener(SERVER_ERROR_EVENT, handleError);
    window.addEventListener(SERVER_ERROR_CLEAR_EVENT, handleClear);
    return () => {
      window.removeEventListener(SERVER_ERROR_EVENT, handleError);
      window.removeEventListener(SERVER_ERROR_CLEAR_EVENT, handleClear);
    };
  }, [handleError, handleClear]);

  if (!error) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 p-3 pointer-events-auto">
      <ServerErrorBanner
        message={error.message}
        onDismiss={() => setError(null)}
      />
    </div>
  );
}
