import { useEffect, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

export function SwUpdateBanner() {
  const workerRef = useRef<ServiceWorker | null>(null);
  const toastShownRef = useRef(false);

  useEffect(() => {
    function handleSwUpdate(event: Event) {
      const customEvent = event as CustomEvent<{ worker: ServiceWorker }>;
      workerRef.current = customEvent.detail.worker;

      if (toastShownRef.current) return;
      toastShownRef.current = true;

      toast("Update available – tap to refresh", {
        duration: Infinity,
        action: {
          label: "Refresh",
          onClick: () => {
            const worker = workerRef.current;
            if (worker) {
              worker.postMessage("SKIP_WAITING");
              navigator.serviceWorker.addEventListener("controllerchange", () => {
                window.location.reload();
              }, { once: true });
            } else {
              window.location.reload();
            }
          },
        },
        icon: <RefreshCw className="w-4 h-4" />,
      });
    }

    window.addEventListener("sw-update-available", handleSwUpdate);
    return () => window.removeEventListener("sw-update-available", handleSwUpdate);
  }, []);

  return null;
}
