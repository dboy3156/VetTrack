import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { UserRole } from "@/types";
import { setAuthState } from "@/lib/auth-store";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { restoreOfflineSession, saveOfflineSession, clearOfflineSession } from "@/lib/offline-session";
import { setAuthStateRef, clearHaltQueue, processQueue } from "@/lib/sync-engine";

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

  const offlineSnapshot = typeof window !== "undefined" && !navigator.onLine
    ? restoreOfflineSession()
    : null;

  const [state, setState] = useState<AuthState>(() => {
    if (offlineSnapshot) {
      setAuthState({
        userId: offlineSnapshot.userId,
        email: offlineSnapshot.email,
        name: offlineSnapshot.name,
        bearerToken: offlineSnapshot.token,
      });

      return {
        userId: offlineSnapshot.userId,
        email: offlineSnapshot.email,
        name: offlineSnapshot.name,
        role: offlineSnapshot.role as UserRole,
        status: offlineSnapshot.status as UserStatus,
        isLoaded: true,
        isSignedIn: true,
        isAdmin: offlineSnapshot.role === "admin",
        isOfflineSession: true,
      };
    }

    return {
      userId: null, email: null, name: null, role: "technician", status: null,
      isLoaded: false, isSignedIn: false, isAdmin: false, isOfflineSession: false,
    };
  });
  const stateRef = useRef(state);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    setAuthStateRef(() => ({
      isSignedIn: stateRef.current.isSignedIn,
      isOfflineSession: stateRef.current.isOfflineSession,
    }));
    return () => {
      setAuthStateRef(() => null);
    };
  }, []);

  const signOut = useCallback(async () => {
    clearOfflineSession();
    clearHaltQueue();
    setAuthState({ userId: "", email: "", name: "", bearerToken: null });
    queryClient.clear();
    await clerkSignOut({ redirectUrl: "/landing" });
    window.location.reload();
  }, [queryClient, clerkSignOut]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      clearHaltQueue();
      setAuthState({ userId: "", email: "", name: "", bearerToken: null });
      setState({
        userId: null, email: null, name: null, role: "technician", status: null,
        isLoaded: true, isSignedIn: false, isAdmin: false, isOfflineSession: false,
      });
      return;
    }

    async function syncSession() {
      const token = await getToken();
      const email = user?.primaryEmailAddress?.emailAddress || "";
      const name = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
      const userId = user?.id || "";

      setAuthState({
        userId,
        email,
        name,
        bearerToken: token || null,
      });

      const headers = { 
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };

      try {
        // 1. נסיון לקבל את המשתמש הקיים
        let res = await fetch("/api/users/me", { headers });
        
        // 2. אם המשתמש לא קיים (404/401), נבצע סנכרון (Provisioning)
        if (!res.ok && res.status !== 403) {
          res = await fetch("/api/users/sync", {
            method: "POST",
            headers,
            body: JSON.stringify({ clerkId: user?.id, email, name })
          });
        }

        const data = await res.json().catch(() => ({}));
        
        if (res.ok) {
          clearHaltQueue();
          saveOfflineSession({
            userId, email, name,
            role: data.role, status: data.status, token: token || ""
          });

          setState({
            userId: userId || null, email, name,
            role: data.role, status: data.status,
            isLoaded: true, isSignedIn: true, isAdmin: data.role === "admin",
            isOfflineSession: false
          });

          processQueue().catch(() => {});
        } else if (res.status === 403) {
          clearHaltQueue();
          // טיפול במשתמשים חסומים/ממתינים
          setState(s => ({ ...s, isLoaded: true, isSignedIn: true, status: data.error?.includes("pending") || data.error?.includes("blocked") ? "pending" : "blocked", isOfflineSession: false }));
        }
      } catch (err) {
        console.error("Auth Sync Error:", err);
        setState(s => ({ ...s, isLoaded: true }));
      }
    }

    syncSession();
  }, [isLoaded, isSignedIn, user?.id, user?.primaryEmailAddress?.emailAddress, user?.firstName, user?.lastName, getToken]);

  const value = useMemo(() => ({ ...state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
