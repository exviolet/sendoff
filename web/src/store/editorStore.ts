import { createWithEqualityFn as create } from "zustand/traditional";
import { pushHistory, disposeHistory, takeUndo, takeRedo } from "./editorHistory";
import {
  makeTab,
  makeAutoTitle,
  normalizeTab,
  partitionPinned,
  isAutoTitled,
  canCleanupTab,
} from "../lib/tabUtils";

export interface TmuxBinding {
  session: string;
  window: string;   // имя окна: отображение + fallback, НЕ уникально
  windowId?: string; // #{window_id} (@N) — первичный ключ резолва; опционален у легаси-привязок
}

export interface OrcaBinding {
  worktree: string;   // worktreePath или displayName (стабильно; хендл резолвится живьём)
  titleHint?: string; // титул терминала для disambiguation внутри worktree
}

export interface Tab {
  id: string;
  title: string;
  content: string;
  isDirty: boolean;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  titleSource?: "auto" | "manual" | "file";
  tmuxBinding?: TmuxBinding;
  orcaBinding?: OrcaBinding;
}

interface EditorStore {
  tabs: Tab[];
  activeTabId: string | null;
  tabCounter: number;
  isHydrated: boolean;
  closedTabs: Tab[];
  pendingClose: { id: string; title: string } | null;
  createTab: () => void;
  closeTab: (id: string) => void;
  confirmPendingClose: () => void;
  cancelPendingClose: () => void;
  closeSavedTabs: () => number;
  closeOtherTabs: (keepId: string) => number;
  closeTabsToRight: (id: string) => number;
  cleanupEmptyTabs: () => number;
  reopenTab: () => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  renameTab: (id: string, title: string) => void;
  markSaved: (id: string) => void;
  setTabBinding: (id: string, binding: TmuxBinding | null) => void;
  setOrcaBinding: (id: string, binding: OrcaBinding | null) => void;
  togglePin: (id: string) => void;
  reorderTab: (fromIndex: number, toIndex: number) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  addTabFromFile: (title: string, content: string) => void;
  hydrate: (tabs: Tab[], activeTabId: string | null, tabCounter: number) => void;
}

const initialTab = makeTab(1);

const MAX_CLOSED_TABS = 20;

export const useEditorStore = create<EditorStore>((set, get) => {
  function performClose(id: string) {
    const { tabs, activeTabId, closedTabs } = get();
    const tab = tabs.find((t) => t.id === id);
    const newClosedTabs = tab
      ? [...closedTabs, tab].slice(-MAX_CLOSED_TABS)
      : closedTabs;
    const remaining = tabs.filter((t) => t.id !== id);
    disposeHistory(id);

    if (remaining.length === 0) {
      const next = get().tabCounter + 1;
      const fresh = makeTab(next);
      set({ tabs: [fresh], activeTabId: fresh.id, tabCounter: next, closedTabs: newClosedTabs });
      return;
    }

    let newActiveId = activeTabId;
    if (activeTabId === id) {
      const closedIndex = tabs.findIndex((t) => t.id === id);
      const newIndex = Math.min(closedIndex, remaining.length - 1);
      newActiveId = remaining[newIndex].id;
    }

    set({ tabs: remaining, activeTabId: newActiveId, closedTabs: newClosedTabs });
  }

  function performCloseMany(ids: string[]) {
    if (ids.length === 0) return 0;
    const toClose = new Set(ids);
    const { tabs, activeTabId, closedTabs, tabCounter } = get();
    const closing = tabs.filter((t) => toClose.has(t.id) && !t.isDirty);
    if (closing.length === 0) return 0;
    const closingIds = new Set(closing.map((t) => t.id));
    closingIds.forEach(disposeHistory);
    const newClosedTabs = [...closedTabs, ...closing].slice(-MAX_CLOSED_TABS);
    const remaining = tabs.filter((t) => !closingIds.has(t.id));

    if (remaining.length === 0) {
      const next = tabCounter + 1;
      const fresh = makeTab(next);
      set({ tabs: [fresh], activeTabId: fresh.id, tabCounter: next, closedTabs: newClosedTabs });
      return closing.length;
    }

    let newActiveId = activeTabId;
    if (activeTabId && closingIds.has(activeTabId)) {
      const closedIndex = tabs.findIndex((t) => t.id === activeTabId);
      let pick = remaining[0].id;
      for (let i = closedIndex; i < tabs.length; i++) {
        if (!closingIds.has(tabs[i].id)) { pick = tabs[i].id; break; }
      }
      newActiveId = pick;
    }

    set({ tabs: remaining, activeTabId: newActiveId, closedTabs: newClosedTabs });
    return closing.length;
  }

  return {
  tabs: [initialTab],
  activeTabId: initialTab.id,
  tabCounter: 1,
  isHydrated: false,
  closedTabs: [],
  pendingClose: null,

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
    const { tabs } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    if (tab.isDirty) {
      set({ pendingClose: { id: tab.id, title: tab.title } });
      return;
    }
    performClose(id);
  },

  confirmPendingClose: () => {
    const { pendingClose } = get();
    if (!pendingClose) return;
    set({ pendingClose: null });
    performClose(pendingClose.id);
  },

  cancelPendingClose: () => set({ pendingClose: null }),

  closeSavedTabs: () => performCloseMany(get().tabs.filter((t) => !t.isDirty && !t.pinned).map((t) => t.id)),

  closeOtherTabs: (keepId) => performCloseMany(get().tabs.filter((t) => t.id !== keepId && !t.pinned).map((t) => t.id)),

  closeTabsToRight: (id) => {
    const tabs = get().tabs;
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return 0;
    return performCloseMany(tabs.slice(idx + 1).filter((t) => !t.pinned).map((t) => t.id));
  },

  cleanupEmptyTabs: () => {
    const { tabs, activeTabId, closedTabs } = get();
    if (tabs.length <= 1) return 0;

    const cleanupIds = new Set(tabs.filter(canCleanupTab).map((t) => t.id));
    if (cleanupIds.size === 0) return 0;
    if (cleanupIds.size === tabs.length) {
      cleanupIds.delete(activeTabId ?? tabs[0].id);
    }
    if (cleanupIds.size === 0) return 0;

    const closing = tabs.filter((t) => cleanupIds.has(t.id));
    cleanupIds.forEach(disposeHistory);
    const remaining = tabs.filter((t) => !cleanupIds.has(t.id));
    const newClosedTabs = [...closedTabs, ...closing].slice(-MAX_CLOSED_TABS);

    let newActiveId = activeTabId;
    if (activeTabId && cleanupIds.has(activeTabId)) {
      const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
      const right = tabs.slice(activeIndex + 1).find((t) => !cleanupIds.has(t.id));
      const left = [...tabs.slice(0, activeIndex)].reverse().find((t) => !cleanupIds.has(t.id));
      newActiveId = right?.id ?? left?.id ?? remaining[0]?.id ?? null;
    }

    set({ tabs: remaining, activeTabId: newActiveId, closedTabs: newClosedTabs });
    return cleanupIds.size;
  },

  reopenTab: () => {
    const { closedTabs } = get();
    if (closedTabs.length === 0) return;
    const tab = closedTabs[closedTabs.length - 1];
    set((s) => ({
      tabs: partitionPinned([...s.tabs, tab]),
      activeTabId: tab.id,
      closedTabs: s.closedTabs.slice(0, -1),
    }));
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (tab) pushHistory(id, tab.content, content);
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id
          ? {
              ...t,
              content,
              title: isAutoTitled(t) ? makeAutoTitle(content, t.title) : t.title,
              titleSource: isAutoTitled(t) ? "auto" : t.titleSource,
              isDirty: true,
              updatedAt: Date.now(),
            }
          : t
      ),
    }));
  },

  renameTab: (id, title) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, title, titleSource: "manual", updatedAt: Date.now() } : t
      ),
    })),

  togglePin: (id) =>
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === id ? { ...t, pinned: !t.pinned, updatedAt: Date.now() } : t
      );
      return { tabs: partitionPinned(tabs) };
    }),

  reorderTab: (fromIndex, toIndex) =>
    set((s) => {
      const tabs = [...s.tabs];
      const [moved] = tabs.splice(fromIndex, 1);
      tabs.splice(toIndex, 0, moved);
      return { tabs: partitionPinned(tabs) };
    }),

  undo: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const prev = takeUndo(id, tab.content);
    if (prev === undefined) return;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content: prev, updatedAt: Date.now() } : t
      ),
    }));
  },

  redo: (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab) return;
    const next = takeRedo(id, tab.content);
    if (next === undefined) return;
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, content: next, updatedAt: Date.now() } : t
      ),
    }));
  },

  markSaved: (id) =>
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === id ? { ...t, isDirty: false, updatedAt: Date.now() } : t
      ),
    })),

  setTabBinding: (id, binding) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, updatedAt: Date.now() };
        if (binding) {
          next.tmuxBinding = binding;
          delete next.orcaBinding; // взаимоисключимость: один таргет на таб
        } else {
          delete next.tmuxBinding;
        }
        return next;
      }),
    })),

  setOrcaBinding: (id, binding) =>
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== id) return t;
        const next = { ...t, updatedAt: Date.now() };
        if (binding) {
          next.orcaBinding = binding;
          delete next.tmuxBinding; // взаимоисключимость: один таргет на таб
        } else {
          delete next.orcaBinding;
        }
        return next;
      }),
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
      titleSource: "file",
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      tabCounter: next,
    }));
  },

  hydrate: (tabs, activeTabId, tabCounter) =>
    set({ tabs: partitionPinned(tabs.map(normalizeTab)), activeTabId, tabCounter, isHydrated: true }),
  };
});
