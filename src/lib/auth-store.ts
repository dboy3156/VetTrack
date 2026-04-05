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

export function setAuthState(state: AuthState) {
  authState = state;
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
