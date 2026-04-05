import { useEffect, useState } from "react";

export function SyncIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50">
      <div className="bg-yellow-500 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-white" />
        מצב אופליין — השינויים יסונכרנו כשהחיבור יחזור
      </div>
    </div>
  );
}
