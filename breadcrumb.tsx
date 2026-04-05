import { useEffect, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (result: string) => void;
  onError?: (error: string) => void;
}

export function QRScanner({ onScan, onError }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  // onScan מועבר ב-ref כדי למנוע stale closure
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  const containerId = "qr-scanner-container";

  useEffect(() => {
    onScanRef.current = onScan;
    onErrorRef.current = onError;
  }, [onScan, onError]);

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (result) => {
          onScanRef.current(result);
          scanner.stop().catch(() => {});
        },
        (error) => {
          onErrorRef.current?.(error);
        },
      )
      .catch((err) => console.error("[VetTrack] QR Scanner error:", err));

    return () => {
      scanner.stop().catch(() => {});
    };
  }, []); // containerId קבוע — אין צורך ב-deps

  return (
    <div className="flex flex-col items-center gap-4">
      <div
        id={containerId}
        className="w-full max-w-sm rounded-xl overflow-hidden"
      />
      <p className="text-sm text-muted-foreground">כוון את המצלמה לברקוד QR</p>
    </div>
  );
}
