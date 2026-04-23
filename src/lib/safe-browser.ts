type SafeStorageKind = "local" | "session";

interface VibrateOptions {
  requireUserActivation?: boolean;
  silent?: boolean;
}

interface ClipboardOptions {
  silent?: boolean;
}

interface ReloadOptions {
  minIntervalMs?: number;
  silent?: boolean;
}

const RELOAD_GUARD_KEY = "vt_last_reload_ts";

function getNavigatorSafe(): Navigator | null {
  if (typeof window === "undefined") return null;
  return window.navigator ?? null;
}

function getStorage(kind: SafeStorageKind): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function isOnline(): boolean {
  return getNavigatorSafe()?.onLine ?? true;
}

export function isServiceWorkerSupported(): boolean {
  const nav = getNavigatorSafe();
  return !!nav && "serviceWorker" in nav;
}

export async function getServiceWorkerRegistrationSafe(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  try {
    return await navigator.serviceWorker.getRegistration();
  } catch {
    return null;
  }
}

export async function getServiceWorkerReadySafe(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  try {
    return await navigator.serviceWorker.ready;
  } catch {
    return null;
  }
}

export async function getServiceWorkerRegistrationsSafe(): Promise<ServiceWorkerRegistration[]> {
  if (!isServiceWorkerSupported()) return [];
  try {
    return await navigator.serviceWorker.getRegistrations();
  } catch {
    return [];
  }
}

export async function registerServiceWorkerSafe(
  scriptUrl: string,
  options?: RegistrationOptions,
): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) return null;
  try {
    return await navigator.serviceWorker.register(scriptUrl, options);
  } catch {
    return null;
  }
}

export function safeStorageGetItem(key: string, kind: SafeStorageKind = "local"): string | null {
  try {
    return getStorage(kind)?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeStorageSetItem(key: string, value: string, kind: SafeStorageKind = "local"): boolean {
  try {
    getStorage(kind)?.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function safeStorageRemoveItem(key: string, kind: SafeStorageKind = "local"): boolean {
  try {
    getStorage(kind)?.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function triggerVibration(
  pattern: VibratePattern,
  options: VibrateOptions = {},
): boolean {
  const nav = getNavigatorSafe();
  if (!nav) return false;
  if (!("vibrate" in nav) || typeof nav.vibrate !== "function") return false;

  const {
    requireUserActivation = true,
    silent = true,
  } = options;

  try {
    const userActivation = (nav as Navigator & { userActivation?: { isActive?: boolean } }).userActivation;
    if (requireUserActivation && userActivation?.isActive === false) {
      return false;
    }
    return nav.vibrate(pattern);
  } catch (error) {
    if (!silent) {
      console.warn("[safe-browser] Vibration API failed.", error);
    }
    return false;
  }
}

export async function safeClipboardWriteText(
  text: string,
  options: ClipboardOptions = {},
): Promise<boolean> {
  const nav = getNavigatorSafe();
  const { silent = true } = options;
  if (!nav?.clipboard || typeof nav.clipboard.writeText !== "function") return false;

  try {
    await nav.clipboard.writeText(text);
    return true;
  } catch (error) {
    if (!silent) {
      console.warn("[safe-browser] Clipboard write failed.", error);
    }
    return false;
  }
}

export function safeReloadPage(options: ReloadOptions = {}): boolean {
  if (typeof window === "undefined") return false;

  const {
    minIntervalMs = 5000,
    silent = true,
  } = options;

  try {
    const now = Date.now();
    const lastReload = Number(safeStorageGetItem(RELOAD_GUARD_KEY, "session") ?? "0");
    if (lastReload > 0 && now - lastReload < minIntervalMs) {
      return false;
    }
    safeStorageSetItem(RELOAD_GUARD_KEY, String(now), "session");
    window.location.reload();
    return true;
  } catch (error) {
    if (!silent) {
      console.warn("[safe-browser] Page reload failed.", error);
    }
    return false;
  }
}

export function safePrintPage(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.print();
    return true;
  } catch {
    return false;
  }
}
