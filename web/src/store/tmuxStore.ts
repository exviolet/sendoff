import { create } from "zustand";

// Последний выбранный в picker'е tmux-таргет.
// Намеренно in-memory (НЕ персистится): pane id эфемерны, протухают со сессией.
// Persistent tab-binding — фаза B (см. docs/ROADMAP.md #9).
export interface TmuxTargetRef {
  pane: string;
  label: string;
}

interface TmuxStore {
  lastTarget: TmuxTargetRef | null;
  setLastTarget: (target: TmuxTargetRef) => void;
}

export const useTmuxStore = create<TmuxStore>((set) => ({
  lastTarget: null,
  setLastTarget: (lastTarget) => set({ lastTarget }),
}));
