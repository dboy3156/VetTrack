import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type { UserRole } from "@/types";
import { setAuthState } from "@/lib/auth-store";

interface AuthContextType {
  userId: string | null;
  email: string | null;
  name: string | null;
  role: UserRole;
  isLoaded: boolean;
  isSignedIn: boolean;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType>({
  userId: null,
  email: null,
  name: null,
  role: "technician",
  isLoaded: false,
  isSignedIn: false,
  isAdmin: false,
});

const DEV_USER = {
  userId: "dev-admin-001",
  email: "admin@vettrack.dev",
  name: "Dev Admin",
  role: "admin" as UserRole,
};

interface DevAuthProviderProps {
  children: ReactNode;
}

export function DevAuthProvider({ children }: DevAuthProviderProps) {
  const [state, setState] = useState<AuthContextType>({
    ...DEV_USER,
    isLoaded: false,
    isSignedIn: true,
    isAdmin: true,
  });

  useEffect(() => {
    setAuthState({
      userId: DEV_USER.userId,
      email: DEV_USER.email,
      name: DEV_USER.name,
      clerkHeaders: {},
    });
    const timer = setTimeout(() => {
      setState((s) => ({ ...s, isLoaded: true }));
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
