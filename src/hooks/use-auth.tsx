import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
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

interface AuthState {
  userId: string | null;
  email: string | null;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  isLoaded: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  isOfflineSession: boolean;
}

interface AuthContextType extends AuthState {
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

function buildOfflineState(
  snapshot: ReturnType<typeof restoreOfflineSession>
): AuthState | null {
  if (!snapshot) return null;
  setAuthState({
    userId: snapshot.userId,
    email: snapshot.email,
    name: snapshot.name,
    bearerToken: snapshot.token,
  });
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
  };
}

const EMPTY_AUTH_STATE: AuthState = {
  userId: null,
  email: null,
  name: null,
  role: "technician" as UserRole,
  status: null,
  isLoaded: false,
  isSignedIn: false,
  isAdmin: false,
  isOfflineSession: false,
};

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

  const signOut = useCallback(async () => {
    clearOfflineSession();
    queryClient.clear();
    const keys = Object.keys(localStorage).filter((k) => k.startsWith("vettrack"));
    keys.forEach((k) => localStorage.removeItem(k));
    await clerkSignOut({ redirectUrl: "/landing" });
  }, [queryClient, clerkSignOut]);

  const [state, setState] = useState<AuthState>(() => {
    if (!navigator.onLine) {
      const snap = restoreOfflineSession();
      const offlineState = buildOfflineState(snap);
      if (offlineState) return offlineState;
    }
    return EMPTY_AUTH_STATE;
  });

  setAuthStateRef(() => ({
    isSignedIn: state.isSignedIn,
    isOfflineSession: state.isOfflineSession,
  }));

  useEffect(() => {
    if (isLoaded || state.isLoaded) return;
    const timer = setTimeout(() => {
      if (state.isLoaded) return;
      const snap = restoreOfflineSession();
      const offlineState = buildOfflineState(snap);
      if (offlineState) {
        setState(offlineState);
      } else {
        setState((s) => ({ ...s, isLoaded: true }));
      }
    }, 10_000);
    return () => clearTimeout(timer);
  }, [isLoaded, state.isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function sync() {
      if (!isSignedIn || !user) {
        clearOfflineSession();
        setAuthState({ userId: "", email: "", name: "", bearerToken: null });
        if (!cancelled) {
          setState({
            userId: null,
            email: null,
            name: null,
            role: "technician",
            status: null,
            isLoaded: true,
            isSignedIn: false,
            isAdmin: false,
            isOfflineSession: false,
          });
        }
        return;
      }

      const token = await getSingleFlightToken();
      const email = user.primaryEmailAddress?.emailAddress ?? "";
      const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

      setAuthState({ userId: user.id, email, name, bearerToken: token });

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
          clearHaltQueue();

          saveOfflineSession({
            userId: user.id,
            email,
            name,
            role: data.role ?? "technician",
            status: data.status ?? "active",
            token: token ?? "",
          });

          queryClient.clear();

          setState({
            userId: user.id,
            email,
            name,
            role: data.role ?? "technician",
            status: data.status ?? null,
            isLoaded: true,
            isSignedIn: true,
            isAdmin: data.role === "admin",
            isOfflineSession: false,
          });

          return;
        }
      } catch {
        clearTimeout(timeout);
      }

      if (cancelled) return;

      if (!fetchedFromServer) {
        const snap = restoreOfflineSession();
        if (snap && snap.userId === user.id) {
          setAuthState({
            userId: user.id,
            email,
            name,
            bearerToken: token,
          });
          if (!cancelled) {
            setState({
              userId: snap.userId,
              email: snap.email,
              name: snap.name,
              role: snap.role as UserRole,
              status: snap.status as UserStatus,
              isLoaded: true,
              isSignedIn: true,
              isAdmin: snap.role === "admin",
              isOfflineSession: true,
            });
          }
          return;
        }
      }

      if (!cancelled) {
        setState({
          userId: user.id,
          email,
          name,
          role: "technician",
          status: null,
          isLoaded: true,
          isSignedIn: true,
          isAdmin: false,
          isOfflineSession: false,
        });
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

  const contextValue = useMemo<AuthContextType>(
    () => ({ ...state, signOut }),
    [state, signOut]
  );

  return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
