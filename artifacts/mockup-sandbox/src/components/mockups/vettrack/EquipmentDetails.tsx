import { ChevronLeft, User, MapPin, Clock, Tag, FileText, Wrench } from "lucide-react";
import {
  Header,
  StatusTag,
  AppButton,
  ScanButton,
  type Status,
} from "./_shared/components";

const ITEM = {
  id: "VT-0041",
  name: "Vital Signs Monitor",
  brand: "Philips",
  model: "IntelliVue MX550",
  serial: "SN-2024-00391",
  location: "ER Bay 1",
  status: "in_use" as Status,
  assignedTo: "Dr. Sarah Cohen",
  checkedOut: "Today, 08:14 AM",
  lastSeen: "5 minutes ago",
  nextService: "2026-08-01",
  notes: "Calibrated March 2026. Battery at 87%.",
};

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-4 px-4 py-4 border-b border-gray-100">
      <div className="text-gray-400 w-4 flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-[11px] text-gray-400 uppercase tracking-wide">{label}</div>
        <div className="text-[14px] font-medium text-gray-900 mt-0.5 truncate">{value}</div>
      </div>
    </div>
  );
}

function SectionLabel({ text }: { text: string }) {
  return (
    <div className="px-4 pt-6 pb-2">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">{text}</div>
    </div>
  );
}

export function EquipmentDetails() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div className="flex items-center gap-2 px-4 py-4 bg-white border-b border-gray-200 sticky top-0 z-10">
        <button className="text-teal-600">
          <ChevronLeft size={22} />
        </button>
        <div className="flex-1">
          <div className="text-[11px] font-semibold tracking-widest uppercase text-teal-600">VetTrack</div>
          <div className="text-[17px] font-bold text-gray-900 leading-tight truncate">{ITEM.name}</div>
        </div>
      </div>

      <div className="px-4 py-4 bg-white border-b border-gray-100 flex items-center justify-between">
        <div>
          <div className="text-[13px] text-gray-500">{ITEM.brand} · {ITEM.model}</div>
          <div className="text-[12px] text-gray-400 mt-0.5">{ITEM.id} · {ITEM.serial}</div>
        </div>
        <StatusTag status={ITEM.status} />
      </div>

      <div className="flex-1 overflow-auto">
        <SectionLabel text="Assignment" />
        <div className="bg-white">
          <InfoRow icon={<User size={14} />}    label="Assigned To"  value={ITEM.assignedTo} />
          <InfoRow icon={<Clock size={14} />}   label="Checked Out"  value={ITEM.checkedOut} />
          <InfoRow icon={<MapPin size={14} />}  label="Location"     value={ITEM.location} />
          <InfoRow icon={<Tag size={14} />}     label="Last Seen"    value={ITEM.lastSeen} />
        </div>

        <SectionLabel text="Service" />
        <div className="bg-white">
          <InfoRow icon={<Wrench size={14} />}     label="Next Service"  value={ITEM.nextService} />
          <InfoRow icon={<FileText size={14} />}   label="Notes"         value={ITEM.notes} />
        </div>

        <div className="px-4 pt-6 pb-4 flex flex-col gap-2">
          <AppButton
            label="Return Equipment"
            variant="primary"
          />
          <AppButton
            label="Report Issue"
            variant="secondary"
          />
          <AppButton
            label="Transfer Ownership"
            variant="secondary"
          />
        </div>
      </div>

      <ScanButton />
    </div>
  );
}
