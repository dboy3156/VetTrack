import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from "react";
import type { Shift, ShiftRole, UserRole } from "@/types";
import { setAuthState } from "@/lib/auth-store";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import { restoreOfflineSession, saveOfflineSession, clearOfflineSession } from "@/lib/offline-session";
import { setAuthStateRef, clearHaltQueue, processQueue } from "@/lib/sync-engine";

export type UserStatus = "pending" | "active" | "blocked" | null;

interface AuthState {
  userId: string | null; email: string | null; name: string | null;
  role: UserRole;
  effectiveRole: UserRole | ShiftRole;
  roleSource: "shift" | "permanent";
  activeShift: Shift | null;
  resolvedAt: string | null;
  status: UserStatus;
  isLoaded: boolean;
  isSignedIn: boolean; isAdmin: boolean; isOfflineSession: boolean;
}

interface AuthContextType extends AuthState { signOut: () => Promise<void>; }

interface SyncedUserResponse {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  effectiveRole?: UserRole | ShiftRole;
  roleSource?: "shift" | "permanent";
  activeShift?: Shift | null;
  resolvedAt?: string;
  status: UserStatus;
  error?: string;
  message?: string;
}

const AuthContext = createContext<AuthContextType>({
  userId: null, email: null, name: null, role: "technician",
  effectiveRole: "technician", roleSource: "permanent", activeShift: null, resolvedAt: null, status: null,
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
        effectiveRole: offlineSnapshot.role as UserRole,
        roleSource: "permanent",
        activeShift: null,
        resolvedAt: null,
        status: offlineSnapshot.status as UserStatus,
        isLoaded: true,
        isSignedIn: true,
        isAdmin: offlineSnapshot.role === "admin",
        isOfflineSession: true,
      };
    }

    return {
      userId: null, email: null, name: null, role: "technician",
      effectiveRole: "technician", roleSource: "permanent", activeShift: null, resolvedAt: null, status: null,
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
        userId: null, email: null, name: null, role: "technician",
        effectiveRole: "technician", roleSource: "permanent", activeShift: null, resolvedAt: null, status: null,
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
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        // 1. Try fetching the existing user
        let res = await fetch("/api/users/me", { headers, signal: controller.signal });
        
        // 2. Sync/provision only when user is missing/unauthorized.
        // Avoid calling /sync on transient failures such as 429.
        if (!res.ok && (res.status === 401 || res.status === 404)) {
          res = await fetch("/api/users/sync", {
            method: "POST",
            headers,
            body: JSON.stringify({ clerkId, email, name }),
            signal: controller.signal,
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
            effectiveRole: (data.effectiveRole ?? role) as UserRole | ShiftRole,
            roleSource: data.roleSource ?? "permanent",
            activeShift: data.activeShift ?? null,
            resolvedAt: data.resolvedAt ?? null,
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
        } else if (res.status === 401) {
          // Clerk reports signed-in, but backend rejected auth token/session.
          // Resolve to signed-out state so AuthGuard routes to /signin instead
          // of leaving protected pages mounted in a bad auth loop.
          console.error("Auth sync unauthorized:", data);
          clearHaltQueue();
          setAuthState({ userId: "", email: "", name: "", bearerToken: null });
          setState({
            userId: null, email: null, name: null, role: "technician",
            effectiveRole: "technician", roleSource: "permanent", activeShift: null, resolvedAt: null, status: null,
            isLoaded: true, isSignedIn: false, isAdmin: false, isOfflineSession: false,
          });
        } else {
          // Resolve auth state without forcing a local sign-out.
          // For transient errors (e.g. 429) forcing isSignedIn=false can create
          // a redirect loop with Clerk session state.
          console.error("Auth sync failed with unexpected status:", res.status, data);
          clearHaltQueue();
          setState((s) => ({
            ...s,
            isLoaded: true,
            isSignedIn: true,
            status: "pending",
            isOfflineSession: false,
          }));
        }
      } catch (err) {
        console.error("Auth Sync Error:", err);
        clearHaltQueue();
        setAuthState({ userId: "", email: "", name: "", bearerToken: null });
        setState({
          userId: null, email: null, name: null, role: "technician",
          effectiveRole: "technician", roleSource: "permanent", activeShift: null, resolvedAt: null, status: null,
          isLoaded: true, isSignedIn: false, isAdmin: false, isOfflineSession: false,
        });
      } finally {
        clearTimeout(timeoutId);
      }
    }

    syncSession();
  }, [isLoaded, isSignedIn, user?.id, user?.primaryEmailAddress?.emailAddress, user?.firstName, user?.lastName, getToken]);

  const value = useMemo(() => ({ ...state, signOut }), [state, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
