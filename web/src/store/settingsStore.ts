import { create } from "zustand";

export interface Settings {
  fontSize: number;
  wordWrap: boolean;
  tmuxAutoSubmit: boolean;
}

interface SettingsStore extends Settings {
  setFontSize: (size: number) => void;
  setWordWrap: (wrap: boolean) => void;
  setTmuxAutoSubmit: (autoSubmit: boolean) => void;
  hydrate: (settings: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  fontSize: 13,
  wordWrap: true,
  tmuxAutoSubmit: true,

  setFontSize: (fontSize) => set({ fontSize: Math.min(24, Math.max(10, fontSize)) }),

  setWordWrap: (wordWrap) => set({ wordWrap }),

  setTmuxAutoSubmit: (tmuxAutoSubmit) => set({ tmuxAutoSubmit }),

  hydrate: (settings) => set(settings),
}));
