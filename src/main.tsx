import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import "./index.css";
import App from "./App";
import { DevAuthProvider } from "@/hooks/use-auth";
import { SyncProvider } from "@/hooks/use-sync";
import { Toaster } from "sonner";
import { initSyncEngine } from "@/lib/sync-engine";

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
          <SyncProvider>
            <App />
            <Toaster richColors position="top-center" />
          </SyncProvider>
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
