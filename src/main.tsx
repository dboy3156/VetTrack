import "./instrument";

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
import { addPendingSync, removePendingSync, runStartupCleanup } from "@/lib/offline-db";

declare global {
  interface Window {
    __vettrack_test?: Record<string, unknown>;
  }
}

// ─── Chunk / Module-load error recovery ──────────────────────────────────────
// When a Vite deploy replaces hashed JS bundles, any tab still running the
// previous index.html will try to load old chunk URLs that no longer exist on
// the server. This produces "Failed to fetch dynamically imported module" or
// "ChunkLoadError" — the page goes blank. We recover by:
//   1. Detecting these specific error patterns.
//   2. Wiping the SW cache (removes the stale index.html and old chunks).
//   3. Hard-reloading once. sessionStorage prevents an infinite reload loop.

const CHUNK_ERROR_PATTERNS = [
  "Failed to fetch dynamically imported module",
  "Importing a module script failed",
  "ChunkLoadError",
  "Unable to preload CSS",
];

function isChunkError(message: string): boolean {
  return CHUNK_ERROR_PATTERNS.some((p) => message.includes(p));
}

async function recoverFromChunkError(): Promise<void> {
  const RELOAD_FLAG = "vettrack_chunk_reload";
  if (sessionStorage.getItem(RELOAD_FLAG)) return; // already tried — don't loop
  sessionStorage.setItem(RELOAD_FLAG, "1");

  // Wipe all SW caches so the next load fetches fresh assets from the server
  if ("caches" in window) {
    const keys = await caches.keys().catch(() => [] as string[]);
    await Promise.allSettled(keys.map((k) => caches.delete(k)));
  }

  console.warn("[VetTrack] Chunk load error detected — clearing cache and reloading");
  window.location.reload();
}

// Synchronous script errors (rare for dynamic imports but catches some environments)
window.addEventListener("error", (event) => {
  if (event.message && isChunkError(event.message)) {
    recoverFromChunkError();
  }
});

// Dynamic import failures surface as unhandled promise rejections
window.addEventListener("unhandledrejection", (event) => {
  const msg =
    (event.reason as Error)?.message ??
    (typeof event.reason === "string" ? event.reason : "");
  if (isChunkError(msg)) {
    event.preventDefault(); // don't spam the console with the raw rejection
    recoverFromChunkError();
  }
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").then((registration) => {
      function notifyUpdateAvailable(worker: ServiceWorker) {
        window.dispatchEvent(new CustomEvent("sw-update-available", { detail: { worker } }));
      }

      if (registration.waiting) {
        notifyUpdateAvailable(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const newWorker = registration.installing;
        if (!newWorker) return;
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            notifyUpdateAvailable(newWorker);
          }
        });
      });
    }).catch(() => {});

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
  window.__vettrack_test = {
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
        <div
          style={{
            padding: "2rem",
            fontFamily: "system-ui, -apple-system, sans-serif",
            color: "#1e293b",
            textAlign: "center",
            maxWidth: 360,
            margin: "0 auto",
            paddingTop: "4rem",
          }}
        >
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔌</div>
          <h2 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Having trouble connecting
          </h2>
          <p style={{ color: "#64748b", fontSize: "0.875rem", lineHeight: 1.6, marginBottom: "1.5rem" }}>
            We couldn't reach the authentication service. Please check your internet connection and try again.
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "0.625rem 1.5rem",
              background: "#2563eb",
              color: "#fff",
              border: "none",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Refresh page
          </button>
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

function mount() {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <Root />
    </StrictMode>
  );
}

runStartupCleanup(queryClient).catch(() => {}).finally(mount);
