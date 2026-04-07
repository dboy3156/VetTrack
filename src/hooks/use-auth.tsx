import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { UserRole } from "@/types";
import { setAuthState } from "@/lib/auth-store";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  restoreOfflineSession,
  saveOfflineSession,
  clearOfflineSession,
} from "@/lib/offline-session";
import { setAuthStateRef, clearHaltQueue } from "@/lib/sync-engine";

export type UserStatus = "pending" | "active" | "blocked" | null;

interface AuthContextType {
  userId: string | null;
  email: string | null;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  isLoaded: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  isOfflineSession: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  userId: null,
  email: null,
  name: null,
  role: "technician" as UserRole,
  status: null,
  isLoaded: false,
  isSignedIn: false,
  isAdmin: false,
  isOfflineSession: false,
  signOut: async () => {},
});

const DEV_USER = {
  userId: "dev-admin-001",
  email: "admin@vettrack.dev",
  name: "Dev Admin",
  role: "admin" as UserRole,
  status: "active" as UserStatus,
};

interface ProviderProps {
  children: ReactNode;
}

export function DevAuthProvider({ children }: ProviderProps) {
  const [state, setState] = useState<AuthContextType>({
    ...DEV_USER,
    isLoaded: false,
    isSignedIn: true,
    isAdmin: true,
    isOfflineSession: false,
    signOut: async () => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("vettrack"));
      keys.forEach((k) => localStorage.removeItem(k));
      window.location.href = "/landing";
    },
  });

  useEffect(() => {
    setAuthState({
      userId: DEV_USER.userId,
      email: DEV_USER.email,
      name: DEV_USER.name,
      bearerToken: null,
    });
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, isLoaded: true }));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function ClerkAuthProviderInner({ children }: ProviderProps) {
  const { isLoaded, isSignedIn, user } = useUser();
  const { getToken, signOut: clerkSignOut } = useClerkAuth();
  const queryClient = useQueryClient();

  const tokenFlightRef = useRef<Promise<string | null> | null>(null);

  function getSingleFlightToken(): Promise<string | null> {
    if (tokenFlightRef.current) return tokenFlightRef.current;
    const p = getToken().finally(() => {
      tokenFlightRef.current = null;
    });
    tokenFlightRef.current = p;
    return p;
  }

  const signOutFn = async () => {
    clearOfflineSession();
    queryClient.clear();
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("vettrack"));
    keys.forEach((k) => localStorage.removeItem(k));
    await clerkSignOut({ redirectUrl: "/landing" });
  };

  const [state, setState] = useState<AuthContextType>(() => {
    const snapshot = restoreOfflineSession();
    if (snapshot) {
      return {
        userId: snapshot.userId,
        email: snapshot.email,
        name: snapshot.name,
        role: snapshot.role as UserRole,
        status: snapshot.status as UserStatus,
        isLoaded: true,
        isSignedIn: true,
        isAdmin: snapshot.role === "admin",
        isOfflineSession: true,
        signOut: signOutFn,
      };
    }
    return {
      userId: null,
      email: null,
      name: null,
      role: "technician" as UserRole,
      status: null,
      isLoaded: false,
      isSignedIn: false,
      isAdmin: false,
      isOfflineSession: false,
      signOut: signOutFn,
    };
  });

  useEffect(() => {
    setState((s) => ({ ...s, signOut: signOutFn }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const currentState = state;
    setAuthStateRef(() => ({ isSignedIn: currentState.isSignedIn && !currentState.isOfflineSession }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.isSignedIn, state.isOfflineSession]);

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function sync() {
      if (!isSignedIn || !user) {
        clearOfflineSession();
        setAuthState({ userId: "", email: "", name: "", bearerToken: null });
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            userId: null,
            email: null,
            name: null,
            role: "technician",
            status: null,
            isLoaded: true,
            isSignedIn: false,
            isAdmin: false,
            isOfflineSession: false,
          }));
        }
        return;
      }

      const token = await getSingleFlightToken();
      const email = user.primaryEmailAddress?.emailAddress ?? "";
      const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

      setAuthState({ userId: user.id, email, name, bearerToken: token });
      clearHaltQueue();

      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5_000);

      let fetchedFromServer = false;
      try {
        const res = await fetch("/api/users/me", { headers, signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok && !cancelled) {
          const data = await res.json();
          fetchedFromServer = true;

          saveOfflineSession({
            userId: user.id,
            email,
            name,
            role: data.role ?? "technician",
            status: data.status ?? "active",
            token: token ?? "",
          });

          const wasOffline = state.isOfflineSession;
          setState((prev) => ({
            ...prev,
            userId: user.id,
            email,
            name,
            role: data.role ?? "technician",
            status: data.status ?? null,
            isLoaded: true,
            isSignedIn: true,
            isAdmin: data.role === "admin",
            isOfflineSession: false,
          }));

          if (wasOffline) {
            queryClient.invalidateQueries();
          }

          return;
        }
      } catch {
        clearTimeout(timeout);
      }

      if (cancelled) return;

      if (!fetchedFromServer) {
        const snapshot = restoreOfflineSession();
        if (snapshot && snapshot.userId === user.id) {
          setState((prev) => ({
            ...prev,
            userId: snapshot.userId,
            email: snapshot.email,
            name: snapshot.name,
            role: snapshot.role as UserRole,
            status: snapshot.status as UserStatus,
            isLoaded: true,
            isSignedIn: true,
            isAdmin: snapshot.role === "admin",
            isOfflineSession: true,
          }));
          return;
        }
      }

      if (!cancelled) {
        setState((prev) => ({
          ...prev,
          userId: user.id,
          email,
          name,
          role: "technician",
          status: null,
          isLoaded: true,
          isSignedIn: true,
          isAdmin: false,
          isOfflineSession: false,
        }));
      }
    }

    sync().catch(() => {
      if (!cancelled) setState((s) => ({ ...s, isLoaded: true }));
    });

    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded, isSignedIn, user?.id]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
