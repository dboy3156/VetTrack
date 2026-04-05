interface AuthState {
  userId: string;
  email: string;
  name: string;
  clerkHeaders: Record<string, string>;
}

let authState: AuthState = {
  userId: "",
  email: "",
  name: "",
  clerkHeaders: {},
};

export function setAuthState(state: AuthState) {
  authState = state;
}

export function getAuthHeaders(): Record<string, string> {
  return authState.clerkHeaders;
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
