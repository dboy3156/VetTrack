import { QrCode, X, Zap } from "lucide-react";

const Corner = ({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) => {
  const borders = {
    tl: "border-t-4 border-l-4 top-0 left-0",
    tr: "border-t-4 border-r-4 top-0 right-0",
    bl: "border-b-4 border-l-4 bottom-0 left-0",
    br: "border-b-4 border-r-4 bottom-0 right-0",
  };
  return (
    <div className={`absolute w-8 h-8 border-teal-400 ${borders[pos]}`} />
  );
};

export function QRScanner() {
  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ backgroundColor: "#000", fontFamily: "'Inter', system-ui, sans-serif" }}
    >
      <div className="flex items-center justify-between px-4 pt-14 pb-4">
        <div>
          <div className="text-[11px] font-semibold tracking-widest uppercase text-teal-400">VetTrack</div>
          <div className="text-[18px] font-bold text-white leading-tight">Scan Equipment</div>
        </div>
        <button className="w-9 h-9 rounded-full flex items-center justify-center bg-white/10">
          <X size={18} className="text-white" />
        </button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="relative w-64 h-64">
          <div className="absolute inset-0 rounded-2xl" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }} />
          <Corner pos="tl" />
          <Corner pos="tr" />
          <Corner pos="bl" />
          <Corner pos="br" />
          <div className="absolute inset-0 flex items-center justify-center">
            <QrCode size={64} className="text-white/20" />
          </div>
          <div
            className="absolute left-4 right-4"
            style={{
              top: "40%",
              height: "2px",
              background: "linear-gradient(to right, transparent, #14b8a6, transparent)",
            }}
          />
        </div>

        <div className="mt-8 text-center">
          <div className="text-[15px] text-white font-medium">Point camera at QR code</div>
          <div className="text-[12px] text-white/40 mt-2">Equipment ID is printed on the label</div>
        </div>

        <button className="mt-8 flex items-center gap-2 px-6 py-3 rounded-full bg-white/10 text-white text-[13px] font-medium">
          <Zap size={14} className="text-teal-400" />
          Enter ID manually
        </button>
      </div>

      <div className="px-4 pb-10 pt-4 text-center">
        <div className="text-[11px] text-white/30 uppercase tracking-widest">Auto-detects on scan</div>
      </div>

      <button className="fixed bottom-6 right-6 w-14 h-14 bg-teal-600 rounded-full flex items-center justify-center shadow-lg z-20">
        <QrCode size={24} className="text-white" />
      </button>
    </div>
  );
}
