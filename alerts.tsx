import { createContext, useContext, useState } from "react";

type UndoAction = () => void;

type UndoContextType = {
  undoState: UndoAction | null;
  setUndo: (action: UndoAction) => void;
  undo: () => void;
};

const UndoContext = createContext<UndoContextType | null>(null);

export function UndoProvider({ children }: { children: React.ReactNode }) {
  const [undoState, setUndoState] = useState<UndoAction | null>(null);

  const setUndo = (action: UndoAction) => {
    setUndoState(() => action);
  };

  const undo = () => {
    if (undoState) {
      undoState();
      setUndoState(null);
    }
  };

  return (
    <UndoContext.Provider value={{ undoState, setUndo, undo }}>
      {children}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  const ctx = useContext(UndoContext);

  // ✅ לא קורס גם אם אין provider
  if (!ctx) {
    return {
      undoState: null,
      setUndo: () => {},
      undo: () => {},
    };
  }

  return ctx;
}