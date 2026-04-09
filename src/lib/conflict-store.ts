import { useState, useEffect } from "react";

export type ConflictItem = {
  id: number;
  endpoint: string;
  method: string;
  serverData: unknown;
  localData: unknown;
};

let conflicts: ConflictItem[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function addConflict(item: ConflictItem) {
  conflicts = [...conflicts, item];
  notify();
}

export function removeConflict(id: number) {
  conflicts = conflicts.filter((c) => c.id !== id);
  notify();
}

export function useConflicts(): ConflictItem[] {
  const [state, setState] = useState<ConflictItem[]>(conflicts);
  useEffect(() => {
    const handler = () => setState([...conflicts]);
    listeners.add(handler);
    return () => { listeners.delete(handler); };
  }, []);
  return state;
}
