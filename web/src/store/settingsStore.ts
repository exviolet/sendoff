import { create } from "zustand";
import type { ShortcutOverrides } from "../lib/shortcuts";

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
  shortcutOverrides: ShortcutOverrides;
  // Id скрытых кнопок шапки (см. lib/toolbarButtons.ts). Пусто = видны все.
  hiddenToolbarButtons: string[];
}

interface SettingsStore extends Settings {
  setFontSize: (size: number) => void;
  setWordWrap: (wrap: boolean) => void;
  setTmuxAutoSubmit: (autoSubmit: boolean) => void;
  setFontFamily: (family: string) => void;
  setPhraseInsertMode: (mode: PhraseInsertMode) => void;
  setShortcutOverrides: (overrides: ShortcutOverrides) => void;
  toggleToolbarButton: (id: string) => void;
  setHiddenToolbarButtons: (ids: string[]) => void;
  hydrate: (settings: Partial<Settings>) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  fontSize: 13,
  wordWrap: true,
  tmuxAutoSubmit: true,
  fontFamily: "",
  phraseInsertMode: "prepend",
  shortcutOverrides: {},
  hiddenToolbarButtons: [],

  setFontSize: (fontSize) => set({ fontSize: Math.min(24, Math.max(10, fontSize)) }),

  setWordWrap: (wordWrap) => set({ wordWrap }),

  setTmuxAutoSubmit: (tmuxAutoSubmit) => set({ tmuxAutoSubmit }),

  setFontFamily: (fontFamily) => set({ fontFamily }),

  setPhraseInsertMode: (phraseInsertMode) => set({ phraseInsertMode }),

  setShortcutOverrides: (shortcutOverrides) => set({ shortcutOverrides }),

  setHiddenToolbarButtons: (hiddenToolbarButtons) => set({ hiddenToolbarButtons }),

  toggleToolbarButton: (id) =>
    set((state) => ({
      hiddenToolbarButtons: state.hiddenToolbarButtons.includes(id)
        ? state.hiddenToolbarButtons.filter((x) => x !== id)
        : [...state.hiddenToolbarButtons, id],
    })),

  hydrate: (settings) => set(settings),
}));
