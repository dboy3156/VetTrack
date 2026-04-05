import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import App from "./App";
import { DevAuthProvider } from "@/hooks/use-auth";
import { SyncProvider } from "@/hooks/use-sync";
import { SettingsProvider } from "@/hooks/use-settings";
import { Toaster } from "sonner";
import { initSyncEngine } from "@/lib/sync-engine";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});

    if ("PushManager" in window) {
      navigator.serviceWorker.ready.then((registration) => {
        registration.pushManager.getSubscription().then((sub) => {
          const storedEndpoint = localStorage.getItem("push_subscription_endpoint");
          if (storedEndpoint && (!sub || sub.endpoint !== storedEndpoint)) {
            localStorage.removeItem("push_subscription_endpoint");
          }
        });
      }).catch(() => {});
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

initSyncEngine(queryClient);

function Root() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <DevAuthProvider>
          <SettingsProvider>
            <SyncProvider>
              <App />
              <Toaster richColors position="top-center" />
            </SyncProvider>
          </SettingsProvider>
        </DevAuthProvider>
      </QueryClientProvider>
    </HelmetProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
