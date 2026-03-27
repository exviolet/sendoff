import { create } from "zustand";
import type { ReplacePair } from "../lib/replaceEngine";
import { applyReplacePairs } from "../lib/replaceEngine";
import { useEditorStore } from "./editorStore";

export interface ReplacePreset {
  id: string;
  name: string;
  pairs: ReplacePair[];
}

const DEFAULT_PRESETS: ReplacePreset[] = [
  {
    id: "vy-my",
    name: "Вы \u2192 Мы",
    pairs: [
      { from: "Вы", to: "Мы", caseSensitive: true, wholeWord: true },
      { from: "вы", to: "мы", caseSensitive: true, wholeWord: true },
      { from: "Ваш", to: "Наш", caseSensitive: true, wholeWord: false },
      { from: "ваш", to: "наш", caseSensitive: true, wholeWord: false },
      { from: "Вашего", to: "Нашего", caseSensitive: true, wholeWord: false },
      { from: "Вам", to: "Нам", caseSensitive: true, wholeWord: false },
    ],
  },
  {
    id: "my-vy",
    name: "Мы \u2192 Вы (обратно)",
    pairs: [
      { from: "Мы", to: "Вы", caseSensitive: true, wholeWord: true },
      { from: "мы", to: "вы", caseSensitive: true, wholeWord: true },
      { from: "Наш", to: "Ваш", caseSensitive: true, wholeWord: false },
      { from: "наш", to: "ваш", caseSensitive: true, wholeWord: false },
    ],
  },
];

interface PresetsStore {
  presets: ReplacePreset[];
  lastApplyResult: { presetName: string; count: number } | null;
  addPreset: (preset: ReplacePreset) => void;
  updatePreset: (id: string, data: Partial<ReplacePreset>) => void;
  deletePreset: (id: string) => void;
  applyPreset: (presetId: string, tabId: string) => void;
  clearLastResult: () => void;
  hydrate: (presets: ReplacePreset[]) => void;
}

export const usePresetsStore = create<PresetsStore>((set, get) => ({
  presets: DEFAULT_PRESETS,
  lastApplyResult: null,

  addPreset: (preset) =>
    set((s) => ({ presets: [...s.presets, preset] })),

  updatePreset: (id, data) =>
    set((s) => ({
      presets: s.presets.map((p) => (p.id === id ? { ...p, ...data } : p)),
    })),

  deletePreset: (id) =>
    set((s) => ({ presets: s.presets.filter((p) => p.id !== id) })),

  applyPreset: (presetId, tabId) => {
    const preset = get().presets.find((p) => p.id === presetId);
    if (!preset) return;

    const tab = useEditorStore.getState().tabs.find((t) => t.id === tabId);
    if (!tab) return;

    const { result, totalCount } = applyReplacePairs(tab.content, preset.pairs);
    if (totalCount > 0) {
      useEditorStore.getState().updateContent(tabId, result);
    }
    set({ lastApplyResult: { presetName: preset.name, count: totalCount } });
  },

  clearLastResult: () => set({ lastApplyResult: null }),

  hydrate: (presets) => set({ presets }),
}));
