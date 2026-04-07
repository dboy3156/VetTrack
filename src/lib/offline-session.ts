export interface OfflineSessionSnapshot {
  userId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  token: string;
  tokenExp: number;
  lastActiveAt: number;
}

const SESSION_KEY = "vt_session";
const SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000;

function extractTokenExp(token: string): number {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return 0;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (typeof payload.exp === "number") return payload.exp * 1000;
    return 0;
  } catch {
    return 0;
  }
}

export function saveOfflineSession(data: {
  userId: string;
  email: string;
  name: string;
  role: string;
  status: string;
  token: string;
  tokenExp?: number;
}): void {
  try {
    const tokenExp = data.tokenExp ?? extractTokenExp(data.token);
    const snapshot: OfflineSessionSnapshot = {
      userId: data.userId,
      email: data.email,
      name: data.name,
      role: data.role,
      status: data.status,
      token: data.token,
      tokenExp,
      lastActiveAt: Date.now(),
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(snapshot));
  } catch {
  }
}

export function restoreOfflineSession(): OfflineSessionSnapshot | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;

    const snapshot: OfflineSessionSnapshot = JSON.parse(raw);

    if (!snapshot.token || snapshot.token.trim() === "") return null;
    if (Date.now() >= snapshot.tokenExp) return null;
    if (Date.now() - snapshot.lastActiveAt >= SESSION_MAX_AGE_MS) return null;
    if (snapshot.status !== "active") return null;

    return snapshot;
  } catch {
    return null;
  }
}

export function clearOfflineSession(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
  }
}
