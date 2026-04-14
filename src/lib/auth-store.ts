interface AuthState {
  userId: string;
  email: string;
  name: string;
  bearerToken: string | null;
}

const EMPTY_AUTH_STATE: AuthState = {
  userId: "",
  email: "",
  name: "",
  bearerToken: null,
};

let authState: AuthState = { ...EMPTY_AUTH_STATE };

export function setAuthState(state: AuthState) {
  authState = {
    userId: state.userId || "",
    email: state.email || "",
    name: state.name || "",
    bearerToken: state.bearerToken?.trim() || null,
  };
}

export function clearAuthState() {
  authState = { ...EMPTY_AUTH_STATE };
}

export function hasAuthToken(): boolean {
  return authState.bearerToken !== null;
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
