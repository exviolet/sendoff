import { create } from "zustand";

// Trigger phrase — короткий префикс-режим, который дописывается в начало промпта
// (steering tmux-агента). Не обёртка текста: body вставляется как есть.
export interface TriggerPhrase {
  id: string;
  label: string;
  body: string;
  order: number;
}

export const DEFAULT_PHRASES: TriggerPhrase[] = [
  { id: "direct", label: "Сделай напрямую", body: "Сделай напрямую:\n\n", order: 0 },
  { id: "plan-then-act", label: "Короткий план + действие", body: "Сначала короткий план, потом делай:\n\n", order: 1 },
  { id: "plan-only", label: "Только план", body: "Только план, без изменений:\n\n", order: 2 },
];

interface TriggerPhrasesStore {
  phrases: TriggerPhrase[];
  addPhrase: (phrase: TriggerPhrase) => void;
  updatePhrase: (id: string, data: Partial<TriggerPhrase>) => void;
  deletePhrase: (id: string) => void;
  hydrate: (phrases: TriggerPhrase[]) => void;
}

export const useTriggerPhrasesStore = create<TriggerPhrasesStore>((set) => ({
  phrases: DEFAULT_PHRASES,

  addPhrase: (phrase) =>
    set((s) => {
      const maxOrder = Math.max(...s.phrases.map((p) => p.order), -1);
      return { phrases: [...s.phrases, { ...phrase, order: maxOrder + 1 }] };
    }),

  updatePhrase: (id, data) =>
    set((s) => ({
      phrases: s.phrases.map((p) => (p.id === id ? { ...p, ...data } : p)),
    })),

  deletePhrase: (id) =>
    set((s) => ({ phrases: s.phrases.filter((p) => p.id !== id) })),

  hydrate: (phrases) =>
    set({ phrases: [...phrases].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }),
}));
