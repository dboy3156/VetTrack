import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { UserRole } from "@/types";
import { clearAuthState, setAuthState } from "@/lib/auth-store";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { saveOfflineSession, clearOfflineSession } from "@/lib/offline-session";
import { setAuthStateRef, clearHaltQueue, processQueue } from "@/lib/sync-engine";

export type UserStatus = "pending" | "active" | "blocked" | null;

interface AuthState {
  userId: string | null; email: string | null; name: string | null;
  role: UserRole; status: UserStatus; isLoaded: boolean;
  isSignedIn: boolean; isAdmin: boolean; isOfflineSession: boolean;
}

interface SyncAuthState {
  isSignedIn: boolean;
  isOfflineSession: boolean;
}

interface AuthContextType extends AuthState { signOut: () => Promise<void>; }

const AuthContext = createContext<AuthContextType>({
  userId: null, email: null, name: null, role: "technician", status: null,
  isLoaded: false, isSignedIn: false, isAdmin: false, isOfflineSession: false,
  signOut: async () => {},
});

const INITIAL_AUTH_STATE: AuthState = {
  userId: null,
  email: null,
  name: null,
  role: "technician",
  status: null,
  isLoaded: false,
  isSignedIn: false,
  isAdmin: false,
  isOfflineSession: false,
};

const SYNC_DISABLED_STATE: SyncAuthState = {
  isSignedIn: false,
  isOfflineSession: false,
};

export function ClerkAuthProviderInner({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken, signOut: clerkSignOut } = useClerkAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>(INITIAL_AUTH_STATE);
  const syncAuthStateRef = useRef<SyncAuthState>(SYNC_DISABLED_STATE);

  const setSyncAuthState = useCallback((nextState: SyncAuthState) => {
    syncAuthStateRef.current = nextState;
  }, []);

  const clearSharedAuth = useCallback(() => {
    clearAuthState();
    setSyncAuthState(SYNC_DISABLED_STATE);
  }, [setSyncAuthState]);

  useEffect(() => {
    setAuthStateRef(() => syncAuthStateRef.current);
    return () => {
      setAuthStateRef(() => null);
    };
  }, []);

  const signOut = useCallback(async () => {
    clearOfflineSession();
    clearHaltQueue();
    clearSharedAuth();
    queryClient.clear();
    await clerkSignOut({ redirectUrl: "/landing" });
    window.location.reload();
  }, [clearSharedAuth, queryClient, clerkSignOut]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      clearSharedAuth();
      setState({ ...INITIAL_AUTH_STATE, isLoaded: true });
      return;
    }

    let cancelled = false;

    async function syncSession() {
      const token = await getToken();
      if (cancelled) return;
      const email = user?.primaryEmailAddress?.emailAddress || "";
      const name = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };

      clearHaltQueue();
      setAuthState({ userId: "", email, name, bearerToken: token || null });
      setSyncAuthState({ isSignedIn: true, isOfflineSession: false });

      try {
        let res = await fetch("/api/users/me", { headers });

        if (!res.ok && res.status !== 403) {
          res = await fetch("/api/users/sync", {
            method: "POST",
            headers,
            body: JSON.stringify({ clerkId: user?.id, email, name }),
          });
        }

        const data = await res.json();
        if (cancelled) return;

        setAuthState({
          userId: typeof data?.id === "string" ? data.id : "",
          email,
          name,
          bearerToken: token || null,
        });

        if (res.ok) {
          saveOfflineSession({
            userId: user?.id || "", email, name,
            role: data.role, status: data.status, token: token || "",
          });

          setState({
            userId: user?.id || null, email, name,
            role: data.role, status: data.status,
            isLoaded: true, isSignedIn: true, isAdmin: data.role === "admin",
            isOfflineSession: false,
          });
          processQueue().catch((error) => {
            console.error("Failed to start sync queue after auth:", error);
          });
        } else if (res.status === 403) {
          setSyncAuthState(SYNC_DISABLED_STATE);
          setState((s) => ({
            ...s,
            isLoaded: true,
            isSignedIn: true,
            status: data.error?.includes("pending") || data.error?.includes("blocked") ? "pending" : "blocked",
          }));
        } else {
          clearSharedAuth();
          setState((s) => ({ ...s, isLoaded: true }));
        }
      } catch (err) {
        if (cancelled) return;
        console.error("Auth Sync Error:", err);
        setState((s) => ({
          ...s,
          userId: user?.id || s.userId,
          email,
          name,
          isLoaded: true,
          isSignedIn: true,
        }));
      }
    }

    syncSession();
    return () => {
      cancelled = true;
    };
  }, [clearSharedAuth, getToken, isLoaded, isSignedIn, setSyncAuthState, user]);

  const value = useMemo(() => ({ ...state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
