import { create } from "zustand";
import { DEFAULT_TEMPLATES, type PromptTemplate } from "../lib/promptBuilder";

interface PromptTemplatesStore {
  templates: PromptTemplate[];
  addTemplate: (template: PromptTemplate) => void;
  updateTemplate: (id: string, data: Partial<PromptTemplate>) => void;
  deleteTemplate: (id: string) => void;
  hydrate: (templates: PromptTemplate[]) => void;
}

export const usePromptTemplatesStore = create<PromptTemplatesStore>(
  (set) => ({
    templates: DEFAULT_TEMPLATES,

    addTemplate: (template) =>
      set((s) => {
        const maxOrder = Math.max(...s.templates.map((t) => t.order), -1);
        return { templates: [...s.templates, { ...template, order: maxOrder + 1 }] };
      }),

    updateTemplate: (id, data) =>
      set((s) => ({
        templates: s.templates.map((t) =>
          t.id === id ? { ...t, ...data } : t,
        ),
      })),

    deleteTemplate: (id) =>
      set((s) => {
        if (s.templates.length <= 1) return s;
        return { templates: s.templates.filter((t) => t.id !== id) };
      }),

    hydrate: (templates) =>
      set({ templates: [...templates].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)) }),
  }),
);
