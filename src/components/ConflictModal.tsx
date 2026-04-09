import type { QueryClient } from "@tanstack/react-query";
import { useConflicts, removeConflict, type ConflictItem } from "@/lib/conflict-store";
import { request } from "@/lib/api";

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
      <h2>Sync Conflicts</h2>
      <p>These items were changed on another device while you were offline.</p>
      {conflicts.map((c) => (
        <div key={c.id} className="conflict-item">
          <p><strong>Server version:</strong></p>
          <pre>{JSON.stringify(c.serverData, null, 2)}</pre>
          <p><strong>Your version:</strong></p>
          <pre>{JSON.stringify(c.localData, null, 2)}</pre>
          <button
            onClick={() => resolveConflict(c, "overwrite", queryClient)}
          >
            Keep Mine
          </button>
          <button
            onClick={() => resolveConflict(c, "discard", queryClient)}
          >
            Use Server Version
          </button>
        </div>
      ))}
    </div>
  );
}
