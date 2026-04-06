import { useState } from "react";
import { Search } from "lucide-react";
import {
  Header,
  EquipmentCard,
  ScanButton,
  SAMPLE_EQUIPMENT,
  STATUS_MAP,
  type Status,
} from "./_shared/components";

export function Dashboard() {
  const [query, setQuery] = useState("");

  const filtered = SAMPLE_EQUIPMENT.filter(
    (e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.id.toLowerCase().includes(query.toLowerCase()) ||
      e.location.toLowerCase().includes(query.toLowerCase())
  );

  const counts = SAMPLE_EQUIPMENT.reduce(
    (acc, e) => { acc[e.status] = (acc[e.status] ?? 0) + 1; return acc; },
    {} as Record<Status, number>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Header title="Equipment" subtitle="Veterinary Hospital" />

      <div className="flex bg-white border-b border-gray-100">
        {(["available", "in_use", "cleaning", "missing"] as Status[]).map((s) => (
          <div key={s} className="flex-1 flex flex-col items-center py-4 border-r last:border-r-0 border-gray-100">
            <div className="text-[20px] font-bold text-gray-900">{counts[s] ?? 0}</div>
            <span className={`w-2 h-2 rounded-full mt-2 ${STATUS_MAP[s].dot}`} />
            <div className="text-[10px] text-gray-500 mt-2 uppercase tracking-wide">{STATUS_MAP[s].label}</div>
          </div>
        ))}
      </div>

      <div className="px-4 py-2 bg-white border-b border-gray-100">
        <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-4 py-2">
          <Search size={16} className="text-gray-400 flex-shrink-0" />
          <input
            type="text"
            placeholder="Search equipment..."
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 bg-transparent text-[14px] text-gray-800 placeholder-gray-400 outline-none"
          />
        </div>
      </div>

      <div className="flex-1 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-400">
            <div className="text-[14px]">No equipment found</div>
          </div>
        ) : (
          filtered.map((item) => (
            <EquipmentCard
              key={item.id}
              name={item.name}
              id={item.id}
              location={item.location}
              status={item.status}
            />
          ))
        )}
      </div>

      <ScanButton />
    </div>
  );
}
