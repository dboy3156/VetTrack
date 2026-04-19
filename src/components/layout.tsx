import { t } from "@/lib/i18n";
import { Link, useLocation } from "wouter";
import { useQRScanner } from "@/hooks/use-qr-scanner";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { computeAlerts } from "@/lib/utils";
import {
  Home,
  Package,
  BarChart3,
  AlertTriangle,
  Siren,
  QrCode,
  Shield,
  Menu,
  X,
  WifiOff,
  PackageOpen,
  Clock,
  CalendarDays,
  XCircle,
  RefreshCw,
  CheckCircle,
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
  ClipboardList,
  Search,
  Map,
  Pill,
} from "lucide-react";
import { OnboardingWalkthrough } from "@/components/onboarding-walkthrough";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useState, useEffect, useMemo, useRef } from "react";
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
  /** When true, blocks leaving the flow via header/sidebar/outside taps (hands-free restock). */
  navigationLocked?: boolean;
}

export function Layout({ children, title: _title, onScan, navigationLocked }: LayoutProps) {
  const lh = t.layoutHebrew;
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
  const { isAdmin, role, userId } = useAuth();
  const { pendingCount, failedCount, isSyncing, justSynced, triggerSync } = useSync();
  const { settings, update } = useSettings();
  const quickSettingsRef = useRef<HTMLDivElement>(null);
  const quickSettingsToggleRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();

  useEffect(() => {
    if (!navigationLocked) return;
    const blockExternalNav = (e: MouseEvent) => {
      for (const n of e.composedPath()) {
        if (n instanceof Element && n.closest("[data-restock-allow]")) return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      navigator.vibrate?.(150);
    };
    document.addEventListener("click", blockExternalNav, true);
    return () => document.removeEventListener("click", blockExternalNav, true);
  }, [navigationLocked]);

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

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;
    const debouncedUpdateQuickSettingsPlacement = () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      debounceTimer = setTimeout(updateQuickSettingsPlacement, 100);
    };

    updateQuickSettingsPlacement();
    window.addEventListener("resize", debouncedUpdateQuickSettingsPlacement);
    window.addEventListener("scroll", debouncedUpdateQuickSettingsPlacement, true);
    return () => {
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }
      window.removeEventListener("resize", debouncedUpdateQuickSettingsPlacement);
      window.removeEventListener("scroll", debouncedUpdateQuickSettingsPlacement, true);
    };
  }, [quickSettingsOpen]);

  const openScanner = () => {
    if (onScan) {
      onScan();
    } else {
      setScannerOpen(true);
    }
  };

  useQRScanner(async (assetId) => {
    if (assetId.startsWith("inv-container:")) {
      const containerId = assetId.slice("inv-container:".length).trim();
      if (!containerId) {
        toast.error("Invalid container NFC tag");
        return;
      }
      const rawActive = localStorage.getItem("vt_active_restock_session");
      if (rawActive) {
        try {
          const parsed = JSON.parse(rawActive) as { containerId?: string };
          if (parsed.containerId && parsed.containerId !== containerId) {
            navigator.vibrate?.(150);
            toast.warning("Finish restock before scanning another container.");
            return;
          }
        } catch {
          /* ignore */
        }
      }
      sessionStorage.setItem("vt_auto_restock_container", containerId);
      navigate(`/inventory?container=${encodeURIComponent(containerId)}`);
      return;
    }

    if (assetId.startsWith("inv-item:")) {
      const nfcTagId = assetId.slice("inv-item:".length).trim();
      if (!nfcTagId) {
        toast.error("Invalid inventory item NFC tag");
        return;
      }
      const raw = localStorage.getItem("vt_active_restock_session");
      if (!raw) {
        toast.error("Start a restock session before scanning item tags");
        return;
      }
      try {
        const parsed = JSON.parse(raw) as { sessionId?: string; containerId?: string };
        if (!parsed.sessionId) {
          toast.error("No active restock session found");
          return;
        }
        await api.restock.scan(parsed.sessionId, { nfcTagId, delta: 1 });
        navigator.vibrate?.(50);
        if (parsed.containerId) {
          qc.invalidateQueries({ queryKey: ["/api/restock/container-items", parsed.containerId] });
        }
        navigate("/inventory");
        return;
      } catch {
        navigator.vibrate?.(150);
        toast.error("Inventory scan failed");
        return;
      }
    }

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
    enabled: !!userId,
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: myEquipment } = useQuery({
    queryKey: ["/api/equipment/my"],
    queryFn: api.equipment.listMy,
    enabled: !!userId,
    staleTime: 30_000,
    retry: false,
    refetchOnWindowFocus: false,
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

  const canAccessCodeBlue = isAdmin || role === "vet";

  const canAccessHandoverInventory =
    role === "admin" || role === "vet" || role === "technician";

  const navItems: NavItem[] = useMemo(() => [
    { href: "/", label: lh.home, icon: <Home className="w-5 h-5" /> },
    { href: "/equipment", label: t.equipment.title, icon: <Package className="w-5 h-5" /> },
    {
      href: "/alerts",
      label: t.layout.nav.alerts,
      icon: <AlertTriangle className="w-5 h-5" />,
      badgeCount: alertCount,
    },
    ...(canAccessCodeBlue
      ? [{
          href: "/code-blue",
          label: "Code Blue",
          icon: <Siren className="w-5 h-5 text-red-500" />,
        } satisfies NavItem]
      : []),
    {
      href: "/my-equipment",
      label: t.layout.nav.mine,
      icon: <PackageOpen className="w-5 h-5" />,
      badgeCount: myCount,
    },
    { href: "/appointments", label: "Tasks", icon: <CalendarDays className="w-5 h-5" />, menuOnly: true },
    { href: "/meds", label: "Medication Hub", icon: <Pill className="w-5 h-5" />, menuOnly: true },
    { href: "/rooms", label: lh.radar, icon: <Radar className="w-5 h-5" /> },
    ...(canAccessHandoverInventory
      ? [
          { href: "/shift-handover", label: lh.shiftHandover, icon: <ClipboardList className="w-5 h-5" /> } satisfies NavItem,
          { href: "/inventory", label: lh.inventory, icon: <Package className="w-5 h-5" /> } satisfies NavItem,
        ]
      : []),
    { href: "/analytics", label: lh.analytics, icon: <BarChart3 className="w-5 h-5" /> },
    { href: "/dashboard", label: lh.dashboard, icon: <LayoutDashboard className="w-5 h-5" />, menuOnly: true },
    { href: "/print", label: lh.printQr, icon: <QrCode className="w-5 h-5" />, menuOnly: true },
    { href: "/admin", label: lh.admin, icon: <Shield className="w-5 h-5" />, adminOnly: true, menuOnly: true },
    { href: "/admin/shifts", label: lh.adminShifts, icon: <CalendarDays className="w-5 h-5" />, adminOnly: true, menuOnly: true },
    { href: "/stability", label: lh.stability, icon: <FlaskConical className="w-5 h-5" />, adminOnly: true, menuOnly: true },
    { href: "/help", label: lh.quickGuide, icon: <HelpCircle className="w-5 h-5" />, menuOnly: true },
    { href: "/settings", label: lh.settings, icon: <Settings className="w-5 h-5" />, menuOnly: true },
    { href: "/landing", label: lh.about, icon: <Globe className="w-5 h-5" />, menuOnly: true },
  ], [alertCount, canAccessCodeBlue, canAccessHandoverInventory, myCount, lh, t]);

  const visibleItems = navItems.filter((item) => !item.adminOnly || isAdmin);

  const bottomNavActive = useMemo(
    () => ({
      home: location === "/" || location === "",
      equipment: location.startsWith("/equipment"),
      rooms: location.startsWith("/rooms"),
    }),
    [location],
  );

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

  const openSettingsPage = () => {
    setQuickSettingsOpen(false);
    setMenuOpen(false);
    navigate("/settings");
  };

  return (
    <div className="min-h-[100dvh] bg-background">
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="w-full justify-start gap-2 text-xs text-muted-foreground"
                      onClick={openSettingsPage}
                    >
                      <Settings className="w-3.5 h-3.5" />
                      {lh.allSettings}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {menuOpen && (
          <div className="border-t border-border/60 bg-background px-4 py-3 max-w-2xl mx-auto max-h-[75vh] overflow-y-auto">
            <nav className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-1 pb-0.5">Operations</p>
              {["/", "/equipment", "/alerts", "/code-blue", "/my-equipment", "/appointments", "/meds", "/rooms", "/shift-handover", "/inventory"].map((href) => {
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

              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-0.5">Management</p>
              {["/analytics", "/dashboard", "/admin", "/admin/shifts", "/stability", "/print"].map((href) => {
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

              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-3 pt-2 pb-0.5">System</p>
              {["/help", "/settings", "/landing"].map((href) => {
                const item = visibleItems.find((i) => i.href === href);
                if (!item) return null;
                if (href === "/settings") {
                  return (
                    <button
                      key={item.href}
                      onClick={openSettingsPage}
                      data-testid={`nav-${item.href.replace("/", "") || "home"}`}
                      className="w-full text-left"
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
                    </button>
                  );
                }
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

      <main
        className={cn(
          "max-w-2xl mx-auto px-4 pb-nav-safe",
          settings.density === "compact" ? "py-3" : "py-5"
        )}
      >
        {children}
      </main>

      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/80 bg-background/98 backdrop-blur-md shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.12)]"
        style={{
          paddingBottom: "env(safe-area-inset-bottom)",
          willChange: "transform",
          WebkitTransform: "translateZ(0)",
          transform: "translateZ(0)",
        }}
        aria-label={lh.bottomMenu}
      >
        <div className="grid grid-cols-5 max-w-2xl mx-auto items-end min-h-[68px] px-0.5 pt-1">
          <Link href="/" className="flex flex-col items-center justify-end gap-0.5 pb-2 min-h-[52px]" data-testid="bottom-nav-home">
            <Home
              className={cn(
                "w-6 h-6 transition-colors",
                bottomNavActive.home ? "text-primary" : "text-muted-foreground"
              )}
              aria-hidden
            />
            <span
              className={cn(
                "text-[10px] font-semibold leading-tight text-center max-w-[4.5rem] truncate",
                bottomNavActive.home ? "text-primary" : "text-muted-foreground"
              )}
            >
              {lh.bottomHome}
            </span>
          </Link>

          <Link href="/equipment" className="flex flex-col items-center justify-end gap-0.5 pb-2 min-h-[52px]" data-testid="bottom-nav-equipment">
            <Search
              className={cn(
                "w-6 h-6 transition-colors",
                bottomNavActive.equipment ? "text-primary" : "text-muted-foreground"
              )}
              aria-hidden
            />
            <span
              className={cn(
                "text-[10px] font-semibold leading-tight text-center max-w-[4.5rem] truncate",
                bottomNavActive.equipment ? "text-primary" : "text-muted-foreground"
              )}
            >
              {lh.bottomEquipment}
            </span>
          </Link>

          <div className="flex flex-col items-center justify-end pb-1 relative">
            <button
              type="button"
              onClick={() => {
                openScanner();
                navigator.vibrate?.(15);
              }}
              className={cn(
                "-mt-6 mb-0.5 flex h-[3.75rem] w-[3.75rem] shrink-0 items-center justify-center rounded-2xl",
                "bg-primary text-primary-foreground shadow-lg shadow-primary/25",
                "ring-4 ring-background dark:ring-background",
                "hover:bg-primary/90 active:scale-[0.97] transition-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              )}
              aria-label={lh.bottomScan}
              data-testid="bottom-nav-scan"
            >
              <QrCode className="w-8 h-8" aria-hidden />
            </button>
            <span className="text-[10px] font-bold text-foreground leading-tight text-center">{lh.bottomScan}</span>
          </div>

          <Link href="/rooms" className="flex flex-col items-center justify-end gap-0.5 pb-2 min-h-[52px]" data-testid="bottom-nav-rooms">
            <Map
              className={cn(
                "w-6 h-6 transition-colors",
                bottomNavActive.rooms ? "text-primary" : "text-muted-foreground"
              )}
              aria-hidden
            />
            <span
              className={cn(
                "text-[10px] font-semibold leading-tight text-center max-w-[4.5rem] truncate px-0.5",
                bottomNavActive.rooms ? "text-primary" : "text-muted-foreground"
              )}
            >
              {lh.bottomRooms}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex flex-col items-center justify-end gap-0.5 pb-2 min-h-[52px] w-full"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t.common.closeNavigationMenu : lh.bottomMenu}
            data-testid="bottom-nav-menu"
          >
            {menuOpen ? (
              <X className="w-6 h-6 text-primary" aria-hidden />
            ) : (
              <Menu className="w-6 h-6 text-muted-foreground" aria-hidden />
            )}
            <span className={cn("text-[10px] font-semibold", menuOpen ? "text-primary" : "text-muted-foreground")}>
              {lh.bottomMenu}
            </span>
          </button>
        </div>
      </nav>

      {scannerOpen && (
        <QrScanner onClose={() => setScannerOpen(false)} />
      )}

      <ReportIssueDialog
        open={reportIssueOpen}
        onOpenChange={setReportIssueOpen}
      />

      <SyncQueueSheet
        open={syncQueueOpen}
        onClose={() => setSyncQueueOpen(false)}
      />

      <OnboardingWalkthrough />
    </div>
  );
}
