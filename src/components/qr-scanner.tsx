import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  X,
  Flashlight,
  FlashlightOff,
  Keyboard,
  Camera,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { getCachedEquipmentById } from "@/lib/offline-db";
import { api } from "@/lib/api";

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
  | "manual";

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
  const el = (scanner as unknown as { videoElement?: HTMLVideoElement })
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

async function resolveEquipmentId(id: string): Promise<boolean> {
  const offline = await getCachedEquipmentById(id);
  if (offline) return true;
  if (!navigator.onLine) return false;
  try {
    await api.equipment.get(id);
    return true;
  } catch {
    return false;
  }
}

export function QrScanner({ onClose }: QrScannerProps) {
  const [, navigate] = useLocation();

  const [phase, setPhase] = useState<ScannerPhase>("init");
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [notFoundId, setNotFoundId] = useState<string | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastScanRef = useRef<number>(0);
  const stopScannerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const containerId = "qr-scanner-container";

  const navigateToEquipment = useCallback(
    (equipmentId: string) => {
      onClose();
      navigate(`/equipment/${equipmentId}?action=scan`);
    },
    [navigate, onClose]
  );

  const handleScanResult = useCallback(
    async (rawValue: string) => {
      const now = Date.now();
      if (now - lastScanRef.current < DEBOUNCE_MS) return;
      lastScanRef.current = now;

      const equipmentId = extractEquipmentId(rawValue);
      if (!equipmentId) {
        toast.error("Unrecognized QR code format");
        return;
      }

      const exists = await resolveEquipmentId(equipmentId);
      if (!exists) {
        setNotFoundId(equipmentId);
        await stopScannerRef.current();
        setPhase("not_found");
        return;
      }

      navigateToEquipment(equipmentId);
    },
    [navigateToEquipment]
  );

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const state = scannerRef.current.getState();
        if (
          state === Html5QrcodeScannerState.SCANNING ||
          state === Html5QrcodeScannerState.PAUSED
        ) {
          await scannerRef.current.stop();
        }
      } catch {
        // ignore
      }
      scannerRef.current = null;
    }
  }, []);

  stopScannerRef.current = stopScanner;

  const startScanner = useCallback(async () => {
    setPhase("init");

    try {
      const devices = await Html5Qrcode.getCameras();
      if (!devices || devices.length === 0) {
        setPhase("no_camera");
        return;
      }

      const scanner = new Html5Qrcode(containerId, { verbose: false });
      scannerRef.current = scanner;

      const backCamera = devices.find(
        (d) =>
          d.label.toLowerCase().includes("back") ||
          d.label.toLowerCase().includes("rear") ||
          d.label.toLowerCase().includes("environment")
      );
      const cameraId = backCamera?.id || devices[devices.length - 1].id;

      await scanner.start(
        { deviceId: { exact: cameraId } },
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          disableFlip: false,
        },
        (decodedText) => {
          handleScanResult(decodedText);
        },
        () => {}
      );

      setPhase("scanning");

      try {
        const track = getFirstVideoTrack(scanner);
        if (track && trackSupportsTorch(track)) {
          setTorchSupported(true);
        }
      } catch {
        // torch check failed — that's fine
      }
    } catch (err: unknown) {
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
    startScanner();
    return () => {
      stopScanner();
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
      toast.error("Torch not available on this device");
    }
  };

  const handleManualSubmit = async () => {
    const raw = manualCode.trim();
    if (!raw) return;
    const equipmentId = extractEquipmentId(raw);
    if (!equipmentId) {
      toast.error("Invalid code format");
      return;
    }
    const exists = await resolveEquipmentId(equipmentId);
    if (!exists) {
      setNotFoundId(equipmentId);
      setPhase("not_found");
      return;
    }
    navigateToEquipment(equipmentId);
  };

  const handleScanAgain = async () => {
    setNotFoundId(null);
    setPhase("init");
    await stopScanner();
    setTimeout(() => startScanner(), 100);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" data-testid="qr-scanner-overlay">
      {/* Header */}
      <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-3 bg-black/80">
        <span className="text-white font-semibold text-lg">Scan QR Code</span>
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

      {/* Camera viewport — hidden during manual entry so the manual panel fills the space */}
      <div className={phase === "manual" ? "hidden" : "flex-1 relative flex items-center justify-center bg-black"}>
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
              <p className="font-bold text-lg">Camera Access Denied</p>
              <p className="text-sm text-white/70">
                Allow camera access in your browser settings, then try again.
              </p>
              <Button
                variant="outline"
                className="text-white border-white/40 bg-white/10 hover:bg-white/20 gap-2 mt-2"
                onClick={() => stopScanner().then(() => setPhase("manual"))}
                data-testid="btn-manual-entry"
              >
                <Keyboard className="w-4 h-4" />
                Enter Code Manually
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

        {/* Scanning guide overlay */}
        {phase === "scanning" && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative">
              <div className="w-60 h-60 border-2 border-white/60 rounded-2xl">
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-xl" />
              </div>
              <p className="text-white/70 text-xs text-center mt-4">
                Point at a VetTrack QR code
              </p>
            </div>
          </div>
        )}
      </div>

      {/* "Enter code manually" footer (scanning phase) */}
      {phase === "scanning" && (
        <div className="bg-black/80 px-4 pb-6 pt-3 flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            className="text-white/70 hover:text-white hover:bg-white/10 gap-2"
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

      {/* Manual entry mode — rendered as a flex child so header cancel stays accessible */}
      {phase === "manual" && (
        <div className="flex-1 bg-black/95 flex flex-col items-center justify-center p-6 gap-5">
          <p className="text-white font-bold text-xl">Enter Equipment Code</p>
          <p className="text-white/60 text-sm text-center">
            Type the equipment ID from the QR label, or paste the full URL.
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
              Look Up
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
              Back to Camera
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
