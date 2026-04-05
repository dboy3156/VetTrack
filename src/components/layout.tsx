import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { computeAlerts } from "@/lib/utils";
import {
  Home,
  Package,
  BarChart3,
  AlertTriangle,
  QrCode,
  Shield,
  Menu,
  X,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  badgeCount?: number;
}

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function Layout({ children, title }: LayoutProps) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const { isAdmin } = useAuth();

  const { data: equipment } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
    staleTime: 60_000,
  });

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  const alertCount = equipment ? computeAlerts(equipment).length : 0;

  const navItems: NavItem[] = [
    { href: "/", label: "Home", icon: <Home className="w-5 h-5" /> },
    { href: "/equipment", label: "Equipment", icon: <Package className="w-5 h-5" /> },
    {
      href: "/alerts",
      label: "Alerts",
      icon: <AlertTriangle className="w-5 h-5" />,
      badgeCount: alertCount,
    },
    { href: "/analytics", label: "Analytics", icon: <BarChart3 className="w-5 h-5" /> },
    { href: "/print", label: "QR Print", icon: <QrCode className="w-5 h-5" /> },
    { href: "/admin", label: "Admin", icon: <Shield className="w-5 h-5" />, adminOnly: true },
  ];

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
        <div className="flex h-16 items-center justify-between px-4 max-w-2xl mx-auto">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">VetTrack</span>
          </Link>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1">
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </div>
            )}
            {alertCount > 0 && (
              <Link href="/alerts">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="relative text-red-600 hover:text-red-700 hover:bg-red-50"
                  data-testid="alert-bell"
                >
                  <AlertTriangle className="w-5 h-5" />
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                </Button>
              </Link>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setMenuOpen(!menuOpen)}
              data-testid="menu-toggle"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Slide-down nav menu */}
        {menuOpen && (
          <div className="border-t bg-white px-4 py-3 max-w-2xl mx-auto">
            <nav className="flex flex-col gap-1">
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMenuOpen(false)}
                  data-testid={`nav-${item.href.replace("/", "") || "home"}`}
                >
                  <div
                    className={cn(
                      "flex items-center justify-between gap-3 px-3 py-3 rounded-xl transition-colors",
                      location === item.href
                        ? "bg-primary/10 text-primary font-semibold"
                        : "text-foreground hover:bg-muted"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      {item.icon}
                      <span className="text-sm font-medium">{item.label}</span>
                    </div>
                    {item.badgeCount ? (
                      <Badge variant="destructive" className="text-[10px] h-5 min-w-5 px-1.5">
                        {item.badgeCount}
                      </Badge>
                    ) : null}
                  </div>
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      {/* Main content */}
      <main className="max-w-2xl mx-auto px-4 py-6 pb-safe">{children}</main>

      {/* Bottom nav (mobile) */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t supports-[backdrop-filter]:bg-white/60 pb-safe">
        <div className="flex max-w-2xl mx-auto">
          {visibleItems.slice(0, 5).map((item) => (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-0.5 py-2.5 transition-colors relative",
                  location === item.href ? "text-primary" : "text-muted-foreground"
                )}
                data-testid={`bottom-nav-${item.href.replace("/", "") || "home"}`}
              >
                {item.icon}
                <span className="text-[10px] font-medium">{item.label}</span>
                {item.badgeCount ? (
                  <span className="absolute top-1.5 right-1/4 w-4 h-4 bg-red-500 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                    {item.badgeCount > 9 ? "9+" : item.badgeCount}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
