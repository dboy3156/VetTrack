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

export function ConflictModal({ queryClient }: { queryClient: QueryClient }) {
  const conflicts = useConflicts();
  if (conflicts.length === 0) return null;

  return (
    <div className="conflict-modal">
      <h2>{t.conflictModal.title}</h2>
      <p>{t.conflictModal.description}</p>
      {conflicts.map((c) => (
        <div key={c.id} className="conflict-item">
          <p><strong>{t.conflictModal.serverVersion}</strong></p>
          <pre>{JSON.stringify(c.serverData, null, 2)}</pre>
          <p><strong>{t.conflictModal.yourVersion}</strong></p>
          <pre>{JSON.stringify(c.localData, null, 2)}</pre>
          <button
            onClick={() => resolveConflict(c, "overwrite", queryClient)}
          >
            {t.conflictModal.keepMine}
          </button>
          <button
            onClick={() => resolveConflict(c, "discard", queryClient)}
          >
            {t.conflictModal.useServerVersion}
          </button>
        </div>
      ))}
    </div>
  );
}
