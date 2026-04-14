import { t } from "@/lib/i18n";
import { Link, useLocation } from "wouter";
import { useQRScanner } from "@/hooks/use-qr-scanner";
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
  Bug,
  CloudOff,
  FlaskConical,
  Radar,
  HelpCircle,
} from "lucide-react";
import { OnboardingWalkthrough } from "@/components/onboarding-walkthrough";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import { useAuth } from "@/hooks/use-auth";
import { useSync } from "@/hooks/use-sync";
import { QrScanner } from "@/components/qr-scanner";
import { useSettings } from "@/hooks/use-settings";
import { toast } from "sonner";
import { SettingsToggle, SettingsSelect } from "@/components/settings-controls";
import { playFeedbackTone, playMuteTone } from "@/lib/sounds";
import { ReportIssueDialog } from "@/components/report-issue-dialog";
import { SyncQueueSheet } from "@/components/sync-queue-sheet";
import { UpdateBanner } from "@/components/update-banner";

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

const lh = t.layoutHebrew;

export function Layout({ children, title, onScan }: LayoutProps) {
  const QUICK_SETTINGS_PANEL_WIDTH = 288;
  const QUICK_SETTINGS_MARGIN = 8;

  const [location, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [quickSettingsOpen, setQuickSettingsOpen] = useState(false);
  const [quickSettingsUseViewportRight, setQuickSettingsUseViewportRight] = useState(false);
  const [quickSettingsViewportTop, setQuickSettingsViewportTop] = useState(0);
  const [syncQueueOpen, setSyncQueueOpen] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [reportIssueOpen, setReportIssueOpen] = useState(false);
  const { isAdmin } = useAuth();
  const { pendingCount, failedCount, isSyncing, justSynced, triggerSync } = useSync();
  const { settings, update } = useSettings();
  const quickSettingsRef = useRef<HTMLDivElement>(null);
  const quickSettingsToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!quickSettingsOpen) return;

    const updateQuickSettingsPlacement = () => {
      const toggle = quickSettingsToggleRef.current;
      if (!toggle) return;
      const rect = toggle.getBoundingClientRect();
      const wouldClipLeft = rect.right < QUICK_SETTINGS_PANEL_WIDTH + QUICK_SETTINGS_MARGIN;
      setQuickSettingsUseViewportRight(wouldClipLeft);
      setQuickSettingsViewportTop(rect.bottom + QUICK_SETTINGS_MARGIN);
    };

    updateQuickSettingsPlacement();
    window.addEventListener("resize", updateQuickSettingsPlacement);
    window.addEventListener("scroll", updateQuickSettingsPlacement, true);
    return () => {
      window.removeEventListener("resize", updateQuickSettingsPlacement);
      window.removeEventListener("scroll", updateQuickSettingsPlacement, true);
    };
  }, [quickSettingsOpen]);

  const openScanner = () => {
    if (onScan) {
      onScan();
    } else {
      setScannerOpen(true);
    }
  };

  // useQRScanner — handles hardware barcode scanners (keyboard-based).
  // Validates that the equipment exists before navigating so an unknown ID
  // never lands on the "Failed to load equipment" error screen.
  const { triggerScan } = useQRScanner(async (assetId) => {
    try {
      await api.equipment.get(assetId);
      navigate(`/equipment/${assetId}`);
    } catch {
      toast.error(t.layout.toast.equipmentNotFound);
    }
  }, 1500);

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
    { href: "/", label: lh.home, icon: <Home className="w-5 h-5" /> },
    { href: "/equipment", label: t.equipment.title, icon: <Package className="w-5 h-5" /> },
    {
      href: "/alerts",
      label: t.layout.nav.alerts,
      icon: <AlertTriangle className="w-5 h-5" />,
      badgeCount: alertCount,
    },
    {
      href: "/my-equipment",
      label: t.layout.nav.mine,
      icon: <PackageOpen className="w-5 h-5" />,
      badgeCount: myCount,
    },
    { href: "/rooms", label: lh.radar, icon: <Radar className="w-5 h-5" /> },
    { href: "/analytics", label: lh.analytics, icon: <BarChart3 className="w-5 h-5" /> },
    { href: "/dashboard", label: lh.dashboard, icon: <LayoutDashboard className="w-5 h-5" />, menuOnly: true },
    { href: "/print", label: lh.printQr, icon: <QrCode className="w-5 h-5" />, menuOnly: true },
    { href: "/admin", label: lh.admin, icon: <Shield className="w-5 h-5" />, adminOnly: true, menuOnly: true },
    { href: "/stability", label: lh.stability, icon: <FlaskConical className="w-5 h-5" />, adminOnly: true, menuOnly: true },
    { href: "/help", label: lh.quickGuide, icon: <HelpCircle className="w-5 h-5" />, menuOnly: true },
    { href: "/settings", label: lh.settings, icon: <Settings className="w-5 h-5" />, menuOnly: true },
    { href: "/landing", label: lh.about, icon: <Globe className="w-5 h-5" />, menuOnly: true },
  ];

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);
  const bottomItems = visibleItems.filter((item) => !item.menuOnly);

  const hasPending = pendingCount > 0;
  const hasFailed = failedCount > 0;

  const handleSoundToggle = async (v: boolean) => {
    if (v) {
      await playFeedbackTone();
    } else {
      await playMuteTone();
    }
    update({ soundEnabled: v });
  };

  const handleCriticalAlertsToggle = async (v: boolean) => {
    if (settings.soundEnabled) {
      if (v) {
        await playFeedbackTone();
      } else {
        await playMuteTone();
      }
    }
    update({ criticalAlertsSound: v });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Top header */}
      <header className="sticky top-safe z-40 border-b border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <UpdateBanner />
        <div className="flex h-14 items-center justify-between px-4 max-w-2xl mx-auto">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-2xl bg-primary/10 flex items-center justify-center">
              <QrCode className="w-4 h-4 text-primary" />
            </div>
            <span className="text-lg font-bold text-foreground tracking-tight">VetTrack</span>
          </Link>

          <div className="flex items-center gap-1.5">
            {!isOnline && (
              <div className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/50 border border-amber-200/80 dark:border-amber-800 rounded-full px-2.5 py-1">
                <WifiOff className="w-3 h-3" />
                <span>{lh.offline}</span>
              </div>
            )}

            {isOnline && isSyncing && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border rounded-full px-2.5 py-1">
                <RefreshCw className="w-3 h-3 animate-spin" />
                <span>{lh.syncing}</span>
              </div>
            )}

            {isOnline && justSynced && !isSyncing && pendingCount === 0 && (
              <div
                className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800 rounded-full px-2.5 py-1"
                data-testid="sync-synced-indicator"
              >
                <CheckCircle className="w-3 h-3" />
                <span>{lh.synced}</span>
              </div>
            )}

            {isOnline && hasPending && !isSyncing && (
              <button
                onClick={triggerSync}
                className="flex items-center gap-1 text-xs text-muted-foreground bg-muted border border-border rounded-full px-2.5 py-1 hover:bg-accent transition-colors"
                title={lh.pendingTitle(pendingCount)}
                data-testid="sync-pending-indicator"
              >
                <Clock className="w-3 h-3" />
                <span>{lh.pendingShort(pendingCount)}</span>
              </button>
            )}

            {hasFailed && (
              <div
                className="flex items-center gap-1 text-xs text-red-600 bg-red-50 dark:bg-red-950/50 border border-red-200/80 dark:border-red-800 rounded-full px-2.5 py-1"
                title={lh.failedTitle(failedCount)}
                data-testid="sync-failed-indicator"
              >
                <XCircle className="w-3 h-3" />
                <span>{lh.failedShort(failedCount)}</span>
              </div>
            )}

            {(hasPending || hasFailed) && (
              <Button
                variant="ghost"
                size="icon-sm"
                className="relative text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={() => setSyncQueueOpen(true)}
                title={t.layout.sync.viewQueue}
                aria-label={t.layout.sync.viewQueue}
                data-testid="sync-queue-badge"
              >
                <CloudOff className="w-4 h-4" aria-hidden="true" />
                <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-400 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                  {(pendingCount + failedCount) > 9 ? "9+" : pendingCount + failedCount}
                </span>
              </Button>
            )}

            {(hasPending || hasFailed) && (
              <HelpTooltip
                side="bottom"
                content={
                  hasFailed
                    ? t.layout.sync.failedMessage
                    : lh.pendingTooltip(pendingCount)
                }
              />
            )}

            {alertCount > 0 && (
              <Link href="/alerts">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="relative text-muted-foreground hover:text-foreground hover:bg-muted"
                  aria-label={lh.alertAria(alertCount)}
                  data-testid="alert-bell"
                >
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-red-400 text-white text-[9px] rounded-full flex items-center justify-center font-bold" aria-hidden="true">
                    {alertCount > 9 ? "9+" : alertCount}
                  </span>
                </Button>
              </Link>
            )}

            {/* Quick settings button */}
            <div className="relative" ref={quickSettingsRef}>
              <Button
                ref={quickSettingsToggleRef}
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setQuickSettingsOpen((o) => !o);
                  setMenuOpen(false);
                }}
                aria-label={t.common.quickSettings}
                data-testid="quick-settings-toggle"
                className="text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <Settings className="w-4 h-4" />
              </Button>

              {/* Quick Settings dropdown panel */}
              {quickSettingsOpen && (
                <div
                  className={cn(
                    "w-72 bg-card border border-border rounded-2xl shadow-lg z-50 p-3 space-y-2",
                    quickSettingsUseViewportRight ? "fixed right-2" : "absolute right-0 top-full mt-2"
                  )}
                  style={quickSettingsUseViewportRight ? { top: quickSettingsViewportTop } : undefined}
                  data-testid="quick-settings-panel"
                >
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1 pb-1">
                    {lh.quickSettings}
                  </p>
                  <SettingsToggle
                    icon={settings.darkMode ? <Moon className="w-5 h-5" /> : <Sun className="w-5 h-5" />}
                    label={t.layout.settings.darkMode}
                    checked={settings.darkMode}
                    onCheckedChange={(v) => update({ darkMode: v })}
                    data-testid="quick-dark-mode"
                  />
                  <SettingsSelect
                    icon={<AlignJustify className="w-5 h-5" />}
                    label={t.layout.settings.displaySize}
                    value={settings.density}
                    options={[
                      { value: "comfortable", label: t.layout.settings.comfortable },
                      { value: "compact", label: t.layout.settings.compact },
                    ]}
                    onValueChange={(v) => update({ density: v as "comfortable" | "compact" })}
                    data-testid="quick-density"
                  />
                  <SettingsToggle
                    icon={settings.soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                    label={t.layout.settings.masterSound}
                    checked={settings.soundEnabled}
                    onCheckedChange={handleSoundToggle}
                    data-testid="quick-sound"
                  />
                  <SettingsToggle
                    icon={<BellRing className="w-5 h-5" />}
                    label={t.layout.settings.criticalAlerts}
                    checked={settings.criticalAlertsSound}
                    onCheckedChange={handleCriticalAlertsToggle}
                    data-testid="quick-critical-sound"
                  />
                  <div className="pt-1 border-t border-border">
                    <Link href="/settings" onClick={() => setQuickSettingsOpen(false)}>
                      <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-xs text-muted-foreground">
                        <Settings className="w-3.5 h-3.5" />
                        {lh.allSettings}
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
              aria-label={menuOpen ? t.common.closeNavigationMenu : t.common.openNavigationMenu}
              aria-expanded={menuOpen}
              className="text-muted-foreground hover:text-foreground hover:bg-muted"
            >
              {menuOpen ? <X className="w-4 h-4" aria-hidden="true" /> : <Menu className="w-4 h-4" aria-hidden="true" />}
            </Button>
          </div>
        </div>

        {/* Slide-down nav menu */}
        {menuOpen && (
          <div className="border-t border-border/60 bg-background px-4 py-3 max-w-2xl mx-auto max-h-[75vh] overflow-y-auto">
            <nav className="flex flex-col gap-1">
              {/* Operations group */}
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-1 pb-0.5">Operations</p>
              {["/", "/equipment", "/alerts", "/my-equipment", "/rooms"].map((href) => {
                const item = visibleItems.find((i) => i.href === href);
                if (!item) return null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    data-testid={`nav-${item.href.replace("/", "") || "home"}`}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-colors min-h-[44px]",
                        location === item.href
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn("opacity-60", location === item.href && "opacity-100")}>{item.icon}</span>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                      {item.badgeCount ? (
                        <Badge variant="issue" className="h-5 min-w-5 px-1.5">
                          {item.badgeCount}
                        </Badge>
                      ) : null}
                    </div>
                  </Link>
                );
              })}

              {/* Management group */}
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-0.5">Management</p>
              {["/analytics", "/dashboard", "/admin", "/stability", "/print"].map((href) => {
                const item = visibleItems.find((i) => i.href === href);
                if (!item) return null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    data-testid={`nav-${item.href.replace("/", "") || "home"}`}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-colors min-h-[44px]",
                        location === item.href
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn("opacity-60", location === item.href && "opacity-100")}>{item.icon}</span>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {/* System group */}
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-0.5">System</p>
              {["/help", "/settings", "/landing"].map((href) => {
                const item = visibleItems.find((i) => i.href === href);
                if (!item) return null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    data-testid={`nav-${item.href.replace("/", "") || "home"}`}
                  >
                    <div
                      className={cn(
                        "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl transition-colors min-h-[44px]",
                        location === item.href
                          ? "bg-primary/10 text-primary font-semibold"
                          : "text-foreground hover:bg-muted"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn("opacity-60", location === item.href && "opacity-100")}>{item.icon}</span>
                        <span className="text-sm font-medium">{item.label}</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setReportIssueOpen(true);
                }}
                data-testid="nav-report-issue"
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-foreground hover:bg-muted w-full text-left min-h-[44px]"
              >
                <Bug className="w-5 h-5 opacity-60" />
                <span className="text-sm font-medium">{lh.reportIssue}</span>
              </button>
            </nav>
          </div>
        )}
      </header>

      {/* Main content */}
      <main
        className={cn(
          "max-w-2xl mx-auto px-4 pb-nav-safe",
          settings.density === "compact" ? "py-3" : "py-5"
        )}
      >
        {children}
      </main>

      {/* Bottom nav (mobile) — 4 primary items + Scan in center */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t"
        style={{
          height: "calc(72px + env(safe-area-inset-bottom))",
          paddingBottom: "env(safe-area-inset-bottom)",
          background: "#ffffff",
          borderTopColor: "#F1F5F9",
          willChange: "transform",
          WebkitTransform: "translateZ(0)",
          transform: "translateZ(0)",
        }}
      >
        <div className="flex max-w-2xl mx-auto items-center">
          {/* First 2 nav items */}
          {bottomItems.slice(0, 2).map((item) => (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 min-h-[48px] min-w-[48px] transition-colors relative",
                  location === item.href ? "text-primary" : "text-muted-foreground"
                )}
                data-testid={`bottom-nav-${item.href.replace("/", "") || "home"}`}
              >
                {item.icon}
                <span className="text-[11px] font-medium">{item.label}</span>
                {item.badgeCount ? (
                  <span className="absolute top-2 right-1/4 w-3.5 h-3.5 bg-red-400 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                    {item.badgeCount > 9 ? "9+" : item.badgeCount}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}

          {/* Center spacer — FAB is now fixed-positioned below */}
          <div className="flex-1" />

          {/* Last 2 nav items */}
          {bottomItems.slice(2, 4).map((item) => (
            <Link key={item.href} href={item.href} className="flex-1">
              <div
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-3 min-h-[48px] min-w-[48px] transition-colors relative",
                  location === item.href ? "text-primary" : "text-muted-foreground"
                )}
                data-testid={`bottom-nav-${item.href.replace("/", "") || "home"}`}
              >
                {item.icon}
                <span className="text-[11px] font-medium">{item.label}</span>
                {item.badgeCount ? (
                  <span className="absolute top-2 right-1/4 w-3.5 h-3.5 bg-red-400 text-white text-[9px] rounded-full flex items-center justify-center font-bold">
                    {item.badgeCount > 9 ? "9+" : item.badgeCount}
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </nav>

      {/* ScanFAB — opens camera QR scanner */}
      <button
        onClick={openScanner}
        className="fixed left-1/2 -translate-x-1/2 w-12 h-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md hover:bg-primary/90 active:scale-95 transition-all"
        style={{ bottom: "calc(36px + env(safe-area-inset-bottom))", zIndex: 60 }}
        aria-label={lh.scanQrAria}
        data-testid="bottom-nav-scan"
      >
        <Scan className="w-5 h-5" aria-hidden="true" />
      </button>

      {/* Scanner opened from bottom nav (non-home pages) */}
      {scannerOpen && (
        <QrScanner onClose={() => setScannerOpen(false)} />
      )}

      {/* Report Issue dialog */}
      <ReportIssueDialog
        open={reportIssueOpen}
        onOpenChange={setReportIssueOpen}
      />

      {/* Sync Queue sheet */}
      <SyncQueueSheet
        open={syncQueueOpen}
        onClose={() => setSyncQueueOpen(false)}
      />

      {/* First-run onboarding overlay — self-managed via localStorage */}
      <OnboardingWalkthrough />
    </div>
  );
}
