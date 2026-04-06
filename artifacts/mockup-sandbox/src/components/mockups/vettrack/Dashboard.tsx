import { useState } from "react";
import { Search } from "lucide-react";
import {
  Header,
  EquipmentCard,
  ScanButton,
} from "./_shared/components";
import { SAMPLE_EQUIPMENT } from "./_shared/mockData";

export function Dashboard() {
  const [query, setQuery] = useState("");

  const filtered = SAMPLE_EQUIPMENT.filter(
    (e) =>
      e.name.toLowerCase().includes(query.toLowerCase()) ||
      e.id.toLowerCase().includes(query.toLowerCase()) ||
      e.location.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-white flex flex-col relative" style={{ fontFamily: "'Inter', system-ui, sans-serif" }}>
      <Header title="Equipment" subtitle="Veterinary Hospital" />

      <div className="px-4 py-4 border-b border-gray-100">
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

      <div className="flex-1">
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
