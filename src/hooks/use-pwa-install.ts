import { useEffect, useRef, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export type PwaDisplayMode = "standalone" | "browser" | "fullscreen" | "minimal-ui";

export interface PwaInstallState {
  /** True when running as an installed PWA (standalone/fullscreen) */
  isStandalone: boolean;
  /** True on iOS Safari where beforeinstallprompt is not supported */
  isIos: boolean;
  /** True if the browser supports the install prompt (Chrome/Edge/Android) */
  canInstall: boolean;
  /** Trigger the native install prompt. Returns the user's choice. */
  promptInstall: () => Promise<"accepted" | "dismissed" | "unavailable">;
  /** True once the user has dismissed the iOS guidance banner */
  iosGuidanceDismissed: boolean;
  dismissIosGuidance: () => void;
}

function getDisplayMode(): PwaDisplayMode {
  if (typeof window === "undefined") return "browser";
  for (const mode of ["fullscreen", "standalone", "minimal-ui"] as const) {
    if (window.matchMedia(`(display-mode: ${mode})`).matches) return mode;
  }
  // iOS Safari standalone detection
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return "standalone";
  }
  return "browser";
}

function isIosSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && /safari/i.test(ua) && !/chrome|crios|fxios/i.test(ua);
}

const IOS_DISMISSED_KEY = "vt_pwa_ios_guidance_dismissed";

export function usePwaInstall(): PwaInstallState {
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isStandalone] = useState(() => {
    const mode = getDisplayMode();
    return mode === "standalone" || mode === "fullscreen";
  });
  const [isIos] = useState(isIosSafari);
  const [iosGuidanceDismissed, setIosGuidanceDismissed] = useState(() => {
    try {
      return localStorage.getItem(IOS_DISMISSED_KEY) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      promptRef.current = e as BeforeInstallPromptEvent;
      setCanInstall(true);
    };
    window.addEventListener("beforeinstallprompt", handler);

    // If the app was installed via our prompt, clear the install state.
    const onInstalled = () => setCanInstall(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handler);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    if (!promptRef.current) return "unavailable";
    await promptRef.current.prompt();
    const { outcome } = await promptRef.current.userChoice;
    promptRef.current = null;
    setCanInstall(false);
    return outcome;
  }

  function dismissIosGuidance() {
    setIosGuidanceDismissed(true);
    try {
      localStorage.setItem(IOS_DISMISSED_KEY, "1");
    } catch {
      // storage unavailable — state still held in memory for this session
    }
  }

  return {
    isStandalone,
    isIos,
    canInstall,
    promptInstall,
    iosGuidanceDismissed,
    dismissIosGuidance,
  };
}
