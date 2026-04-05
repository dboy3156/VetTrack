import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Camera, CameraOff, Loader2, X } from "lucide-react";

interface Props {
  onScan: (text: string) => void;
  open?: boolean;
  onClose?: () => void;
}

type ScannerStatus = "idle" | "requesting" | "scanning" | "denied" | "unavailable";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function QrScanner({ onScan, open: openProp, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const lastDecodeRef = useRef<number>(0);
  const cooldownRef = useRef(false);

  const isControlled = openProp !== undefined;
  const [internalOpen, setInternalOpen] = useState(false);
  const scannerOpen = isControlled ? openProp : internalOpen;

  function close() {
    if (isControlled) {
      onClose?.();
    } else {
      setInternalOpen(false);
    }
  }

  useEffect(() => {
    if (scannerOpen) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [scannerOpen]);

  function stopCamera() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }

  const [status, setStatus] = useState<ScannerStatus>("idle");

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    setStatus("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } },
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      setStatus("scanning");
      rafRef.current = requestAnimationFrame(scanLoop);
    } catch {
      setStatus("denied");
    }
  }

  function scanLoop(timestamp: number) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    if (timestamp - lastDecodeRef.current >= 100) {
      lastDecodeRef.current = timestamp;
      if (video.readyState >= 2 && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code?.data && !cooldownRef.current) {
            const parts = code.data.trim().split("/");
            const candidate = parts[parts.length - 1];
            if (UUID_RE.test(candidate)) {
              cooldownRef.current = true;
              close();
              onScan(candidate);
              setTimeout(() => { cooldownRef.current = false; }, 2500);
            }
          }
        }
      }
    }

    rafRef.current = requestAnimationFrame(scanLoop);
  }

  const cameraView = (
    <div className="relative w-full h-full bg-black">
      <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      {status === "scanning" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="relative w-56 h-56">
            <span className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-primary rounded-tl-md" />
            <span className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-primary rounded-tr-md" />
            <span className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-primary rounded-bl-md" />
            <span className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-primary rounded-br-md" />
            <div className="absolute inset-x-0 top-0 h-0.5 bg-primary opacity-80 animate-scan-line" />
          </div>
          <p className="mt-5 text-white font-semibold text-sm bg-black/50 px-4 py-1.5 rounded-full tracking-wide">
            Point at a QR code
          </p>
        </div>
      )}

      {status === "requesting" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 text-white gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm font-medium">Requesting camera access...</p>
        </div>
      )}

      {(status === "denied" || status === "unavailable") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 text-white gap-3 p-8 text-center">
          <CameraOff className="w-10 h-10 text-red-400" />
          <p className="font-semibold text-base">
            {status === "denied" ? "Camera access denied" : "Camera unavailable"}
          </p>
          <p className="text-sm text-white/60">Use the search bar to find equipment by name.</p>
        </div>
      )}

      <button
        onClick={close}
        className="absolute top-4 right-4 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );

  if (isControlled) {
    return scannerOpen ? cameraView : null;
  }

  return (
    <div className="flex flex-col gap-3">
      {!scannerOpen ? (
        <button
          onClick={() => setInternalOpen(true)}
          className="flex items-center justify-center gap-3 w-full h-14 rounded-xl bg-foreground text-background font-semibold text-base shadow-sm hover:bg-foreground/90 transition-colors"
        >
          <Camera className="w-7 h-7" />
          Scan QR Code
        </button>
      ) : (
        <div className="relative rounded-2xl overflow-hidden border border-border bg-black shadow-sm" style={{ aspectRatio: "4/3" }}>
          {cameraView}
        </div>
      )}
    </div>
  );
}
