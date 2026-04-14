import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { UserRole } from "@/types";
import { setAuthState, setTokenGetter } from "@/lib/auth-store";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { restoreOfflineSession, saveOfflineSession, clearOfflineSession } from "@/lib/offline-session";
import { setAuthStateRef, clearHaltQueue } from "@/lib/sync-engine";

export type UserStatus = "pending" | "active" | "blocked" | null;

interface AuthState {
  userId: string | null; email: string | null; name: string | null;
  role: UserRole; status: UserStatus; isLoaded: boolean;
  isSignedIn: boolean; isAdmin: boolean; isOfflineSession: boolean;
}

interface AuthContextType extends AuthState { signOut: () => Promise<void>; }

const AuthContext = createContext<AuthContextType>({
  userId: null, email: null, name: null, role: "technician", status: null,
  isLoaded: false, isSignedIn: false, isAdmin: false, isOfflineSession: false,
  signOut: async () => {},
});

export function ClerkAuthProviderInner({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken, signOut: clerkSignOut } = useClerkAuth();
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({
    userId: null, email: null, name: null, role: "technician", status: null,
    isLoaded: false, isSignedIn: false, isAdmin: false, isOfflineSession: false,
  });

  // Keep a stable ref to getToken so the sync engine can always call the
  // latest version without triggering re-renders or stale closures.
  const getTokenRef = useRef(getToken);
  useEffect(() => { getTokenRef.current = getToken; }, [getToken]);

  // Register a snapshot getter for the sync engine to call inside processQueue.
  // We use a ref-backed getter to avoid the authStateGetter closure going stale.
  const stateRef = useRef(state);
  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    setAuthStateRef(() => ({
      isSignedIn: stateRef.current.isSignedIn,
      isOfflineSession: stateRef.current.isOfflineSession,
    }));
    return () => setAuthStateRef(() => null);
  }, []);

  const signOut = useCallback(async () => {
    setTokenGetter(null);
    clearOfflineSession();
    queryClient.clear();
    await clerkSignOut({ redirectUrl: "/landing" });
    window.location.reload();
  }, [queryClient, clerkSignOut]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      setState(s => ({ ...s, isLoaded: true, isSignedIn: false }));
      setTokenGetter(null);
      return;
    }

    async function syncSession() {
      const token = await getTokenRef.current();
      const email = user?.primaryEmailAddress?.emailAddress || "";
      const name = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
      
      const headers = { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };

      try {
        // 1. Fetch existing user record.
        let res = await fetch("/api/users/me", { headers });
        
        // 2. If not found (404/401) provision the user via /sync.
        if (!res.ok && res.status !== 403) {
          res = await fetch("/api/users/sync", {
            method: "POST",
            headers,
            body: JSON.stringify({ clerkId: user?.id, email, name })
          });
        }

        const data = await res.json();
        
        if (res.ok) {
          // Populate auth-store so getAuthHeaders() and getFreshToken() work.
          setAuthState({
            userId: user?.id || "",
            email,
            name,
            bearerToken: token || null,
          });

          // Wire a live tokenGetter so every sync attempt fetches a fresh JWT.
          setTokenGetter(() => getTokenRef.current());

          // Clear any halt left over from a previous 401 in the sync engine.
          clearHaltQueue();

          saveOfflineSession({
            userId: user?.id || "", email, name,
            role: data.role, status: data.status, token: token || ""
          });

          setState({
            userId: user?.id || null, email, name,
            role: data.role, status: data.status,
            isLoaded: true, isSignedIn: true, isAdmin: data.role === "admin",
            isOfflineSession: false
          });
        } else if (res.status === 403) {
          // Distinguish pending vs blocked based on the error message returned
          // by the server (both arrive as 403 but carry different error strings).
          const errorMsg: string = data.error || "";
          const derivedStatus: UserStatus = errorMsg.includes("pending") ? "pending" : "blocked";
          setState(s => ({ ...s, isLoaded: true, isSignedIn: true, status: derivedStatus }));
        }
      } catch (err) {
        console.error("Auth Sync Error:", err);
        setState(s => ({ ...s, isLoaded: true }));
      }
    }

    syncSession();
  }, [isLoaded, isSignedIn, user?.id]);

  const value = useMemo(() => ({ ...state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
