import { create } from "zustand";

// Куда Ctrl+K кладёт тело фразы. "prepend" — исходное поведение (фраза-роль
// встаёт префиксом ко всему промпту), "cursor" — обычная вставка сниппета.
export type PhraseInsertMode = "prepend" | "cursor";

export interface Settings {
  fontSize: number;
  wordWrap: boolean;
  tmuxAutoSubmit: boolean;
  // Имя font-family (напр. "JetBrainsMono Nerd Font"). Пусто = дефолтный стек из index.css.
  fontFamily: string;
  phraseInsertMode: PhraseInsertMode;
}

interface SettingsStore extends Settings {
  setFontSize: (size: number) => void;
  setWordWrap: (wrap: boolean) => void;
  setTmuxAutoSubmit: (autoSubmit: boolean) => void;
  setFontFamily: (family: string) => void;
  setPhraseInsertMode: (mode: PhraseInsertMode) => void;
  hydrate: (settings: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  fontSize: 13,
  wordWrap: true,
  tmuxAutoSubmit: true,
  fontFamily: "",
  phraseInsertMode: "prepend",

  setFontSize: (fontSize) => set({ fontSize: Math.min(24, Math.max(10, fontSize)) }),

  setWordWrap: (wordWrap) => set({ wordWrap }),

  setTmuxAutoSubmit: (tmuxAutoSubmit) => set({ tmuxAutoSubmit }),

  setFontFamily: (fontFamily) => set({ fontFamily }),

  setPhraseInsertMode: (phraseInsertMode) => set({ phraseInsertMode }),

  hydrate: (settings) => set(settings),
}));
