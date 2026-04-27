// src/pages/display.tsx
import { useEffect, useState } from "react";
import { useDisplaySnapshot } from "@/hooks/useDisplaySnapshot";
import type {
  DisplaySnapshot,
  DisplaySnapshotHospitalization,
  DisplaySnapshotEquipment,
  DisplaySnapshotTask,
  DisplaySnapshotCodeBlueSession,
  HospitalizationStatus,
} from "@/types";

// ── Status lookup tables ────────────────────────────────────────────────────

const STATUS_ORDER: Record<HospitalizationStatus, number> = {
  critical: 0,
  observation: 1,
  admitted: 2,
  recovering: 3,
  discharged: 4,
  deceased: 5,
};

const STATUS_LABELS_HE: Record<HospitalizationStatus, string> = {
  critical: "קריטי",
  observation: "תצפית",
  admitted: "מאושפז",
  recovering: "התאוששות",
  discharged: "שוחרר",
  deceased: "נפטר",
};

const STATUS_CARD: Record<HospitalizationStatus, string> = {
  critical: "bg-red-950/40 border-red-700/50",
  observation: "bg-amber-950/30 border-amber-700/40",
  admitted: "bg-indigo-950/30 border-indigo-600/30",
  recovering: "bg-green-950/20 border-green-700/30",
  discharged: "bg-white/5 border-white/10",
  deceased: "bg-white/5 border-white/10",
};

const STATUS_BAR: Record<HospitalizationStatus, string> = {
  critical: "bg-red-600",
  observation: "bg-amber-600",
  admitted: "bg-indigo-500",
  recovering: "bg-green-600",
  discharged: "bg-gray-600",
  deceased: "bg-gray-600",
};

const STATUS_BADGE: Record<HospitalizationStatus, string> = {
  critical: "bg-red-600 text-white",
  observation: "bg-amber-600 text-white",
  admitted: "bg-indigo-500 text-white",
  recovering: "bg-green-600 text-white",
  discharged: "bg-gray-600 text-white",
  deceased: "bg-gray-700 text-white",
};

const SHIFT_ROLE_LABELS: Record<string, string> = {
  admin: "מנהל",
  technician: "טכנאי",
  senior_technician: "טכנאי בכיר",
};

// ── AwarenessBar ─────────────────────────────────────────────────────────────

function AwarenessBar({ snapshot }: { snapshot: DisplaySnapshot }) {
  const now = new Date(snapshot.currentTime);
  const timeStr = now.toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const cart = snapshot.crashCartStatus;
  const cartAgeHours = cart
    ? Math.round((Date.now() - new Date(cart.lastCheckedAt).getTime()) / 3_600_000)
    : null;
  const cartOk = cart !== null && cartAgeHours !== null && cartAgeHours < 24;

  const firstOverdue = snapshot.hospitalizations.find((h) => h.overdueTaskCount > 0);
  const extraOverdue = snapshot.totalOverdueCount > 1 ? snapshot.totalOverdueCount - 1 : 0;

  return (
    <div className="flex items-center gap-4 px-4 py-2 bg-[#141922] border-b border-[#1e2740] text-sm flex-wrap">
      <span className="font-mono text-xl font-bold text-white tabular-nums min-w-[52px]">
        {timeStr}
      </span>
      <div className="w-px h-5 bg-[#2d3748] shrink-0" />

      <div className="flex gap-2 flex-wrap">
        {snapshot.currentShift.map((s) => (
          <div
            key={s.employeeName}
            className="flex items-center gap-1.5 bg-[#1e2740] border border-[#2d3d5c] rounded-full px-3 py-0.5 text-[11px] text-blue-300"
          >
            <span>{s.employeeName}</span>
            <span className="text-gray-500 text-[10px]">
              {SHIFT_ROLE_LABELS[s.role] ?? s.role}
            </span>
          </div>
        ))}
      </div>

      <div className="w-px h-5 bg-[#2d3748] shrink-0" />

      {cartOk ? (
        <span className="flex items-center gap-1 bg-green-900/30 border border-green-700/40 text-green-300 rounded px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">
          ✓ עגלה נבדקה · {cartAgeHours} שע׳
        </span>
      ) : (
        <span className="flex items-center gap-1 bg-amber-900/20 border border-amber-700/40 text-yellow-300 rounded px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">
          ⚠ עגלה לא נבדקה היום
        </span>
      )}

      {snapshot.activeAlertCount > 0 && (
        <span className="flex items-center gap-1 bg-amber-900/20 border border-amber-700/40 text-yellow-300 rounded px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap">
          ⚠ {snapshot.activeAlertCount} התראות
        </span>
      )}

      {snapshot.totalOverdueCount > 0 && firstOverdue && (
        <span className="flex items-center gap-1 bg-red-900/30 border border-red-600/60 text-red-300 rounded px-2.5 py-1 text-[11px] font-semibold animate-pulse whitespace-nowrap">
          💊 תרופה באיחור — {firstOverdue.animal.name}
          {extraOverdue > 0 && ` ועוד ${extraOverdue}`}
        </span>
      )}

      <span className="mr-auto flex items-center bg-white/5 border border-white/10 text-gray-400 rounded px-2.5 py-1 text-[11px] whitespace-nowrap">
        {snapshot.hospitalizations.length} מאושפזים
      </span>
    </div>
  );
}

// ── PatientCard ───────────────────────────────────────────────────────────────

function PatientCard({ hosp }: { hosp: DisplaySnapshotHospitalization }) {
  const { animal } = hosp;
  const statusKey = hosp.status as HospitalizationStatus;
  const meta = [animal.species, animal.breed, animal.weightKg ? `${animal.weightKg} ק״ג` : null]
    .filter(Boolean)
    .join(" · ");
  const location = [hosp.ward, hosp.bay ? `מיטה ${hosp.bay}` : null].filter(Boolean).join(" · ");

  return (
    <div className={`rounded-lg p-3 border ${STATUS_CARD[statusKey] ?? "bg-white/5 border-white/10"}`}>
      <div className={`h-0.5 rounded mb-3 ${STATUS_BAR[statusKey] ?? "bg-gray-600"}`} />
      <div className="flex flex-wrap gap-1 mb-2">
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_BADGE[statusKey] ?? "bg-gray-600 text-white"}`}>
          {STATUS_LABELS_HE[statusKey] ?? hosp.status}
        </span>
        {hosp.status === "critical" && (
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-950 border border-red-600 text-red-300">
            CPR Risk
          </span>
        )}
      </div>
      <div className="text-[15px] font-bold text-white mb-0.5">{animal.name}</div>
      {meta && <div className="text-[11px] text-gray-500 mb-2">{meta}</div>}
      {location && <div className="text-[11px] text-gray-400">{location}</div>}
      {hosp.admittingVetName && (
        <div className="text-[11px] text-gray-500 mt-0.5">{hosp.admittingVetName}</div>
      )}
      {hosp.overdueTaskCount > 0 && hosp.overdueTaskLabel && (
        <div className="overdue-alert mt-2 rounded px-2 py-1.5 text-[10px] font-semibold text-red-300 border border-red-600/60 bg-red-950/30 animate-pulse">
          💊 {hosp.overdueTaskLabel}
        </div>
      )}
    </div>
  );
}

// ── PatientGrid ───────────────────────────────────────────────────────────────

function PatientGrid({
  hospitalizations,
}: {
  hospitalizations: DisplaySnapshotHospitalization[];
}) {
  const sorted = [...hospitalizations].sort((a, b) => {
    const orderDiff =
      (STATUS_ORDER[a.status as HospitalizationStatus] ?? 99) -
      (STATUS_ORDER[b.status as HospitalizationStatus] ?? 99);
    if (orderDiff !== 0) return orderDiff;
    return new Date(a.admittedAt).getTime() - new Date(b.admittedAt).getTime();
  });

  return (
    <div className="p-4 flex-1">
      <div className="text-[11px] font-bold tracking-widest uppercase text-gray-600 mb-3">
        מטופלים מאושפזים
      </div>
      <div
        className="grid gap-2.5"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}
      >
        {sorted.map((h) => (
          <PatientCard key={h.id} hosp={h} />
        ))}
      </div>
    </div>
  );
}

// ── EquipmentPane ─────────────────────────────────────────────────────────────

const EQ_STATUS_LABELS: Record<string, string> = {
  ok: "פנוי",
  sterilized: "פנוי",
  issue: "תקלה",
  critical: "קריטי",
  needs_attention: "דורש טיפול",
  maintenance: "תחזוקה",
};

const EQ_STATUS_CLASSES: Record<string, string> = {
  ok: "bg-indigo-900/20 text-indigo-300",
  sterilized: "bg-indigo-900/20 text-indigo-300",
  issue: "bg-red-900/25 text-red-300",
  critical: "bg-red-900/25 text-red-300",
  needs_attention: "bg-amber-900/20 text-yellow-300",
  maintenance: "bg-red-900/25 text-red-300",
};

function EquipmentPane({ equipment }: { equipment: DisplaySnapshotEquipment[] }) {
  const sorted = [...equipment].sort((a, b) => {
    if (a.inUse !== b.inUse) return a.inUse ? -1 : 1;
    return a.name.localeCompare(b.name, "he");
  });

  return (
    <div className="p-4 border-b border-[#1f2937]">
      <div className="text-[11px] font-bold tracking-widest uppercase text-gray-600 mb-3">
        ציוד · מיקום ושימוש
      </div>
      <div>
        {sorted.map((eq) => (
          <div
            key={eq.id}
            className="flex items-start justify-between py-1.5 border-b border-[#1a1f2b] last:border-0"
          >
            <div className="min-w-0 ml-2">
              <div className="text-[12px] text-gray-300 truncate">{eq.name}</div>
              <div className="text-[10px] text-gray-500 truncate">
                {eq.location ?? "—"}
              </div>
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-0.5 rounded shrink-0 ${
                eq.inUse
                  ? "bg-green-900/30 text-green-300"
                  : (EQ_STATUS_CLASSES[eq.status] ?? "bg-white/5 text-gray-400")
              }`}
            >
              {eq.inUse ? "בשימוש" : (EQ_STATUS_LABELS[eq.status] ?? eq.status)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── UpcomingTasksPane ─────────────────────────────────────────────────────────

function UpcomingTasksPane({
  tasks,
  currentTime,
}: {
  tasks: DisplaySnapshotTask[];
  currentTime: string;
}) {
  const now = new Date(currentTime);
  const displayed = tasks.slice(0, 6);
  const overflow = tasks.length - displayed.length;

  return (
    <div className="p-4">
      <div className="text-[11px] font-bold tracking-widest uppercase text-gray-600 mb-3">
        פרוצדורות קרובות · 2 שע׳
      </div>
      <div>
        {displayed.map((task) => {
          const taskTime = new Date(task.startTime);
          const minutesUntil = Math.round((taskTime.getTime() - now.getTime()) / 60_000);
          const soon = minutesUntil <= 30;
          const timeLabel = taskTime.toLocaleTimeString("he-IL", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
          const isMed = task.taskType === "medication";
          return (
            <div
              key={task.id}
              className="flex items-center gap-2 py-1.5 border-b border-[#1a1f2b] last:border-0 text-[12px]"
            >
              <span
                className={`min-w-[38px] tabular-nums ${
                  soon ? "text-yellow-300 font-bold" : "text-gray-500"
                }`}
              >
                {timeLabel}
              </span>
              <span className="flex-1 text-gray-300 truncate">
                {task.notes ?? task.taskType ?? "משימה"} — {task.animalName}
              </span>
              <span
                className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 ${
                  isMed
                    ? "bg-violet-900/30 text-violet-300"
                    : "bg-sky-900/20 text-sky-300"
                }`}
              >
                {isMed ? "תרופה" : "פרוצדורה"}
              </span>
            </div>
          );
        })}
        {overflow > 0 && (
          <div className="text-[11px] text-gray-600 py-1">+{overflow} נוספים</div>
        )}
      </div>
    </div>
  );
}

// ── CodeBlueOverlay placeholder (filled in Task 9) ────────────────────────────

function CodeBlueOverlay(_props: {
  session: DisplaySnapshotCodeBlueSession;
  hospitalizations: DisplaySnapshotHospitalization[];
}) {
  return <div className="min-h-screen bg-[#0d0505]" />;
}

// ── WardDisplayPage ───────────────────────────────────────────────────────────

export default function WardDisplayPage() {
  const snapshot = useDisplaySnapshot();

  if (!snapshot) {
    return (
      <div className="min-h-screen bg-[#0d1117] flex items-center justify-center">
        <div className="text-gray-500 text-sm">טוען...</div>
      </div>
    );
  }

  if (snapshot.codeBlueSession) {
    return (
      <CodeBlueOverlay
        session={snapshot.codeBlueSession}
        hospitalizations={snapshot.hospitalizations}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0d1117] text-gray-200 flex flex-col" dir="rtl">
      <AwarenessBar snapshot={snapshot} />
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 overflow-auto">
          <PatientGrid hospitalizations={snapshot.hospitalizations} />
        </div>
        <div className="w-[420px] shrink-0 border-r border-[#1f2937] flex flex-col overflow-auto">
          <EquipmentPane equipment={snapshot.equipment} />
          <UpcomingTasksPane tasks={snapshot.upcomingTasks} currentTime={snapshot.currentTime} />
        </div>
      </div>
    </div>
  );
}
