import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
import { useState } from "react";
import App from "./App";
import "./index.css";

// Imports
import { ClerkAuthProviderInner } from "@/hooks/use-auth";
import { SyncProvider } from "@/hooks/use-sync";
import { SettingsProvider } from "@/hooks/use-settings";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "sonner";
import { HelmetProvider } from "react-helmet-async";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
  });
}

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const CLERK_ENABLED = Boolean(PUBLISHABLE_KEY);

const rootEl = document.getElementById("root");

function AppBootstrap() {
  const [, forceLocaleRefresh] = useState(0);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("VetTrack: service worker registration failed", err);
    });
  }, []);
  useEffect(() => {
    const handler = () => forceLocaleRefresh((v) => v + 1);
    window.addEventListener("vettrack:locale-changed", handler as EventListener);
    return () => window.removeEventListener("vettrack:locale-changed", handler as EventListener);
  }, []);

  return <App />;
}

if (!rootEl) {
  console.error("VetTrack: #root element not found — cannot mount app.");
} else {
  const appShell = (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ClerkAuthProviderInner>
          <SyncProvider>
            <AppBootstrap />
            <Toaster position="top-center" />
          </SyncProvider>
        </ClerkAuthProviderInner>
      </SettingsProvider>
    </QueryClientProvider>
  );

  createRoot(rootEl).render(
    <HelmetProvider>
      {CLERK_ENABLED ? (
        <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
          {appShell}
        </ClerkProvider>
      ) : (
        appShell
      )}
    </HelmetProvider>
  );
}