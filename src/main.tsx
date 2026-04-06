import { StrictMode, Component } from "react";
import type { ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { HelmetProvider } from "react-helmet-async";
import * as Sentry from "@sentry/react";
import { ClerkProvider } from "@clerk/clerk-react";
import "./index.css";
import App from "./App";
import { DevAuthProvider, ClerkAuthProviderInner } from "@/hooks/use-auth";
import { SyncProvider } from "@/hooks/use-sync";
import { SettingsProvider } from "@/hooks/use-settings";
import { Toaster } from "sonner";
import { initSyncEngine } from "@/lib/sync-engine";
import { addPendingSync, removePendingSync } from "@/lib/offline-db";

if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    integrations: [],
  });
}

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

if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__vettrack_test = {
    addPendingSync,
    removePendingSync,
  };
}

const CLERK_PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

function InnerApp() {
  return (
    <SettingsProvider>
      <SyncProvider>
        <App />
        <Toaster richColors position="top-center" />
      </SyncProvider>
    </SettingsProvider>
  );
}

class ClerkErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, fontFamily: "monospace", color: "red" }}>
          <h2>Clerk initialization failed</h2>
          <pre>{this.state.error.message}</pre>
          <p>Check your VITE_CLERK_PUBLISHABLE_KEY and CLERK_SECRET_KEY secrets.</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function Root() {
  return (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        {CLERK_PUBLISHABLE_KEY ? (
          <ClerkErrorBoundary>
            <ClerkProvider publishableKey={CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/landing">
              <ClerkAuthProviderInner>
                <InnerApp />
              </ClerkAuthProviderInner>
            </ClerkProvider>
          </ClerkErrorBoundary>
        ) : (
          <DevAuthProvider>
            <InnerApp />
          </DevAuthProvider>
        )}
      </QueryClientProvider>
    </HelmetProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
