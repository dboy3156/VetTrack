import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAuth } from "@/hooks/use-auth";

/** Blocks authenticated users from guest-only routes (sign-in, sign-up).
 *  Returns null while auth resolves to prevent flicker, then redirects
 *  signed-in users to /home or renders children for unauthenticated visitors. */
export function GuestGuard({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, isOfflineSession } = useAuth();
  const authKnown = isLoaded || isOfflineSession;
  if (!authKnown) return null;
  if (isSignedIn) return <Redirect to="/home" replace />;
  return <>{children}</>;
}
