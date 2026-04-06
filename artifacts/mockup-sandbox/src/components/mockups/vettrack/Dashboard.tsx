import { useState } from "react";
import {
  Header,
  EquipmentCard,
  SearchBar,
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
    (acc, e) => {
      acc[e.status] = (acc[e.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<Status, number>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Header title="Equipment" subtitle="Veterinary Hospital" />

      <div className="flex gap-0 border-b border-gray-100 bg-white">
        {(["available", "in_use", "cleaning", "missing"] as Status[]).map((s) => (
          <div key={s} className="flex-1 flex flex-col items-center py-3 border-r last:border-r-0 border-gray-100">
            <div className="text-[20px] font-bold text-gray-900">{counts[s] ?? 0}</div>
            <div className={`w-2 h-2 rounded-full mt-1 ${STATUS_MAP[s].dot}`} />
            <div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-wide">{STATUS_MAP[s].label}</div>
          </div>
        ))}
      </div>

      <SearchBar placeholder="Search equipment..." onChange={setQuery} />

      <div className="flex-1 bg-white">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
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
