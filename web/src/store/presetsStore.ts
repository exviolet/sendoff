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
    id: "you-we",
    name: "You \u2192 We",
    pairs: [
      { from: "You", to: "We", caseSensitive: true, wholeWord: true },
      { from: "you", to: "we", caseSensitive: true, wholeWord: true },
      { from: "Your", to: "Our", caseSensitive: true, wholeWord: true },
      { from: "your", to: "our", caseSensitive: true, wholeWord: true },
    ],
  },
  {
    id: "we-you",
    name: "We \u2192 You (reverse)",
    pairs: [
      { from: "We", to: "You", caseSensitive: true, wholeWord: true },
      { from: "we", to: "you", caseSensitive: true, wholeWord: true },
      { from: "Our", to: "Your", caseSensitive: true, wholeWord: true },
      { from: "our", to: "your", caseSensitive: true, wholeWord: true },
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
