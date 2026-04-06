import {
  Header,
  AlertItem,
  ScanButton,
} from "./_shared/components";

const ALERTS = [
  {
    id: 1,
    title:       "Equipment Missing",
    description: "Ultrasound Probe (VT-0094) not scanned for 48 hours",
    time:        "2 hours ago",
    severity:    "critical" as const,
  },
  {
    id: 2,
    title:       "Overdue Return",
    description: "Ventilator (VT-0112) checked out to OR 2 for 9 hours",
    time:        "4 hours ago",
    severity:    "critical" as const,
  },
  {
    id: 3,
    title:       "Service Due",
    description: "Defibrillator AED (VT-0023) — service overdue by 12 days",
    time:        "1 day ago",
    severity:    "warning" as const,
  },
  {
    id: 4,
    title:       "Unrecognised Scan",
    description: "QR code at ER Bay 3 matched no registered equipment",
    time:        "1 day ago",
    severity:    "warning" as const,
  },
  {
    id: 5,
    title:       "Checkout Without Return",
    description: "Infusion Pump (VT-0055) — previous return not logged",
    time:        "2 days ago",
    severity:    "warning" as const,
  },
  {
    id: 6,
    title:       "Equipment Missing",
    description: "Pulse Oximeter (VT-0078) missing from ICU for 6 hours",
    time:        "2 days ago",
    severity:    "critical" as const,
  },
];

export function Alerts() {
  const criticalCount = ALERTS.filter((a) => a.severity === "critical").length;
  const warningCount  = ALERTS.length - criticalCount;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Header
        title="Alerts"
        subtitle={`${criticalCount} critical · ${warningCount} warnings`}
      />

      <div className="flex bg-white border-b border-gray-100">
        <div className="flex-1 flex flex-col items-center py-4 border-r border-gray-100">
          <div className="text-[22px] font-bold text-red-600">{criticalCount}</div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mt-2">Critical</div>
        </div>
        <div className="flex-1 flex flex-col items-center py-4">
          <div className="text-[22px] font-bold text-orange-500">{warningCount}</div>
          <div className="text-[11px] text-gray-500 uppercase tracking-wide mt-2">Warnings</div>
        </div>
      </div>

      <div className="flex-1 bg-white">
        {ALERTS.map((alert) => (
          <AlertItem
            key={alert.id}
            title={alert.title}
            description={alert.description}
            time={alert.time}
            severity={alert.severity}
          />
        ))}
      </div>

      <ScanButton />
    </div>
  );
}
