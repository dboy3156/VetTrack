import { useSearch } from "wouter";

// ─── Brand tokens ─────────────────────────────────────────────────────────────
const NAVY   = "#0A1E3D";
const NAVY2  = "#0F2A52";
const TEAL   = "#0D9488";
const TEAL_L = "#14B8A8";
const TEAL_G = "#CCFBF1";
const WHITE  = "#FFFFFF";
const SLATE  = "#94A3B8";
const TEXT   = "#E2E8F0";

// Avatar palette
const AVATAR_COLORS: Record<string, string> = {
  Sigal: "#7C3AED",
  Dan:   "#1D4ED8",
  Dana:  "#0891B2",
  Gal:   "#059669",
  Lihi:  "#DB2777",
  Aseel: "#D97706",
  Ofir:  "#DC2626",
  Guy:   "#334155",
};

function initials(name: string) {
  return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
}

// ─── Shared primitives ─────────────────────────────────────────────────────────
const badge = (text: string, bg: string, color: string) => (
  <span style={{
    display: "inline-flex", alignItems: "center", padding: "3px 10px",
    borderRadius: 20, fontSize: 12, fontWeight: 700,
    background: bg, color,
  }}>{text}</span>
);

function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const bg = AVATAR_COLORS[name] ?? "#334155";
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", background: bg,
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.33, fontWeight: 700, color: WHITE, flexShrink: 0,
    }}>
      {initials(name)}
    </div>
  );
}

// ─── Scene wrapper ─────────────────────────────────────────────────────────────
function Scene({ children, label, subtitle, scene }: {
  children: React.ReactNode;
  label: string;
  subtitle: string;
  scene: number;
}) {
  return (
    <div
      id={`scene${scene}`}
      style={{
        minHeight: "100vh", background: NAVY,
        display: "flex", flexDirection: "column",
        fontFamily: "'DM Sans', 'Inter', system-ui, sans-serif",
        padding: "0 0 48px 0",
      }}
    >
      {/* Scene header bar */}
      <div style={{
        background: NAVY2, borderBottom: `1px solid rgba(255,255,255,0.08)`,
        padding: "14px 32px", display: "flex", alignItems: "center",
        justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10,
            background: `linear-gradient(135deg, ${TEAL_L}, ${TEAL})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16,
          }}>🐾</div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14, color: WHITE, letterSpacing: "-0.02em" }}>
              VetTrack
            </div>
            <div style={{ fontSize: 9, color: TEAL_L, letterSpacing: "0.12em", fontWeight: 500 }}>
              EQUIPMENT SYSTEM
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%", background: TEAL,
            animation: "pulse 1.5s infinite",
          }} />
          <span style={{ fontSize: 11, color: TEAL_L, fontWeight: 600 }}>LIVE</span>
        </div>
      </div>

      {/* Scene label */}
      <div style={{ padding: "28px 32px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{
            background: TEAL, color: WHITE, fontSize: 10, fontWeight: 800,
            padding: "3px 10px", borderRadius: 6, letterSpacing: "0.08em",
          }}>
            SCENE {scene}
          </span>
        </div>
        <h2 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: WHITE, lineHeight: 1.2 }}>
          {label}
        </h2>
        <p style={{ margin: "4px 0 0", fontSize: 14, color: SLATE }}>{subtitle}</p>
      </div>

      {/* Content */}
      <div style={{ padding: "24px 32px 0", flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 1 — CHAOS
// ══════════════════════════════════════════════════════════════════════════════
const CHAOS_ITEMS = [
  { id: "IP-01", name: "Infusion Pump",   tag: "IP-01", status: "stale",    note: null,                                                     by: null },
  { id: "IP-02", name: "Infusion Pump",   tag: "IP-02", status: "stale",    note: null,                                                     by: null },
  { id: "IP-03", name: "Infusion Pump",   tag: "IP-03", status: "stale",    note: null,                                                     by: null },
  { id: "IP-04", name: "Infusion Pump",   tag: "IP-04", status: "unverified", note: "Last seen in Exam Room 2 — Needs verification",         by: "Ofir" },
];

function Scene1Chaos() {
  const staleCount = CHAOS_ITEMS.filter(i => i.status === "stale").length;
  const unverCount = CHAOS_ITEMS.filter(i => i.status === "unverified").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ICU Room Radar tile — dominant RED */}
      <div style={{
        background: "#1a0505", border: "2.5px solid #DC2626",
        borderRadius: 20, padding: "24px 28px",
        boxShadow: "0 0 32px rgba(220,38,38,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏥</div>
            <div style={{ fontSize: 13, color: "#FCA5A5", fontWeight: 600, marginBottom: 4 }}>ICU</div>
            <div style={{ fontSize: 56, fontWeight: 900, color: "#EF4444", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {CHAOS_ITEMS.length}
            </div>
            <div style={{ fontSize: 12, color: "#FCA5A5", marginTop: 4 }}>assets in room</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
            {/* Main alert badge */}
            <div style={{
              background: "#DC2626", color: WHITE,
              padding: "8px 16px", borderRadius: 12,
              fontSize: 14, fontWeight: 800,
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 0 20px rgba(220,38,38,0.5)",
            }}>
              <span style={{ fontSize: 16 }}>⚠️</span>
              4 Assets Unverified
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
              <span style={{
                background: "#7F1D1D", color: "#FCA5A5",
                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              }}>{staleCount} stale</span>
              <span style={{
                background: "#991B1B", color: "#FECACA",
                padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              }}>{unverCount} unverified</span>
            </div>
          </div>
        </div>
      </div>

      {/* Asset list */}
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.08)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)",
          background: "rgba(255,255,255,0.03)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>ICU Equipment</span>
          <span style={{ fontSize: 11, color: SLATE }}>
            Last verified: <span style={{ color: "#EF4444" }}>14h ago</span>
          </span>
        </div>

        {CHAOS_ITEMS.map((item, i) => {
          const isUnverified = item.status === "unverified";
          return (
            <div key={item.id} style={{
              display: "flex", alignItems: "flex-start", gap: 14,
              padding: "14px 20px",
              borderBottom: i < CHAOS_ITEMS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
              background: isUnverified ? "rgba(220,38,38,0.08)" : "transparent",
            }}>
              {/* Status indicator */}
              <div style={{
                width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                background: isUnverified ? "rgba(220,38,38,0.2)" : "rgba(100,116,139,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: isUnverified ? "1px solid rgba(220,38,38,0.4)" : "1px solid rgba(255,255,255,0.06)",
                fontSize: 16,
              }}>
                {isUnverified ? "❓" : "⏱️"}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: WHITE }}>{item.name}</span>
                  <span style={{
                    fontSize: 10, color: SLATE,
                    fontFamily: "DM Mono, monospace", letterSpacing: "0.02em",
                  }}>{item.tag}</span>
                  {isUnverified
                    ? badge("Unverified", "#7F1D1D", "#FCA5A5")
                    : badge("Stale", "#1E293B", "#94A3B8")
                  }
                </div>
                {item.note && (
                  <p style={{
                    margin: "5px 0 0", fontSize: 12, color: "#FCA5A5",
                    lineHeight: 1.4,
                  }}>
                    📍 {item.note}
                  </p>
                )}
                {item.by && (
                  <p style={{ margin: "3px 0 0", fontSize: 11, color: SLATE }}>
                    Reported by <strong style={{ color: TEXT }}>{item.by}</strong>
                  </p>
                )}
              </div>

              {!isUnverified && (
                <span style={{ fontSize: 11, color: "#64748B", whiteSpace: "nowrap", flexShrink: 0 }}>
                  {(i + 1) * 3 + 1}h ago
                </span>
              )}
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: "#475569", textAlign: "center", margin: 0 }}>
        🔴 Staff spending 20–30 min per shift searching for unverified equipment
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 2 — CONTROL
// ══════════════════════════════════════════════════════════════════════════════
const CONTROL_ITEMS = [
  { id: "IP-01", name: "Infusion Pump", tag: "IP-01" },
  { id: "IP-02", name: "Infusion Pump", tag: "IP-02" },
  { id: "IP-03", name: "Infusion Pump", tag: "IP-03" },
  { id: "IP-04", name: "Infusion Pump", tag: "IP-04" },
  { id: "IP-05", name: "Infusion Pump", tag: "IP-05" },
];

function Scene2Control() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* ICU Room Radar — dominant GREEN */}
      <div style={{
        background: "#011a0e", border: "2.5px solid #16A34A",
        borderRadius: 20, padding: "24px 28px",
        boxShadow: "0 0 32px rgba(22,163,74,0.35)",
      }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🏥</div>
            <div style={{ fontSize: 13, color: "#86EFAC", fontWeight: 600, marginBottom: 4 }}>ICU</div>
            <div style={{ fontSize: 56, fontWeight: 900, color: "#22C55E", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              5
            </div>
            <div style={{ fontSize: 12, color: "#86EFAC", marginTop: 4 }}>assets in room</div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" }}>
            {/* Main verified badge */}
            <div style={{
              background: "#16A34A", color: WHITE,
              padding: "10px 18px", borderRadius: 14,
              fontSize: 15, fontWeight: 800,
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: "0 0 24px rgba(22,163,74,0.55)",
              lineHeight: 1.3,
            }}>
              <span style={{ fontSize: 18 }}>✅</span>
              <span>ICU Verified<br /><span style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>(5/5 Assets OK)</span></span>
            </div>

            {/* Last scan */}
            <div style={{
              background: "rgba(22,163,74,0.15)", border: "1px solid rgba(22,163,74,0.3)",
              borderRadius: 10, padding: "6px 14px",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <div style={{
                width: 7, height: 7, borderRadius: "50%", background: "#22C55E",
              }} />
              <span style={{ fontSize: 12, color: "#86EFAC", fontWeight: 600 }}>
                Last Scan: <strong style={{ color: WHITE }}>Just Now</strong>
              </span>
            </div>

            {/* NFC button with teal glow */}
            <button style={{
              background: `linear-gradient(135deg, ${TEAL_L}, ${TEAL})`,
              border: "none", borderRadius: 12, padding: "10px 20px",
              color: WHITE, fontSize: 13, fontWeight: 700, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 8,
              boxShadow: `0 0 0 3px rgba(20,184,166,0.25), 0 0 24px rgba(13,148,136,0.6)`,
            }}>
              <span style={{ fontSize: 16 }}>📲</span>
              Scan NFC
            </button>
          </div>
        </div>
      </div>

      {/* Verified asset list */}
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 16,
        border: "1px solid rgba(22,163,74,0.2)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 20px", borderBottom: "1px solid rgba(22,163,74,0.1)",
          background: "rgba(22,163,74,0.06)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: TEXT }}>ICU Equipment — All Clear</span>
          <span style={{ fontSize: 11, color: "#86EFAC", fontWeight: 600 }}>✓ 5/5 verified</span>
        </div>

        {CONTROL_ITEMS.map((item, i) => (
          <div key={item.id} style={{
            display: "flex", alignItems: "center", gap: 14,
            padding: "12px 20px",
            borderBottom: i < CONTROL_ITEMS.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: "rgba(22,163,74,0.15)",
              display: "flex", alignItems: "center", justifyContent: "center",
              border: "1px solid rgba(22,163,74,0.3)",
              fontSize: 15,
            }}>✓</div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: WHITE }}>{item.name}</span>
                <span style={{ fontSize: 10, color: SLATE, fontFamily: "DM Mono, monospace" }}>{item.tag}</span>
              </div>
            </div>

            <span style={{
              background: "rgba(22,163,74,0.12)", color: "#86EFAC",
              padding: "2px 9px", borderRadius: 20, fontSize: 11, fontWeight: 700,
              border: "1px solid rgba(22,163,74,0.25)",
            }}>OK</span>
          </div>
        ))}
      </div>

      <p style={{ fontSize: 12, color: "#475569", textAlign: "center", margin: 0 }}>
        🟢 Full ICU inventory confirmed in &lt;10 seconds via NFC tap
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 3 — OWNERSHIP / AUDIT LOG
// ══════════════════════════════════════════════════════════════════════════════
const AUDIT_ENTRIES = [
  {
    actor: "Sigal",
    role: "Chief Tech",
    action: "verify",
    description: "verified ICU inventory via NFC",
    asset: "ICU (5 assets)",
    time: "5 min ago",
    severity: "info",
  },
  {
    actor: "Dan",
    role: "System Owner",
    action: "maintenance",
    description: "updated maintenance schedule for Mindray Monitor",
    asset: "MM-01 · Mindray Monitor",
    time: "20 min ago",
    severity: "info",
  },
  {
    actor: "Dana",
    role: "Chief Vet",
    action: "view",
    description: "reviewed asset status report",
    asset: "All rooms",
    time: "1 hour ago",
    severity: "info",
  },
  {
    actor: "Gal",
    role: "Doctor",
    action: "checkin",
    description: "checked in BP Monitor IP-04 to ICU",
    asset: "BP-01 · ICU",
    time: "2 hours ago",
    severity: "warning",
  },
  {
    actor: "Lihi",
    role: "Tech",
    action: "issue",
    description: "marked Clipper in Exam 1 as 'Issue' — Blade Dull",
    asset: "CL-01 · Exam Room 1",
    time: "4 hours ago",
    severity: "critical",
  },
];

const ACTION_ICONS: Record<string, string> = {
  verify:      "✅",
  maintenance: "🔧",
  view:        "👁",
  checkin:     "📥",
  issue:       "⚠️",
};

const SEV_COLORS: Record<string, { bg: string; border: string }> = {
  info:     { bg: "rgba(255,255,255,0.02)", border: "rgba(255,255,255,0.06)" },
  warning:  { bg: "rgba(251,191,36,0.05)", border: "rgba(251,191,36,0.2)" },
  critical: { bg: "rgba(239,68,68,0.06)",  border: "rgba(239,68,68,0.2)" },
};

function Scene3Ownership() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Header card */}
      <div style={{
        background: "rgba(13,148,136,0.08)", border: "1px solid rgba(13,148,136,0.25)",
        borderRadius: 14, padding: "14px 20px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div>
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: WHITE }}>Audit Log</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: SLATE }}>Last 8 staff actions · today</p>
        </div>
        <div style={{ textAlign: "right" }}>
          <p style={{ margin: 0, fontSize: 24, fontWeight: 800, color: TEAL_L }}>8</p>
          <p style={{ margin: "1px 0 0", fontSize: 10, color: SLATE }}>staff active today</p>
        </div>
      </div>

      {/* Entries */}
      <div style={{
        background: "rgba(255,255,255,0.03)", borderRadius: 16,
        border: "1px solid rgba(255,255,255,0.07)", overflow: "hidden",
      }}>
        {AUDIT_ENTRIES.map((entry, i) => {
          const sev = SEV_COLORS[entry.severity] ?? SEV_COLORS.info;
          return (
            <div key={i} style={{
              display: "flex", alignItems: "flex-start", gap: 12,
              padding: "14px 20px",
              borderBottom: i < AUDIT_ENTRIES.length - 1 ? `1px solid ${sev.border}` : "none",
              background: sev.bg,
            }}>
              <Avatar name={entry.actor} size={36} />

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 15 }}>{ACTION_ICONS[entry.action] ?? "📋"}</span>
                  <strong style={{ fontSize: 13, color: AVATAR_COLORS[entry.actor] ?? TEXT }}>
                    {entry.actor}
                  </strong>
                  <span style={{
                    fontSize: 10, color: SLATE,
                    background: "rgba(255,255,255,0.06)", padding: "1px 7px",
                    borderRadius: 10, fontWeight: 500,
                  }}>
                    {entry.role}
                  </span>
                </div>
                <p style={{ margin: "4px 0 2px", fontSize: 12, color: TEXT, lineHeight: 1.4 }}>
                  {entry.description}
                </p>
                {entry.asset && (
                  <p style={{ margin: 0, fontSize: 11, color: SLATE }}>
                    📦 {entry.asset}
                  </p>
                )}
              </div>

              <span style={{
                fontSize: 11, color: SLATE, whiteSpace: "nowrap",
                flexShrink: 0, fontFamily: "DM Mono, monospace",
              }}>
                {entry.time}
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ fontSize: 12, color: "#475569", textAlign: "center", margin: 0 }}>
        🔍 Every action attributed — full accountability across all staff
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE 4 — SCALING / EQUIPMENT DETAIL
// ══════════════════════════════════════════════════════════════════════════════
function Scene4Scaling() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* Equipment card */}
      <div style={{
        background: "rgba(255,255,255,0.04)", borderRadius: 20,
        border: "1px solid rgba(255,255,255,0.1)", overflow: "hidden",
      }}>
        {/* Card header */}
        <div style={{
          padding: "20px 24px",
          background: "rgba(13,148,136,0.07)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          display: "flex", alignItems: "flex-start", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: 11, color: TEAL_L, fontWeight: 600, fontFamily: "DM Mono, monospace", letterSpacing: "0.04em" }}>
              MM-01
            </div>
            <h3 style={{ margin: "4px 0 0", fontSize: 22, fontWeight: 800, color: WHITE }}>
              Mindray Monitor
            </h3>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: SLATE }}>ICU · Patient monitoring</p>
          </div>
          <span style={{
            background: "rgba(13,148,136,0.15)", color: TEAL_L,
            border: "1.5px solid rgba(13,148,136,0.35)",
            padding: "5px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            flexShrink: 0,
          }}>
            ✓ OK
          </span>
        </div>

        {/* Fields grid */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
        }}>
          {[
            { label: "Room",        value: "ICU",                icon: "🏥" },
            { label: "Last Scan",   value: "4 hours ago",        icon: "🔍" },
            { label: "Manufacturer", value: "Mindray",           icon: "🏭" },
            { label: "Serial No.",  value: "MDR-2023-0741",      icon: "🔖" },
            { label: "Assigned To", value: "Sigal (Chief Tech)", icon: "👤" },
            { label: "Location",    value: "ICU — Bay 3",        icon: "📍" },
          ].map((f, i) => (
            <div key={i} style={{
              padding: "14px 24px",
              borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.05)" : "none",
              borderRight: i % 2 === 0 ? "1px solid rgba(255,255,255,0.05)" : "none",
            }}>
              <p style={{ margin: 0, fontSize: 10, color: SLATE, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {f.label}
              </p>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: TEXT, fontWeight: 500 }}>
                {f.icon} {f.value}
              </p>
            </div>
          ))}
        </div>

        {/* Maintenance highlight — the key field for Scene 4 */}
        <div style={{
          margin: "0 20px 20px",
          background: "rgba(251,191,36,0.08)",
          border: "2px solid rgba(251,191,36,0.4)",
          borderRadius: 14, padding: "16px 20px",
          marginTop: 16,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <p style={{ margin: 0, fontSize: 10, color: "#FDE68A", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                🔧 Next Scheduled Maintenance
              </p>
              <p style={{ margin: "6px 0 0", fontSize: 28, fontWeight: 800, color: "#FCD34D", letterSpacing: "-0.02em" }}>
                Apr 25, 2026
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              <span style={{
                background: "rgba(251,191,36,0.15)", color: "#FCD34D",
                border: "1px solid rgba(251,191,36,0.3)",
                padding: "4px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700,
              }}>
                16 days away
              </span>
              <p style={{ margin: "6px 0 0", fontSize: 11, color: "#92400E" }}>
                Biomedical team notified
              </p>
            </div>
          </div>
        </div>

        {/* Note */}
        <div style={{
          margin: "0 20px 20px",
          background: "rgba(251,191,36,0.05)",
          border: "1px solid rgba(251,191,36,0.15)",
          borderRadius: 10, padding: "12px 16px",
        }}>
          <p style={{ margin: 0, fontSize: 10, color: "#FDE68A", fontWeight: 700, letterSpacing: "0.06em" }}>
            MAINTENANCE NOTE
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#FCD34D", lineHeight: 1.5 }}>
            Scheduled preventive maintenance — biomedical team notified. Unit is operational until maintenance window.
          </p>
        </div>
      </div>

      <p style={{ fontSize: 12, color: "#475569", textAlign: "center", margin: 0 }}>
        📅 Proactive maintenance tracking — no surprise failures, full ownership
      </p>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SCENE NAV BAR (shown when all scenes visible)
// ══════════════════════════════════════════════════════════════════════════════
function SceneNav({ active }: { active: number | null }) {
  const scenes = [
    { n: 1, label: "Chaos",     anchor: "#scene1" },
    { n: 2, label: "Control",   anchor: "#scene2" },
    { n: 3, label: "Ownership", anchor: "#scene3" },
    { n: 4, label: "Scaling",   anchor: "#scene4" },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: 0, right: 0, zIndex: 100,
      background: "rgba(10,30,61,0.95)", backdropFilter: "blur(12px)",
      borderTop: "1px solid rgba(255,255,255,0.08)",
      padding: "12px 24px",
      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
    }}>
      <span style={{ fontSize: 11, color: SLATE, marginRight: 8, fontWeight: 600 }}>
        JUMP TO SCENE:
      </span>
      {scenes.map(s => (
        <a
          key={s.n}
          href={s.anchor}
          style={{
            padding: "6px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700,
            textDecoration: "none",
            background: active === s.n ? TEAL : "rgba(255,255,255,0.07)",
            color: active === s.n ? WHITE : SLATE,
            border: active === s.n
              ? `1px solid ${TEAL}`
              : "1px solid rgba(255,255,255,0.1)",
            transition: "all 0.15s",
          }}
        >
          {s.n} · {s.label}
        </a>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ══════════════════════════════════════════════════════════════════════════════
export default function PitchDeckPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const sceneParam = parseInt(params.get("s") ?? "0", 10);

  const showScene = (n: number) => !sceneParam || sceneParam === n;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800;900&family=DM+Mono:wght@400;500&display=swap');
        html, body { margin: 0; padding: 0; background: ${NAVY}; scroll-behavior: smooth; }
        * { box-sizing: border-box; }
      `}</style>

      <div style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

        {showScene(1) && (
          <Scene
            scene={1}
            label="The Chaos State"
            subtitle="ICU Room · Before VetTrack · Staff searching for unverified equipment"
          >
            <Scene1Chaos />
          </Scene>
        )}

        {showScene(2) && (
          <Scene
            scene={2}
            label="The Control State"
            subtitle="ICU Room · After VetTrack · NFC scan confirms all 5 assets in under 10 seconds"
          >
            <Scene2Control />
          </Scene>
        )}

        {showScene(3) && (
          <Scene
            scene={3}
            label="Ownership & Accountability"
            subtitle="Audit Log · Every action attributed to a named staff member"
          >
            <Scene3Ownership />
          </Scene>
        )}

        {showScene(4) && (
          <Scene
            scene={4}
            label="Proactive Scaling"
            subtitle="Equipment Detail · Mindray Monitor · Maintenance visibility drives zero-surprise operations"
          >
            <Scene4Scaling />
          </Scene>
        )}

        {!sceneParam && <SceneNav active={null} />}
      </div>
    </>
  );
}
