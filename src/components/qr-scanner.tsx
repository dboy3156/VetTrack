import { t } from "@/lib/i18n";
import { useEffect, useRef, useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  X,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Camera,
  AlertCircle,
  Loader2,
  LogIn,
  LogOut,
  Wrench,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { statusToBadgeVariant } from "@/lib/design-tokens";
import { STATUS_LABELS } from "@/types";
import type { Equipment } from "@/types";

interface QrScannerProps {
  onClose: () => void;
}

type ScannerPhase =
  | "init"
  | "scanning"
  | "permission_denied"
  | "no_camera"
  | "error"
  | "not_found"
  | "manual"
  | "result";

const DEBOUNCE_MS = 2000;

function errorToString(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  return String(err);
}

interface ExtendedMediaTrackCapabilities extends MediaTrackCapabilities {
  torch?: boolean;
}

function getFirstVideoTrack(scanner: Html5Qrcode): MediaStreamTrack | null {
  const el = (scanner as Html5Qrcode & { videoElement?: HTMLVideoElement })
    .videoElement;
  const stream = el?.srcObject;
  if (!stream || !(stream instanceof MediaStream)) return null;
  const tracks = stream.getVideoTracks();
  return tracks[0] ?? null;
}

function trackSupportsTorch(track: MediaStreamTrack): boolean {
  const caps = track.getCapabilities?.() as ExtendedMediaTrackCapabilities | undefined;
  return caps?.torch !== undefined;
}

export function extractEquipmentId(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split("/");
    const idx = parts.indexOf("equipment");
    if (idx >= 0 && parts[idx + 1]) {
      return parts[idx + 1];
    }
    return null;
  } catch {
    if (!trimmed.includes(" ") && trimmed.length > 0) {
      return trimmed;
    }
    return null;
  }
}

// Nuclear camera teardown — works in both Safari and PWA/Standalone mode.
// Requests a fresh stream solely to get a handle on any active tracks, then
// immediately stops and disables every one of them.
const killAllCameras = () => {
  if (navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
      stream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
    }).catch(() => {});
  }
};

export function QrScanner({ onClose }: QrScannerProps) {
  const [, navigate] = useLocation();
  const { userId, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [phase, setPhase] = useState<ScannerPhase>("init");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [notFoundId, setNotFoundId] = useState<string | null>(null);
  const [scannedEquipment, setScannedEquipment] = useState<Equipment | null>(null);
  const [isActing, setIsActing] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<number>(0);
  const stopScannerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showFallbackHint, setShowFallbackHint] = useState(false);
  const containerId = "qr-scanner-container";

  const navigateToEquipment = useCallback(
    (equipmentId: string, action?: string) => {
      onClose();
      if (action) {
        navigate(`/equipment/${equipmentId}?action=${action}`);
      } else {
        navigate(`/equipment/${equipmentId}`);
      }
    },
    [navigate, onClose]
  );

  const getEquipmentFromCache = useCallback(
    (equipmentId: string): Equipment | null => {
      const detail = queryClient.getQueryData<Equipment>([`/api/equipment/${equipmentId}`]);
      if (detail?.id === equipmentId) return detail;

      const cachedLists = queryClient.getQueriesData({
        queryKey: ["/api/equipment"],
      });
      for (const [, data] of cachedLists) {
        if (Array.isArray(data)) {
          const match = (data as Equipment[]).find((item) => item.id === equipmentId);
          if (match) return match;
          continue;
        }
        if (
          data &&
          typeof data === "object" &&
          "items" in data &&
          Array.isArray((data as { items: unknown[] }).items)
        ) {
          const match = ((data as { items: Equipment[] }).items).find((item) => item.id === equipmentId);
          if (match) return match;
        }
      }
      return null;
    },
    [queryClient]
  );

  const resolveEquipmentId = useCallback(
    async (equipmentId: string): Promise<Equipment | null> => {
      const cached = getEquipmentFromCache(equipmentId);
      if (cached) return cached;
      if (!navigator.onLine) return null;
      try {
        const equipment = await api.equipment.get(equipmentId);
        queryClient.setQueryData([`/api/equipment/${equipmentId}`], equipment);
        return equipment;
      } catch {
        return null;
      }
    },
    [getEquipmentFromCache, queryClient]
  );

  const handleScanResult = useCallback(
    async (rawValue: string) => {
      const now = Date.now();
      if (now - lastScanRef.current < DEBOUNCE_MS) return;
      lastScanRef.current = now;

      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      const equipmentId = extractEquipmentId(rawValue);
      if (!equipmentId) {
        toast.error(t.qrScanner.unknownQrFormat);
        return;
      }

      const eq = await resolveEquipmentId(equipmentId);
      if (!eq) {
        setNotFoundId(equipmentId);
        await stopScannerRef.current();
        setPhase("not_found");
        return;
      }

      await stopScannerRef.current();
      navigator.vibrate?.(50); // Haptic feedback — Android Web API; iOS: TODO: Capacitor Haptics plugin
      setScannedEquipment(eq);
      setPhase("result");
    },
    [resolveEquipmentId]
  );

  const stopScanner = useCallback(async () => {
    // Nuclear first: kill all camera tracks before anything else so the iOS
    // orange dot disappears immediately, even if the library teardown is slow.
    killAllCameras();

    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (state !== 1) { // 1 = NOT_STARTED / IDLE
          await scannerRef.current.stop();
        }
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
    // Also clear the srcObject from the video element if it exists
    const videoEl = document.querySelector(`#${containerId} video`) as HTMLVideoElement | null;
    if (videoEl) {
      videoEl.srcObject = null;
      videoEl.load();
    }
    // Signal iOS PWA that the page context has changed — helps the system
    // reclaim the camera session in Standalone mode.
    window.dispatchEvent(new Event("locationchange"));
  }, []);

  stopScannerRef.current = stopScanner;

  const startScanner = useCallback(async () => {
    setPhase("init");

    if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
    initTimeoutRef.current = setTimeout(async () => {
      initTimeoutRef.current = null;
      if (scannerRef.current) {
        try {
          const state = scannerRef.current.getState();
          if (
            state === Html5QrcodeScannerState.SCANNING ||
            state === Html5QrcodeScannerState.PAUSED
          ) {
            return;
          }
          await scannerRef.current.stop().catch(() => {});
        } catch {
          // ignore
        }
        scannerRef.current = null;
      }
      setManualCode("");
      setPhase("manual");
    }, 10000);

    try {
      const scanner = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;

      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          disableFlip: false,
        },
        (decodedText) => {
          handleScanResult(decodedText);
        },
        () => {}
      );

      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }

      setPhase("scanning");
      setShowFallbackHint(false);

      fallbackTimerRef.current = setTimeout(() => {
        setShowFallbackHint(true);
      }, 8000);

      try {
        const track = getFirstVideoTrack(scanner);
        if (track && trackSupportsTorch(track)) {
          setTorchSupported(true);
        }
      } catch {
        // torch check failed — that's fine
      }
    } catch (err: unknown) {
      if (initTimeoutRef.current) {
        clearTimeout(initTimeoutRef.current);
        initTimeoutRef.current = null;
      }
      const msg = errorToString(err);
      if (
        msg.includes("Permission") ||
        msg.includes("NotAllowed") ||
        msg.includes("permission")
      ) {
        setPhase("permission_denied");
      } else if (
        msg.includes("NotFound") ||
        msg.includes("OverconstrainedError")
      ) {
        setPhase("no_camera");
      } else {
        setPhase("error");
      }
    }
  }, [handleScanResult]);

  useEffect(() => {
    const t = setTimeout(() => startScanner(), 100);
    return () => {
      clearTimeout(t);
      stopScanner();
    };
  }, []);

  // Kill camera immediately when the app is backgrounded or the screen is locked.
  // Prevents the persistent iOS PWA "Recording" orange dot on minimize/lock.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stopScannerRef.current();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const toggleTorch = async () => {
    if (!scannerRef.current) return;
    try {
      const track = getFirstVideoTrack(scannerRef.current);
      if (!track) return;
      interface TorchConstraint extends MediaTrackConstraintSet {
        torch?: boolean;
      }
      await track.applyConstraints({ advanced: [{ torch: !torchOn } as TorchConstraint] });
      setTorchOn((prev) => !prev);
    } catch {
      toast.error(t.qrScanner.torchUnavailable);
    }
  };

  const handleManualSubmit = async () => {
    const raw = manualCode.trim();
    if (!raw) return;
    const equipmentId = extractEquipmentId(raw);
    if (!equipmentId) {
      toast.error(t.qrScanner.invalidCodeFormat);
      return;
    }
    const eq = await resolveEquipmentId(equipmentId);
    if (!eq) {
      setNotFoundId(equipmentId);
      setPhase("not_found");
      return;
    }
    navigator.vibrate?.(50);
    setScannedEquipment(eq);
    setPhase("result");
  };

  const handleScanAgain = async () => {
    setNotFoundId(null);
    setScannedEquipment(null);
    setPhase("init");
    await stopScanner();
    setTimeout(() => startScanner(), 100);
  };

  const isCheckedOut = !!(scannedEquipment?.checkedOutById);
  const checkedOutByMe = scannedEquipment?.checkedOutById === userId;

  async function handleCheckout() {
    if (!scannedEquipment) return;
    setIsActing(true);
    try {
      await api.equipment.checkout(scannedEquipment.id);
      navigator.vibrate?.(50);
      toast.success(`${scannedEquipment.name} checked out`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Checkout failed";
      toast.error(msg);
      setIsActing(false);
    }
  }

  async function handleReturn() {
    if (!scannedEquipment) return;
    setIsActing(true);
    try {
      await api.equipment.return(scannedEquipment.id);
      navigator.vibrate?.(50);
      toast.success(`${scannedEquipment.name} returned`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Return failed";
      toast.error(msg);
      setIsActing(false);
    }
  }

  async function handleMarkOk() {
    if (!scannedEquipment) return;
    setIsActing(true);
    try {
      await api.equipment.scan(scannedEquipment.id, { status: "ok" });
      navigator.vibrate?.(50);
      toast.success(`${scannedEquipment.name} marked as OK`);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Status update failed";
      toast.error(msg);
      setIsActing(false);
    }
  }

  function handleMarkIssue() {
    if (!scannedEquipment) return;
    navigateToEquipment(scannedEquipment.id, "issue");
  }

  return (
    <div className="fixed top-0 left-0 right-0 h-[100dvh] z-50 bg-black flex flex-col" data-testid="qr-scanner-overlay">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pb-3 bg-black/80" style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}>
        <span className="text-white font-semibold text-lg">{t.qrScanner.title}</span>
        <div className="flex items-center gap-2">
          {torchSupported && phase === "scanning" && (
            <Button
              variant="ghost"
              size="icon"
              className="text-white hover:bg-white/10"
              onClick={toggleTorch}
              data-testid="btn-torch-toggle"
            >
              {torchOn ? (
                <FlashlightOff className="w-5 h-5" />
              ) : (
                <Flashlight className="w-5 h-5" />
              )}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-white hover:bg-white/10"
            onClick={onClose}
            data-testid="btn-scanner-cancel"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>
      </div>

      {/* Camera viewport — collapsed (not display:none) during manual/result so the
          container div keeps its DOM presence for html5-qrcode re-init */}
      <div className={`relative flex items-center justify-center bg-black overflow-hidden ${phase === "manual" || phase === "result" ? "flex-none h-0" : "flex-1 min-h-0"}`}>
        <div id={containerId} className="w-full h-full" />

        {/* Loading */}
        {phase === "init" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="flex flex-col items-center gap-3 text-white">
              <Loader2 className="w-10 h-10 animate-spin" />
              <p className="text-sm font-medium">Starting camera…</p>
            </div>
          </div>
        )}

        {/* Permission denied */}
        {phase === "permission_denied" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
            <div className="flex flex-col items-center gap-4 text-center text-white max-w-xs">
              <Camera className="w-14 h-14 text-white/60" />
              <p className="font-bold text-lg">{t.qrScanner.permissionDeniedTitle}</p>
              <p className="text-sm text-white/70">
                {t.qrScanner.permissionDeniedDesc}
              </p>
              <Button
                variant="outline"
                className="text-white border-white/40 bg-white/10 hover:bg-white/20 gap-2 mt-2"
                onClick={() => stopScanner().then(() => setPhase("manual"))}
                data-testid="btn-manual-entry"
              >
                <Keyboard className="w-4 h-4" />
                {t.qrScanner.manualEnterButton}
              </Button>
            </div>
          </div>
        )}

        {/* No camera */}
        {phase === "no_camera" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
            <div className="flex flex-col items-center gap-4 text-center text-white max-w-xs">
              <AlertCircle className="w-14 h-14 text-white/60" />
              <p className="font-bold text-lg">No Camera Found</p>
              <p className="text-sm text-white/70">
                This device doesn't have a usable camera.
              </p>
              <Button
                variant="outline"
                className="text-white border-white/40 bg-white/10 hover:bg-white/20 gap-2 mt-2"
                onClick={() => setPhase("manual")}
                data-testid="btn-manual-entry-no-camera"
              >
                <Keyboard className="w-4 h-4" />
                Enter Code Manually
              </Button>
            </div>
          </div>
        )}

        {/* Generic error */}
        {phase === "error" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
            <div className="flex flex-col items-center gap-4 text-center text-white max-w-xs">
              <AlertCircle className="w-14 h-14 text-red-400" />
              <p className="font-bold text-lg">Camera Error</p>
              <p className="text-sm text-white/70">
                Unable to start the camera. Try again or enter the code manually.
              </p>
              <div className="flex flex-col gap-2 w-full mt-2">
                <Button
                  className="gap-2"
                  onClick={() => {
                    stopScanner().then(() => startScanner());
                  }}
                >
                  Try Again
                </Button>
                <Button
                  variant="outline"
                  className="text-white border-white/40 bg-white/10 hover:bg-white/20 gap-2"
                  onClick={() => {
                    setManualCode("");
                    stopScanner().then(() => setPhase("manual"));
                  }}
                >
                  <Keyboard className="w-4 h-4" />
                  Enter Code Manually
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Equipment not found */}
        {phase === "not_found" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/90 p-6">
            <div className="flex flex-col items-center gap-4 text-center text-white max-w-xs">
              <AlertCircle className="w-14 h-14 text-amber-400" />
              <p className="font-bold text-lg">Equipment Not Found</p>
              <p className="text-sm text-white/70">
                No equipment matches:{" "}
                <span className="font-mono text-xs break-all">{notFoundId}</span>
              </p>
              <div className="flex flex-col gap-2 w-full mt-2">
                <Button
                  className="gap-2"
                  onClick={handleScanAgain}
                  data-testid="btn-scan-again"
                >
                  Scan Again
                </Button>
                <Button
                  variant="outline"
                  className="text-white border-white/40 bg-white/10 hover:bg-white/20 gap-2"
                  onClick={() => {
                    setManualCode("");
                    stopScanner().then(() => setPhase("manual"));
                  }}
                >
                  <Keyboard className="w-4 h-4" />
                  Enter Code Manually
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Scanning guide overlay — z-10 ensures it sits above html5-qrcode's injected video UI */}
        {phase === "scanning" && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
            <div
              className="relative flex-shrink-0"
              style={{
                width: 250,
                height: 250,
                boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
                borderRadius: "2px",
              }}
            >
              {/* Corner brackets */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
              {/* Animated scan line */}
              <div className="qr-scan-line absolute left-0 right-0 h-0.5 bg-primary/80" />
              {/* Helper text below the frame */}
              <p className="text-white/70 text-xs text-center absolute -bottom-8 left-0 right-0 whitespace-nowrap">
                {t.qrScanner.guideAim}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* "Enter code manually" footer (scanning phase) */}
      {phase === "scanning" && (
        <div className="bg-black/80 px-4 pt-3 flex flex-col items-center gap-2" style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}>
          {showFallbackHint && (
            <p className="text-white/60 text-xs text-center animate-fade-in">
              Having trouble? Try entering the ID manually.
            </p>
          )}
          <Button
            variant="ghost"
            size="sm"
            className={`gap-2 ${showFallbackHint ? "text-white hover:text-white hover:bg-white/20" : "text-white/70 hover:text-white hover:bg-white/10"}`}
            onClick={() => {
              stopScanner();
              setPhase("manual");
            }}
            data-testid="btn-switch-manual"
          >
            <Keyboard className="w-4 h-4" />
            Enter code manually
          </Button>
        </div>
      )}

      {/* Manual entry mode */}
      {phase === "manual" && (
        <div className="flex-1 bg-black/95 flex flex-col items-center justify-center p-6 gap-5">
          <p className="text-white font-bold text-xl">{t.qrScanner.manualEnterTitle}</p>
          <p className="text-white/60 text-sm text-center">
            {t.qrScanner.manualEnterDesc}
          </p>
          <Input
            className="bg-white/10 border-white/20 text-white placeholder:text-white/40 focus:border-primary"
            placeholder="Equipment ID or URL…"
            value={manualCode}
            onChange={(e) => setManualCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleManualSubmit()}
            autoFocus
            data-testid="input-manual-code"
          />
          <div className="flex flex-col gap-2 w-full">
            <Button
              className="w-full"
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
              data-testid="btn-manual-submit"
            >
              {t.qrScanner.search}
            </Button>
            <Button
              variant="outline"
              className="w-full text-white border-white/20 bg-white/5 hover:bg-white/10"
              onClick={() => {
                setManualCode("");
                startScanner();
              }}
              data-testid="btn-back-to-scan"
            >
              {t.qrScanner.backToCamera}
            </Button>
          </div>
        </div>
      )}

      {/* Inline quick-action sheet — shown after successful QR resolve */}
      {phase === "result" && scannedEquipment && (
        <div className="flex-1 bg-black/95 flex flex-col justify-end" style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}>
          <div className="bg-white rounded-t-3xl px-5 pt-5 pb-6 mx-0 w-full" data-testid="scan-inline-sheet">
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            {/* Equipment info */}
            <div className="flex items-start gap-3 mb-4">
              <div className="flex-1 min-w-0">
                <p className="font-bold text-lg leading-tight truncate" data-testid="scan-inline-equipment-name">
                  {scannedEquipment.name}
                </p>
                {scannedEquipment.serialNumber && (
                  <p className="text-xs text-muted-foreground mt-0.5">#{scannedEquipment.serialNumber}</p>
                )}
                {scannedEquipment.location && (
                  <p className="text-xs text-muted-foreground">{scannedEquipment.location}</p>
                )}
              </div>
              <Badge variant={statusToBadgeVariant(scannedEquipment.status)} className="shrink-0" data-testid="scan-inline-status-badge">
                {STATUS_LABELS[scannedEquipment.status] || scannedEquipment.status}
              </Badge>
            </div>

            {/* Checkout info */}
            {isCheckedOut && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5 mb-4 text-sm">
                <p className="font-medium text-blue-800">
                  {checkedOutByMe
                    ? "Checked out by you"
                    : `In use by ${scannedEquipment.checkedOutByEmail || "another user"}`}
                </p>
                {scannedEquipment.checkedOutLocation && (
                  <p className="text-blue-700 text-xs mt-0.5">
                    Location: {scannedEquipment.checkedOutLocation}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col gap-2.5">
              {/* Checkout / Return */}
              {!isCheckedOut && (
                <Button
                  size="lg"
                  className="w-full gap-2.5"
                  onClick={handleCheckout}
                  disabled={isActing}
                  data-testid="btn-scan-inline-checkout"
                >
                  {isActing ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                  Check Out
                </Button>
              )}

              {isCheckedOut && (checkedOutByMe || isAdmin) && (
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full gap-2.5"
                  onClick={handleReturn}
                  disabled={isActing}
                  data-testid="btn-scan-inline-return"
                >
                  {isActing ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                  Return
                </Button>
              )}

              {isCheckedOut && !checkedOutByMe && !isAdmin && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-sm text-amber-800">
                  Only the person who checked this out (or an admin) can return it.
                </div>
              )}

              {/* Status quick-actions: Mark OK / Mark Issue */}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                  onClick={handleMarkOk}
                  disabled={isActing || scannedEquipment.status === "ok"}
                  data-testid="btn-scan-inline-mark-ok"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Mark OK
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-1.5 border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                  onClick={handleMarkIssue}
                  disabled={isActing}
                  data-testid="btn-scan-inline-mark-issue"
                >
                  <Wrench className="w-4 h-4" />
                  Report Issue
                </Button>
              </div>

              <Button
                variant="ghost"
                className="w-full text-sm text-muted-foreground"
                onClick={() => navigateToEquipment(scannedEquipment.id)}
                data-testid="btn-scan-inline-details"
              >
                View Full Details
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
