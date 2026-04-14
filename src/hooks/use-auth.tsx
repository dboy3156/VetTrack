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

interface SyncedUserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  error?: string;
  message?: string;
}

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
      const clerkId = user?.id || "";

      setAuthState({
        userId: "",
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
            body: JSON.stringify({ clerkId, email, name })
          });
        }

        const data = await res.json().catch(() => ({} as Partial<SyncedUserResponse>));
        
        if (res.ok) {
          const dbUserId = typeof data.id === "string" ? data.id : "";
          const role = (data.role ?? "technician") as UserRole;
          const status = (data.status ?? null) as UserStatus;
          const resolvedEmail = typeof data.email === "string" ? data.email : email;
          const resolvedName = typeof data.name === "string" ? data.name : name;
          if (!dbUserId) {
            throw new Error("Missing DB user ID in /api/users/me response");
          }

          setAuthState({
            userId: dbUserId,
            email: resolvedEmail,
            name: resolvedName,
            bearerToken: token || null,
          });

          clearHaltQueue();
          saveOfflineSession({
            userId: dbUserId,
            email: resolvedEmail,
            name: resolvedName,
            role,
            status: status ?? "active",
            token: token || ""
          });

          setState({
            userId: dbUserId,
            email: resolvedEmail,
            name: resolvedName,
            role,
            status,
            isLoaded: true, isSignedIn: true, isAdmin: role === "admin",
            isOfflineSession: false
          });

          processQueue().catch(() => {});
        } else if (res.status === 403) {
          clearHaltQueue();
          const errorText = [data.error, data.message]
            .filter((part): part is string => typeof part === "string")
            .join(" ")
            .toLowerCase();
          const resolvedStatus: UserStatus = errorText.includes("blocked")
            ? "blocked"
            : errorText.includes("pending")
              ? "pending"
              : "blocked";
          setState(s => ({
            ...s,
            isLoaded: true,
            isSignedIn: true,
            status: resolvedStatus,
            isOfflineSession: false,
          }));
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
