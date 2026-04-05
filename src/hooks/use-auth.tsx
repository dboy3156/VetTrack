import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { UserRole } from "@/types";
import { setAuthState } from "@/lib/auth-store";
import { useUser, useAuth as useClerkAuth } from "@clerk/clerk-react";

interface AuthContextType {
  userId: string | null;
  email: string | null;
  name: string | null;
  role: UserRole;
  isLoaded: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  userId: null,
  email: null,
  name: null,
  role: "technician" as UserRole,
  isLoaded: false,
  isSignedIn: false,
  isAdmin: false,
  signOut: async () => {},
});

const DEV_USER = {
  userId: "dev-admin-001",
  email: "admin@vettrack.dev",
  name: "Dev Admin",
  role: "admin" as UserRole,
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

  const [state, setState] = useState<AuthContextType>({
    userId: null,
    email: null,
    name: null,
    role: "technician" as UserRole,
    isLoaded: false,
    isSignedIn: false,
    isAdmin: false,
    signOut: async () => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("vettrack"));
      keys.forEach((k) => localStorage.removeItem(k));
      await clerkSignOut({ redirectUrl: "/landing" });
    },
  });

  useEffect(() => {
    if (!isLoaded) return;

    let cancelled = false;

    async function sync() {
      if (!isSignedIn || !user) {
        setAuthState({ userId: "", email: "", name: "", bearerToken: null });
        if (!cancelled) {
          setState((prev) => ({
            ...prev,
            userId: null,
            email: null,
            name: null,
            role: "technician",
            isLoaded: true,
            isSignedIn: false,
            isAdmin: false,
          }));
        }
        return;
      }

      const token = await getToken();
      const email = user.primaryEmailAddress?.emailAddress ?? "";
      const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();

      setAuthState({ userId: user.id, email, name, bearerToken: token });

      try {
        const headers: Record<string, string> = { "Content-Type": "application/json" };
        if (token) headers["Authorization"] = `Bearer ${token}`;
        const res = await fetch("/api/users/me", { headers });
        if (res.ok && !cancelled) {
          const data = await res.json();
          setState((prev) => ({
            ...prev,
            userId: user.id,
            email,
            name,
            role: data.role ?? "technician",
            isLoaded: true,
            isSignedIn: true,
            isAdmin: data.role === "admin",
          }));
          return;
        }
      } catch {
        // fall through
      }

      if (!cancelled) {
        setState((prev) => ({
          ...prev,
          userId: user.id,
          email,
          name,
          role: "technician",
          isLoaded: true,
          isSignedIn: true,
          isAdmin: false,
        }));
      }
    }

    sync().catch(() => {
      if (!cancelled) setState((s) => ({ ...s, isLoaded: true }));
    });

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user, getToken, clerkSignOut]);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
