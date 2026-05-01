import type { ReactNode } from "react";

/** Wraps staff routes; ER mode enforcement can narrow `/er/*` later — pass-through keeps SSR/simple routing stable. */
export function ErModeGuard({ children }: { children: ReactNode }) {
  return children;
}
