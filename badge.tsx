import { useEffect, useRef } from "react";
import QRCodeLib from "qrcode";

interface Props {
  equipmentId: string;
  size?: number;
}

export function QRCode({ equipmentId, size = 200 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // תוקן: UUID ישיר — הסורק (jsQR) מחפש UUID בסוף ה-path
  // /equipment/:id מאפשר navigation ישיר גם אם נסרק דרך דפדפן
  const appUrl = window.location.origin;
  const deepLink = `${appUrl}/equipment/${equipmentId}`;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCodeLib.toCanvas(canvasRef.current, deepLink, {
      width: size,
      margin: 2,
      color: { dark: "#000000", light: "#ffffff" },
    }).catch((err) => console.error("[VetTrack] QR generation failed:", err));
  }, [deepLink, size]);

  return (
    <div className="flex flex-col items-center gap-2">
      <canvas ref={canvasRef} className="rounded-lg" />
      <p className="text-xs text-muted-foreground text-center break-all max-w-[200px]">
        {deepLink}
      </p>
    </div>
  );
}
