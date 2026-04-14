import { useState, useEffect, useCallback } from "react";
import { getAuthHeaders } from "@/lib/auth-store";

interface PushState {
  supported: boolean;
  permission: NotificationPermission | "unsupported";
  subscribed: boolean;
  loading: boolean;
  error: string | null;
}

function buildHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    ...getAuthHeaders(),
  };
}

async function getVapidPublicKey(): Promise<string> {
  const envVapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (envVapidKey && envVapidKey.trim()) {
    return envVapidKey.trim();
  }
  const res = await fetch("/api/push/vapid-public-key", { headers: buildHeaders() });
  if (!res.ok) throw new Error("Failed to fetch VAPID key");
  const { publicKey } = await res.json();
  return publicKey;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    output[i] = rawData.charCodeAt(i);
  }
  return output as Uint8Array<ArrayBuffer>;
}

export function usePushNotifications() {
  const [state, setState] = useState<PushState>({
    supported: false,
    permission: "default",
    subscribed: false,
    loading: false,
    error: null,
  });

  useEffect(() => {
    const supported =
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      setState((s) => ({ ...s, supported: false, permission: "unsupported" }));
      return;
    }

    setState((s) => ({
      ...s,
      supported: true,
      permission: Notification.permission,
    }));

    navigator.serviceWorker.ready.then((registration) => {
      registration.pushManager.getSubscription().then((sub) => {
        const storedEndpoint = localStorage.getItem("push_subscription_endpoint");

        if (storedEndpoint && (!sub || sub.endpoint !== storedEndpoint)) {
          localStorage.removeItem("push_subscription_endpoint");
          setState((s) => ({ ...s, subscribed: false }));
        } else {
          setState((s) => ({ ...s, subscribed: !!sub }));
        }
      });
    });
  }, []);

  const subscribe = useCallback(async (
    opts?: {
      soundEnabled?: boolean;
      alertsEnabled?: boolean;
      technicianReturnRemindersEnabled?: boolean;
      seniorOwnReturnRemindersEnabled?: boolean;
      seniorTeamOverdueAlertsEnabled?: boolean;
      adminHourlySummaryEnabled?: boolean;
    }
  ): Promise<boolean> => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
        throw new Error("Push not supported");
      }

      const permission = await Notification.requestPermission();
      setState((s) => ({ ...s, permission }));

      if (permission !== "granted") {
        setState((s) => ({ ...s, loading: false, error: "Permission denied" }));
        return false;
      }

      const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY || await getVapidPublicKey();
      const registration = await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      });

      const subJson = subscription.toJSON();
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: buildHeaders(),
        body: JSON.stringify({
          endpoint: subJson.endpoint,
          keys: {
            p256dh: subJson.keys?.p256dh,
            auth: subJson.keys?.auth,
          },
          soundEnabled: opts?.soundEnabled !== false,
          alertsEnabled: opts?.alertsEnabled !== false,
          technicianReturnRemindersEnabled: opts?.technicianReturnRemindersEnabled !== false,
          seniorOwnReturnRemindersEnabled: opts?.seniorOwnReturnRemindersEnabled !== false,
          seniorTeamOverdueAlertsEnabled: opts?.seniorTeamOverdueAlertsEnabled !== false,
          adminHourlySummaryEnabled: opts?.adminHourlySummaryEnabled !== false,
        }),
      });

      if (!res.ok) throw new Error("Failed to save subscription");

      localStorage.setItem("push_subscription_endpoint", subJson.endpoint || "");
      setState((s) => ({ ...s, subscribed: true, loading: false }));
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to subscribe";
      setState((s) => ({ ...s, loading: false, error: msg, subscribed: false }));
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, loading: true, error: null }));

    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: buildHeaders(),
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }

      localStorage.removeItem("push_subscription_endpoint");
      setState((s) => ({ ...s, subscribed: false, loading: false }));
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to unsubscribe";
      setState((s) => ({ ...s, loading: false, error: msg }));
      return false;
    }
  }, []);

  const updateSettings = useCallback(async (
    opts: {
      soundEnabled?: boolean;
      alertsEnabled?: boolean;
      technicianReturnRemindersEnabled?: boolean;
      seniorOwnReturnRemindersEnabled?: boolean;
      seniorTeamOverdueAlertsEnabled?: boolean;
      adminHourlySummaryEnabled?: boolean;
    }
  ): Promise<boolean> => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return false;

      const res = await fetch("/api/push/subscribe", {
        method: "PATCH",
        headers: buildHeaders(),
        body: JSON.stringify({ endpoint: subscription.endpoint, ...opts }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }, []);

  const sendTestNotification = useCallback(async (): Promise<boolean> => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch("/api/push/test", {
        method: "POST",
        headers: buildHeaders(),
      });
      if (!res.ok) throw new Error("Failed to send test notification");
      setState((s) => ({ ...s, loading: false }));
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send test";
      setState((s) => ({ ...s, loading: false, error: msg }));
      return false;
    }
  }, []);

  return {
    ...state,
    subscribe,
    unsubscribe,
    updateSettings,
    sendTestNotification,
  };
}
