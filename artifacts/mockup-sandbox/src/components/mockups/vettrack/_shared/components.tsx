import { QrCode, AlertTriangle } from "lucide-react";

export type Status = "available" | "in_use" | "cleaning" | "missing";

export const STATUS_MAP: Record<Status, { label: string; bg: string; dot: string }> = {
  available: { label: "Available", bg: "bg-green-100 text-green-800",  dot: "bg-green-500"  },
  in_use:    { label: "In Use",    bg: "bg-orange-100 text-orange-800", dot: "bg-orange-500" },
  cleaning:  { label: "Cleaning",  bg: "bg-blue-100 text-blue-800",    dot: "bg-blue-500"   },
  missing:   { label: "Missing",   bg: "bg-red-100 text-red-800",      dot: "bg-red-600"    },
};

export function Header({
  title,
  subtitle,
  leftAction,
}: {
  title: string;
  subtitle?: string;
  leftAction?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
      {leftAction}
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold tracking-widest uppercase text-teal-600">VetTrack</div>
        <div className="text-[18px] font-bold text-gray-900 leading-tight truncate">{title}</div>
        {subtitle && <div className="text-[12px] text-gray-500 mt-2">{subtitle}</div>}
      </div>
    </div>
  );
}

export function StatusTag({ status }: { status: Status }) {
  const s = STATUS_MAP[status];
  return (
    <span className={`inline-flex items-center gap-2 px-2 py-2 rounded-full text-[11px] font-semibold ${s.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

export function EquipmentCard({
  name,
  id,
  location,
  status,
  onClick,
}: {
  name: string;
  id: string;
  location: string;
  status: Status;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between px-4 py-4 bg-white border-b border-gray-100 active:bg-gray-50 text-left"
    >
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-[15px] font-semibold text-gray-900 truncate">{name}</div>
        <div className="text-[12px] text-gray-500 mt-2">
          <span>{id}</span>
          <span className="mx-2 text-gray-300">·</span>
          <span>{location}</span>
        </div>
      </div>
      <StatusTag status={status} />
    </button>
  );
}

export function Button({
  label,
  variant = "primary",
  onClick,
  icon,
}: {
  label: string;
  variant?: "primary" | "secondary";
  onClick?: () => void;
  icon?: React.ReactNode;
}) {
  const base =
    "w-full flex items-center justify-center gap-2 py-4 rounded-xl text-[15px] font-semibold transition-colors";
  const styles = {
    primary:   `${base} bg-teal-600 text-white active:bg-teal-700`,
    secondary: `${base} bg-gray-100 text-gray-800 active:bg-gray-200`,
  };
  return (
    <button className={styles[variant]} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

export function AlertItem({
  title,
  description,
  time,
}: {
  title: string;
  description: string;
  time: string;
}) {
  return (
    <div className="flex gap-4 px-4 py-4 border-b border-red-100 bg-red-50">
      <div className="flex-shrink-0 text-red-600">
        <AlertTriangle size={18} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[14px] font-bold text-red-800">{title}</div>
        <div className="text-[12px] mt-2 text-red-700">{description}</div>
        <div className="text-[11px] text-gray-500 mt-2">{time}</div>
      </div>
    </div>
  );
}

export function ScanButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="fixed bottom-6 right-6 w-14 h-14 bg-teal-600 rounded-full flex items-center justify-center active:bg-teal-700 z-20"
    >
      <QrCode size={24} className="text-white" />
    </button>
  );
}

export const SAMPLE_EQUIPMENT = [
  { id: "VT-0041", name: "Vital Signs Monitor",  location: "ER Bay 1",      status: "in_use"    as Status },
  { id: "VT-0087", name: "Portable X-Ray Unit",  location: "Storage A",     status: "available" as Status },
  { id: "VT-0023", name: "Defibrillator AED",    location: "ICU",           status: "available" as Status },
  { id: "VT-0112", name: "Ventilator — Adult",   location: "OR 2",          status: "cleaning"  as Status },
  { id: "VT-0055", name: "Infusion Pump",         location: "Ward 3",        status: "in_use"    as Status },
  { id: "VT-0094", name: "Ultrasound Probe",      location: "Imaging",       status: "missing"   as Status },
  { id: "VT-0031", name: "ECG Machine",           location: "Cardio Lab",    status: "available" as Status },
  { id: "VT-0077", name: "Pulse Oximeter",        location: "ER Bay 2",      status: "in_use"    as Status },
  { id: "VT-0061", name: "Suction Unit",          location: "Storage B",     status: "available" as Status },
  { id: "VT-0108", name: "Autoclave",             location: "Sterilization", status: "cleaning"  as Status },
];
