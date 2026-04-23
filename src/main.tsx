import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/clerk-react";
import { useEffect } from "react";
import { useState } from "react";
import App from "./App";
import "./index.css";
import "./instrument";

// Imports
import { ClerkAuthProviderInner } from "@/hooks/use-auth";
import { SyncProvider } from "@/hooks/use-sync";
import { SettingsProvider } from "@/hooks/use-settings";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "sonner";
import { HelmetProvider } from "react-helmet-async";
import { AppErrorBoundary } from "@/components/ui/app-error-boundary";
import {
  getServiceWorkerRegistrationsSafe,
  isServiceWorkerSupported,
  registerServiceWorkerSafe,
} from "@/lib/safe-browser";

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const CLERK_ENABLED = Boolean(PUBLISHABLE_KEY);

// Local auth mode contract (deterministic):
//   VITE_CLERK_PUBLISHABLE_KEY present => Clerk mode
//   Missing publishable key           => dev bypass mode
// Emits a single, secret-free startup line so operators and agents can confirm
// which mode the browser is about to run in before hitting the UI.
if (import.meta.env.DEV) {
  const rawKey = typeof PUBLISHABLE_KEY === "string" ? PUBLISHABLE_KEY.trim() : "";
  const keyPrefix = rawKey ? rawKey.slice(0, 7) : "(none)";
  // eslint-disable-next-line no-console
  console.info(
    `[auth-mode] client=${CLERK_ENABLED ? "clerk" : "dev-bypass"} publishableKey=${keyPrefix} env=${import.meta.env.MODE}`,
  );
}

const rootEl = document.getElementById("root");

function AppBootstrap() {
  const [localeVersion, setLocaleVersion] = useState(0);
  useEffect(() => {
    if (!isServiceWorkerSupported()) return;
    if (import.meta.env.DEV) {
      // In dev, unregister any cached SW so Vite HMR is never intercepted.
      getServiceWorkerRegistrationsSafe().then((regs) => {
        regs.forEach((r) => {
          r.unregister().catch(() => {});
        });
      });
      return;
    }
    // Cache-busting version param + updateViaCache:'none' so browsers NEVER
    // serve a stale /sw.js from HTTP cache. We were previously stuck in a
    // reload loop because clients had the broken v6 script cached at /sw.js
    // for max-age=14400 and kept re-installing it instead of picking up v7.
    // Bump SW_VERSION whenever sw.js changes in a breaking way.
    const SW_VERSION = "20260422b";
    registerServiceWorkerSafe(`/sw.js?v=${SW_VERSION}`, { updateViaCache: "none" })
      .then((registration) => {
        if (!registration) {
          console.warn("VetTrack: service worker registration unavailable.");
        }
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    const handler = () => setLocaleVersion((v) => v + 1);
    window.addEventListener("vettrack:locale-changed", handler as EventListener);
    return () => window.removeEventListener("vettrack:locale-changed", handler as EventListener);
  }, []);

  return <App key={`locale-${localeVersion}`} />;
}

if (!rootEl) {
  console.error("VetTrack: #root element not found — cannot mount app.");
} else {
  const appShell = (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider>
        <ClerkAuthProviderInner>
          <AppErrorBoundary>
            <SyncProvider>
              <AppBootstrap />
              <Toaster position="top-center" />
            </SyncProvider>
          </AppErrorBoundary>
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
