import { useUndo } from "@/hooks/useUndo";
import React from "react";
import { Link } from "wouter";
import { SidebarProvider, Sidebar } from "@/components/ui/sidebar";
import { WifiOff } from "lucide-react";

type LayoutProps = {
  children: React.ReactNode;
};

export function Layout({ children }: LayoutProps) {
  const { undo, undoState } = useUndo(); // שחזור — undoState בשימוש למטה

  // online status — Layout אחראי לבאנר; SyncIndicator ב-App.tsx מוסר
  const [isOnline, setIsOnline] = React.useState(() => navigator.onLine);

  React.useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  return (
    <>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <header className="h-14 border-b bg-background flex items-center justify-between px-4">
              <Link href="/">
                <span className="font-semibold text-lg cursor-pointer">VetTrack</span>
              </Link>
            </header>

            {!isOnline && (
              <div className="bg-red-500 text-white text-sm px-4 py-2 flex items-center gap-2">
                <WifiOff className="w-4 h-4" />
                You are offline — changes will sync when connection returns
              </div>
            )}

            <main className="flex-1 p-4 md:p-6 bg-muted/30">
              {children}
            </main>
          </div>
        </div>
      </SidebarProvider>

      {undoState && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-black text-white px-4 py-2 rounded-lg flex items-center gap-3 shadow-lg">
          <span className="text-sm">{undoState.label ?? "Action done"}</span>
          <button onClick={undo} className="underline text-sm font-medium">
            Undo
          </button>
        </div>
      )}
    </>
  );
}
