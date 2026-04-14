interface AuthState {
  userId: string;
  email: string;
  name: string;
  bearerToken: string | null;
}

let authState: AuthState = {
  userId: "",
  email: "",
  name: "",
  bearerToken: null,
};

// A function that returns a fresh Clerk JWT, registered by the auth provider.
// When set, sync attempts call this instead of using the cached bearerToken.
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setTokenGetter(getter: (() => Promise<string | null>) | null) {
  tokenGetter = getter;
}

export function setAuthState(state: AuthState) {
  authState = state;
}

/**
 * Returns a fresh Bearer token if a tokenGetter is wired up, otherwise falls
 * back to the last cached token stored in authState.
 */
export async function getFreshToken(): Promise<string | null> {
  if (tokenGetter) {
    try {
      return await tokenGetter();
    } catch {
      // Fall through to cached token if Clerk throws (e.g. during sign-out).
    }
  }
  return authState.bearerToken;
}

export function getAuthHeaders(): Record<string, string> {
  if (authState.bearerToken) {
    return { Authorization: `Bearer ${authState.bearerToken}` };
  }
  return {};
}

export function getCurrentUserId(): string {
  return authState.userId;
}

export function getCurrentUserEmail(): string {
  return authState.email;
}

export function getCurrentUserName(): string {
  return authState.name;
}
