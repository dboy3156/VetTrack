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
    // #region agent log
    fetch('http://127.0.0.1:7766/ingest/898d28b0-9bf3-4dfa-99f8-55f3c787e881',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'a1f84a'},body:JSON.stringify({sessionId:'a1f84a',runId:'rtl-audit-run1',hypothesisId:'H0',location:'src/main.tsx:32',message:'App bootstrap mounted',data:{href:window.location.href,docDir:document.documentElement.getAttribute("dir"),userAgent:navigator.userAgent.slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
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
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
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
