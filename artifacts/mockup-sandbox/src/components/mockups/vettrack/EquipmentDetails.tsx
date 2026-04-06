import { ChevronLeft, User, MapPin, Clock, Tag, FileText, Wrench } from "lucide-react";
import {
  Header,
  StatusTag,
  Button,
  ScanButton,
  type Status,
} from "./_shared/components";

const ITEM = {
  id:          "VT-0041",
  name:        "Vital Signs Monitor",
  brand:       "Philips",
  model:       "IntelliVue MX550",
  serial:      "SN-2024-00391",
  location:    "ER Bay 1",
  status:      "in_use" as Status,
  assignedTo:  "Dr. Sarah Cohen",
  checkedOut:  "Today, 08:14 AM",
  lastSeen:    "5 minutes ago",
  nextService: "2026-08-01",
  notes:       "Calibrated March 2026. Battery at 87%.",
};

export function EquipmentDetails() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Header
        title={ITEM.name}
        leftAction={
          <button className="text-teal-600 flex-shrink-0">
            <ChevronLeft size={22} />
          </button>
        }
      />

      <div className="px-4 py-4 bg-white border-b border-gray-100 flex items-center justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium text-gray-600">{ITEM.brand} · {ITEM.model}</div>
          <div className="text-[12px] text-gray-400 mt-1">{ITEM.id} · {ITEM.serial}</div>
        </div>
        <StatusTag status={ITEM.status} />
      </div>

      <div className="flex-1 overflow-auto">
        <div className="px-4 pt-8 pb-3">
          <div className="text-[10px] font-semibold uppercase text-gray-500" style={{ letterSpacing: "0.12em" }}>Assignment</div>
        </div>
        <div className="bg-white">
          <div className="flex items-center gap-4 px-4 py-5 border-b border-gray-100">
            <User size={15} className="text-gray-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Assigned To</div>
              <div className="text-[14px] font-semibold text-gray-900 mt-1 truncate">{ITEM.assignedTo}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-5 border-b border-gray-100">
            <Clock size={15} className="text-gray-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Checked Out</div>
              <div className="text-[14px] font-semibold text-gray-900 mt-1 truncate">{ITEM.checkedOut}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-5 border-b border-gray-100">
            <MapPin size={15} className="text-gray-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Location</div>
              <div className="text-[14px] font-semibold text-gray-900 mt-1 truncate">{ITEM.location}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-5">
            <Tag size={15} className="text-gray-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Last Seen</div>
              <div className="text-[14px] font-semibold text-gray-900 mt-1 truncate">{ITEM.lastSeen}</div>
            </div>
          </div>
        </div>

        <div className="px-4 pt-8 pb-3">
          <div className="text-[10px] font-semibold uppercase text-gray-500" style={{ letterSpacing: "0.12em" }}>Service</div>
        </div>
        <div className="bg-white">
          <div className="flex items-center gap-4 px-4 py-5 border-b border-gray-100">
            <Wrench size={15} className="text-gray-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Next Service</div>
              <div className="text-[14px] font-semibold text-gray-900 mt-1 truncate">{ITEM.nextService}</div>
            </div>
          </div>
          <div className="flex items-center gap-4 px-4 py-5">
            <FileText size={15} className="text-gray-300 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Notes</div>
              <div className="text-[14px] font-semibold text-gray-900 mt-1 truncate">{ITEM.notes}</div>
            </div>
          </div>
        </div>

        <div className="px-4 pt-8 pb-8 flex flex-col gap-3">
          <Button label="Return Equipment"   variant="primary"   />
          <Button label="Report Issue"       variant="secondary" />
          <Button label="Transfer Ownership" variant="secondary" />
        </div>
      </div>

      <ScanButton />
    </div>
  );
}
