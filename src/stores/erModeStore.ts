import { create } from "zustand";

export type ErModeUiState = "enforced" | "none" | "loading";

interface ErModeStore {
  erModeState: ErModeUiState;
  setErModeState: (s: ErModeUiState) => void;
}

export const useErModeStore = create<ErModeStore>((set) => ({
  erModeState: "loading",
  setErModeState: (erModeState) => set({ erModeState }),
}));
