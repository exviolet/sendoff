import { create } from "zustand";

export interface Tab {
  id: string;
  title: string;
  content: string;
  isDirty: boolean;
  createdAt: number;
  updatedAt: number;
}

interface EditorStore {
  tabs: Tab[];
  activeTabId: string | null;
  tabCounter: number;
  isHydrated: boolean;
  createTab: () => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  renameTab: (id: string, title: string) => void;
  addTabFromFile: (title: string, content: string) => void;
  hydrate: (tabs: Tab[], activeTabId: string | null, tabCounter: number) => void;
}

function makeTab(n: number): Tab {
  return {
    id: crypto.randomUUID(),
    title: `Untitled ${n}`,
    content: "",
    isDirty: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

const initialTab = makeTab(1);

export const useEditorStore = create<EditorStore>((set, get) => ({
  tabs: [initialTab],
  activeTabId: initialTab.id,
  tabCounter: 1,
  isHydrated: false,

  createTab: () => {
    const next = get().tabCounter + 1;
    const tab = makeTab(next);
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      tabCounter: next,
    }));
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const tab = tabs.find((t) => t.id === id);
    if (tab?.isDirty && !confirm(`Close "${tab.title}" without saving?`)) {
      return;
    }

    const remaining = tabs.filter((t) => t.id !== id);

    if (remaining.length === 0) {
      const next = get().tabCounter + 1;
      const fresh = makeTab(next);
      set({ tabs: [fresh], activeTabId: fresh.id, tabCounter: next });
      return;
    }

    let newActiveId = activeTabId;
    if (activeTabId === id) {
      const closedIndex = tabs.findIndex((t) => t.id === id);
      const newIndex = Math.min(closedIndex, remaining.length - 1);
      newActiveId = remaining[newIndex].id;
    }

    set({ tabs: remaining, activeTabId: newActiveId });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? { ...t, content, isDirty: true, updatedAt: Date.now() }
          : t
      ),
    })),

  renameTab: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, title, updatedAt: Date.now() } : t
      ),
    })),

  addTabFromFile: (title, content) => {
    const next = get().tabCounter + 1;
    const tab: Tab = {
      id: crypto.randomUUID(),
      title,
      content,
      isDirty: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      tabCounter: next,
    }));
  },

  hydrate: (tabs, activeTabId, tabCounter) =>
    set({ tabs, activeTabId, tabCounter, isHydrated: true }),
}));
