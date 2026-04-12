import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { UserRole } from "@/types";
import { setAuthState } from "@/lib/auth-store";
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

  const signOut = useCallback(async () => {
    clearOfflineSession();
    queryClient.clear();
    await clerkSignOut({ redirectUrl: "/landing" });
    window.location.reload();
  }, [queryClient, clerkSignOut]);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || !user) {
      setState(s => ({ ...s, isLoaded: true, isSignedIn: false }));
      return;
    }

    async function syncSession() {
      const token = await getToken();
      const email = user?.primaryEmailAddress?.emailAddress || "";
      const name = `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
      
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

        const data = await res.json();
        
        if (res.ok) {
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
          // טיפול במשתמשים חסומים/ממתינים
          setState(s => ({ ...s, isLoaded: true, isSignedIn: true, status: data.error === "Account pending approval" ? "pending" : "blocked" }));
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
