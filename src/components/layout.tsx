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
  WifiOff,
  PackageOpen,
  Clock,
  XCircle,
  RefreshCw,
  CheckCircle,
  Scan,
  LayoutDashboard,
  Globe,
  Settings,
  Moon,
  Sun,
  Volume2,
  VolumeX,
  BellRing,
  AlignJustify,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useSync } from "@/hooks/use-sync";
import { QrScanner } from "@/components/qr-scanner";
import { useSettings } from "@/hooks/use-settings";
import { SettingsToggle, SettingsSelect } from "@/components/settings-controls";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  adminOnly?: boolean;
  menuOnly?: boolean;
  badgeCount?: number;
}

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  onScan?: () => void;
}

export function Layout({ children, title, onScan }: LayoutProps) {
  const [location] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [scannerOpen, setScannerOpen] = useState(false);
  const { isAdmin } = useAuth();
  const { pendingCount, failedCount, isSyncing, justSynced, triggerSync } = useSync();
  const { settings, update } = useSettings();
  const quickSettingsRef = useRef<HTMLDivElement>(null);

  const openScanner = () => {
    if (onScan) {
      onScan();
    } else {
      setScannerOpen(true);
    }
  };

  const { data: equipment } = useQuery({
    queryKey: ["/api/equipment"],
    queryFn: api.equipment.list,
    staleTime: 60_000,
  });

  const { data: myEquipment } = useQuery({
    queryKey: ["/api/equipment/my"],
    queryFn: api.equipment.listMy,
    staleTime: 30_000,
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

  useEffect(() => {
    if (!quickSettingsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (quickSettingsRef.current && !quickSettingsRef.current.contains(e.target as Node)) {
        setQuickSettingsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [quickSettingsOpen]);

  const alertCount = equipment ? computeAlerts(equipment).length : 0;
  const myCount = myEquipment?.length ?? 0;

  const navItems: NavItem[] = [
    { href: "/", label: "Home", icon: <Home className="w-5 h-5" /> },
    { href: "/equipment", label: "Equipment", icon: <Package className="w-5 h-5" /> },
    {
      href: "/alerts",
      label: "Alerts",
      icon: <AlertTriangle className="w-5 h-5" />,
      badgeCount: alertCount,
    },
    {
      href: "/my-equipment",
      label: "Mine",
      icon: <PackageOpen className="w-5 h-5" />,
      badgeCount: myCount,
    },
    { href: "/analytics", label: "Analytics", icon: <BarChart3 className="w-5 h-5" /> },
    { href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard className="w-5 h-5" />, menuOnly: true },
    { href: "/print", label: "QR Print", icon: <QrCode className="w-5 h-5" />, menuOnly: true },
    { href: "/settings", label: "Settings", icon: <Settings className="w-5 h-5" />, menuOnly: true },
    { href: "/landing", label: "About VetTrack", icon: <Globe className="w-5 h-5" />, menuOnly: true },
    { href: "/admin", label: "Admin", icon: <Shield className="w-5 h-5" />, adminOnly: true, menuOnly: true },
  ];

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const bottomItems = visibleItems.filter((item) => !item.menuOnly);

  const hasPending = pendingCount > 0;
  const hasFailed = failedCount > 0;

  return (
    <div className="min-h-screen bg-background">
      {/* Top header */}
      <header className="sticky top-0 z-40 border-b bg-white/95 dark:bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-background/60">
        <div className="flex h-16 items-center justify-between px-4 max-w-2xl mx-auto">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <QrCode className="w-4 h-4 text-white" />
            </div>
            <span className="text-xl font-bold text-foreground">VetTrack</span>
          </Link>

          <div className="flex items-center gap-2">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-full px-2.5 py-1">
                <WifiOff className="w-3 h-3" />
                <span>Offline</span>
              </div>
            )}

            {/* Sync status indicator */}
            {isOnline && isSyncing && (
              <div className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-full px-2.5 py-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>Syncing</span>
              </div>
            )}

            {isOnline && justSynced && !isSyncing && pendingCount === 0 && (
              <div
                className="flex items-center gap-1 text-xs text-green-600 bg-green-50 dark:bg-green-950/50 border border-green-200 dark:border-green-800 rounded-full px-2.5 py-1"
                data-testid="sync-synced-indicator"
              >
                <CheckCircle className="w-3 h-3" />
                <span>Synced</span>
              </div>
            )}

            {isOnline && hasPending && !isSyncing && (
              <button
                onClick={triggerSync}
                className="flex items-center gap-1 text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 rounded-full px-2.5 py-1 hover:bg-blue-100 dark:hover:bg-blue-950 transition-colors"
                title={`${pendingCount} pending action${pendingCount !== 1 ? "s" : ""} — tap to sync`}
                data-testid="sync-pending-indicator"
              >
                <Clock className="w-3 h-3" />
                <span>{pendingCount} pending</span>
              </button>
            )}

            {hasFailed && (
              <div
                className="flex items-center gap-1 text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-full px-2.5 py-1"
                title={`${failedCount} action${failedCount !== 1 ? "s" : ""} failed to sync`}
                data-testid="sync-failed-indicator"
              >
                <XCircle className="w-3 h-3" />
                <span>{failedCount} failed</span>
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
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                </Button>
              </Link>
            )}

            {/* Quick Settings button */}
            <div className="relative" ref={quickSettingsRef}>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setQuickSettingsOpen((o) => !o);
                  setMenuOpen(false);
                }}
                aria-label="Quick Settings"
                data-testid="quick-settings-toggle"
              >
                <Settings className="w-5 h-5" />
              </Button>

              {/* Quick Settings dropdown panel */}
              {quickSettingsOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-72 bg-background border border-border rounded-2xl shadow-xl z-50 p-3 space-y-2"
                  data-testid="quick-settings-panel"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-1">
                    Quick Settings
                  </p>
                  <SettingsToggle
                    icon={settings.darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    label="Dark Mode"
                    checked={settings.darkMode}
                    onCheckedChange={(v) => update({ darkMode: v })}
                    data-testid="quick-dark-mode"
                  />
                  <SettingsSelect
                    icon={<AlignJustify className="w-5 h-5" />}
                    label="Density"
                    value={settings.density}
                    options={[
                      { value: "comfortable", label: "Comfortable" },
                      { value: "compact", label: "Compact" },
                    ]}
                    onValueChange={(v) => update({ density: v as "comfortable" | "compact" })}
                    data-testid="quick-density"
                  />
                  <SettingsToggle
                    icon={settings.soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    label="Master Sound"
                    checked={settings.soundEnabled}
                    onCheckedChange={(v) => update({ soundEnabled: v })}
                    data-testid="quick-sound"
                  />
                  <SettingsToggle
                    icon={<BellRing className="w-5 h-5" />}
                    label="Critical Alerts Sound"
                    checked={settings.criticalAlertsSound}
                    onCheckedChange={(v) => update({ criticalAlertsSound: v })}
                    data-testid="quick-critical-sound"
                  />
                  <SettingsSelect
                    icon={<Globe className="w-5 h-5" />}
                    label="Language"
                    value={settings.language}
                    options={[
                      { value: "en", label: "English" },
                      { value: "es", label: "Español" },
                      { value: "fr", label: "Français" },
                      { value: "de", label: "Deutsch" },
                    ]}
                    onValueChange={(v) => update({ language: v as "en" | "es" | "fr" | "de" })}
                    data-testid="quick-language"
                  />
                  <div className="pt-1 border-t border-border">
                    <Link href="/settings" onClick={() => setQuickSettingsOpen(false)}>
                      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs">
                        <Settings className="w-3.5 h-3.5" />
                        All Settings
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => {
                setMenuOpen(!menuOpen);
                setQuickSettingsOpen(false);
              }}
              data-testid="menu-toggle"
            >
              {menuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </Button>
          </div>
        </div>

        {/* Slide-down nav menu */}
        {menuOpen && (
          <div className="border-t bg-white dark:bg-background px-4 py-3 max-w-2xl mx-auto">
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
                      <Badge variant="issue" className="h-5 min-w-5 px-1.5">
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
      <main
        className={cn(
          "max-w-2xl mx-auto px-4 py-6 pb-safe",
          settings.density === "compact" ? "py-3" : "py-6"
        )}
      >
        {children}
      </main>

      {/* Bottom nav (mobile) — 4 primary items + Scan in center */}
      <nav className="fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-background/95 backdrop-blur border-t dark:border-border supports-[backdrop-filter]:bg-white/60 dark:supports-[backdrop-filter]:bg-background/60 pb-safe">
        <div className="flex max-w-2xl mx-auto items-center">
          {/* First 2 nav items */}
          {bottomItems.slice(0, 2).map((item) => (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors relative",
                  location === item.href ? "text-primary" : "text-muted-foreground"
                )}
                data-testid={`bottom-nav-${item.href.replace("/", "") || "home"}`}
              >
                {item.icon}
                <span className="text-xs font-medium">{item.label}</span>
                {item.badgeCount ? (
                  <span className="absolute top-2 right-1/4 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                    {item.badgeCount > 9 ? "9+" : item.badgeCount}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}

          {/* Center Scan button */}
          <div className="flex-1 flex items-center justify-center py-2">
            <button
              onClick={openScanner}
              className="w-12 h-12 rounded-full bg-primary text-white flex flex-col items-center justify-center shadow-sm hover:bg-primary/90 transition-colors -mt-3"
              data-testid="bottom-nav-scan"
            >
              <Scan className="w-5 h-5" />
            </button>
          </div>

          {/* Last 2 nav items */}
          {bottomItems.slice(2, 4).map((item) => (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 min-h-[56px] transition-colors relative",
                  location === item.href ? "text-primary" : "text-muted-foreground"
                )}
                data-testid={`bottom-nav-${item.href.replace("/", "") || "home"}`}
              >
                {item.icon}
                <span className="text-xs font-medium">{item.label}</span>
                {item.badgeCount ? (
                  <span className="absolute top-2 right-1/4 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                    {item.badgeCount > 9 ? "9+" : item.badgeCount}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </nav>

      {/* Scanner opened from bottom nav (non-home pages) */}
      {scannerOpen && (
        <QrScanner onClose={() => setScannerOpen(false)} />
      )}
    </div>
  );
}
