import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import * as Sentry from "@sentry/react";
import { useEffect } from "react";
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

const rootEl = document.getElementById("root");

function AppBootstrap() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.error("VetTrack: service worker registration failed", err);
    });
  }, []);

  return <App />;
}

if (!rootEl) {
  console.error("VetTrack: #root element not found — cannot mount app.");
} else {
  createRoot(rootEl).render(
    <HelmetProvider>
      <ClerkProvider
        publishableKey={PUBLISHABLE_KEY}
        // @ts-expect-error Clerk v5 typings omit optional navigate; forwarded to clerk-js for SPA redirects.
        navigate={(to) => window.location.href = to}
      >
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
      </ClerkProvider>
    </HelmetProvider>
  );
}