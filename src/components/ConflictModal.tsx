import type { QueryClient } from "@tanstack/react-query";
import { useConflicts, removeConflict, type ConflictItem } from "@/lib/conflict-store";
import { request } from "@/lib/api";
import { t } from "@/lib/i18n";

async function resolveConflict(
  item: ConflictItem,
  resolution: "overwrite" | "discard",
  queryClient: QueryClient
) {
  if (resolution === "overwrite") {
    await request(item.endpoint, {
      method: item.method,
      body: JSON.stringify(item.localData),
      headers: { "X-Force-Overwrite": "true" },
    });
    queryClient.invalidateQueries({ queryKey: ["/api/equipment"] });
  }
  removeConflict(item.id);
}

type DiffRow = {
  key: string;
  local: unknown;
  server: unknown;
  changed: boolean;
};

function diffObjects(
  local: Record<string, unknown>,
  server: Record<string, unknown>
): DiffRow[] {
  const allKeys = new Set([...Object.keys(local), ...Object.keys(server)]);
  return Array.from(allKeys)
    .filter((key) => !["id", "clinicId", "createdAt"].includes(key))
    .map((key) => ({
      key,
      local: local[key],
      server: server[key],
      changed: JSON.stringify(local[key]) !== JSON.stringify(server[key]),
    }))
    .sort((a, b) => Number(b.changed) - Number(a.changed));
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return v || "—";
  return String(v);
}

function humanKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function ConflictDiff({
  local,
  server,
}: {
  local: Record<string, unknown>;
  server: Record<string, unknown>;
}) {
  const rows = diffObjects(local, server);
  const changed = rows.filter((r) => r.changed);
  const unchanged = rows.filter((r) => !r.changed);

  return (
    <div className="rounded-xl border border-border overflow-hidden text-sm">
      {changed.length > 0 && (
        <>
          <div className="grid grid-cols-3 bg-muted/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <span>Field</span>
            <span className="text-amber-700">Your version</span>
            <span className="text-blue-700">Server version</span>
          </div>
          {changed.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-3 gap-2 border-t border-border px-3 py-2 bg-amber-50/60"
            >
              <span className="font-medium text-foreground truncate">{humanKey(row.key)}</span>
              <span className="text-amber-800 truncate" title={formatValue(row.local)}>
                {formatValue(row.local)}
              </span>
              <span className="text-blue-800 truncate" title={formatValue(row.server)}>
                {formatValue(row.server)}
              </span>
            </div>
          ))}
        </>
      )}
      {unchanged.length > 0 && (
        <details className="border-t border-border">
          <summary className="cursor-pointer px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/40">
            {unchanged.length} unchanged field{unchanged.length !== 1 ? "s" : ""}
          </summary>
          {unchanged.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-3 gap-2 border-t border-border/50 px-3 py-1.5 text-muted-foreground"
            >
              <span className="truncate">{humanKey(row.key)}</span>
              <span className="col-span-2 truncate" title={formatValue(row.local)}>
                {formatValue(row.local)}
              </span>
            </div>
          ))}
        </details>
      )}
    </div>
  );
}

export function ConflictModal({ queryClient }: { queryClient: QueryClient }) {
  const conflicts = useConflicts();
  if (conflicts.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.conflictModal.title}
    >
      <div className="w-full max-w-lg bg-card rounded-2xl shadow-2xl border border-border overflow-hidden max-h-[90dvh] overflow-y-auto">
        <div className="px-5 pt-5 pb-3">
          <h2 className="text-lg font-bold text-foreground">{t.conflictModal.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t.conflictModal.description}</p>
        </div>

        <div className="flex flex-col gap-4 px-5 pb-5">
          {conflicts.map((c) => (
            <div key={c.id} className="flex flex-col gap-3">
              <ConflictDiff
                local={c.localData as Record<string, unknown>}
                server={c.serverData as Record<string, unknown>}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => resolveConflict(c, "overwrite", queryClient)}
                  className="flex-1 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-600 active:scale-95 transition-all"
                >
                  {t.conflictModal.keepMine}
                </button>
                <button
                  onClick={() => resolveConflict(c, "discard", queryClient)}
                  className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-foreground hover:bg-muted/50 active:scale-95 transition-all"
                >
                  {t.conflictModal.useServerVersion}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
