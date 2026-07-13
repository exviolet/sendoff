import { createWithEqualityFn as create } from "zustand/traditional";
import { pushHistory, disposeHistory, takeUndo, takeRedo } from "./editorHistory";
import {
  makeTab,
  makeAutoTitle,
  normalizeTab,
  partitionPinned,
  isAutoTitled,
  canCleanupTab,
  tabsOf,
} from "../lib/tabUtils";

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  lastActiveTabId?: string;
}

export const DEFAULT_WORKSPACE_NAME = "Default";

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
  workspaceId: string; // обязателен после гидрации (старым табам присваивается «Default»)
}

interface EditorStore {
  tabs: Tab[];
  activeTabId: string | null;
  tabCounter: number;
  isHydrated: boolean;
  closedTabs: Tab[];
  pendingClose: { id: string; title: string } | null;
  workspaces: Workspace[];
  activeWorkspaceId: string;
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
  reorderTab: (fromId: string, toId: string) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  addTabFromFile: (title: string, content: string) => void;
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (name: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  moveTabToWorkspace: (tabId: string, workspaceId: string) => void;
  hydrate: (
    tabs: Tab[],
    activeTabId: string | null,
    tabCounter: number,
    workspaces: Workspace[],
    activeWorkspaceId: string | null,
  ) => void;
}

const initialWorkspace: Workspace = {
  id: crypto.randomUUID(),
  name: DEFAULT_WORKSPACE_NAME,
  createdAt: Date.now(),
};
const initialTab = makeTab(1, initialWorkspace.id);

const MAX_CLOSED_TABS = 20;

// Запомнить last-active таб в его workspace. Держит инвариант «переключился обратно —
// попал туда, где был».
function rememberActive(
  workspaces: Workspace[],
  workspaceId: string,
  tabId: string | null,
): Workspace[] {
  return workspaces.map((w) =>
    w.id === workspaceId ? { ...w, lastActiveTabId: tabId ?? undefined } : w,
  );
}

// Какой таб активировать при входе в workspace: last-active (если жив) → первый → null.
function pickActiveIn(tabs: Tab[], ws: Workspace | undefined, workspaceId: string): string | null {
  const list = tabsOf(tabs, workspaceId);
  if (list.length === 0) return null;
  const remembered = ws?.lastActiveTabId;
  if (remembered && list.some((t) => t.id === remembered)) return remembered;
  return list[0].id;
}

export const useEditorStore = create<EditorStore>((set, get) => {
  // Инвариант: активный workspace никогда не остаётся без табов. Если последний закрыли —
  // тут же создаём свежий В НЁМ ЖЕ (а не в глобальном списке).
  function refillIfEmpty(remaining: Tab[], wsId: string, tabCounter: number) {
    if (tabsOf(remaining, wsId).length > 0) return null;
    const next = tabCounter + 1;
    const fresh = makeTab(next, wsId);
    return { tabs: [...remaining, fresh], activeTabId: fresh.id, tabCounter: next };
  }

  function performClose(id: string) {
    const { tabs, activeTabId, closedTabs, activeWorkspaceId, tabCounter, workspaces } = get();
    const tab = tabs.find((t) => t.id === id);
    if (!tab) return;
    const newClosedTabs = [...closedTabs, tab].slice(-MAX_CLOSED_TABS);
    const remaining = tabs.filter((t) => t.id !== id);
    disposeHistory(id);

    const refill = refillIfEmpty(remaining, activeWorkspaceId, tabCounter);
    if (refill) {
      set({
        ...refill,
        closedTabs: newClosedTabs,
        workspaces: rememberActive(workspaces, activeWorkspaceId, refill.activeTabId),
      });
      return;
    }

    let newActiveId = activeTabId;
    if (activeTabId === id) {
      // Соседа выбираем в пределах видимого (workspace-)списка, не глобального.
      const visibleBefore = tabsOf(tabs, activeWorkspaceId);
      const visibleAfter = tabsOf(remaining, activeWorkspaceId);
      const closedIndex = visibleBefore.findIndex((t) => t.id === id);
      newActiveId = visibleAfter[Math.min(closedIndex, visibleAfter.length - 1)].id;
    }

    set({
      tabs: remaining,
      activeTabId: newActiveId,
      closedTabs: newClosedTabs,
      workspaces: rememberActive(workspaces, activeWorkspaceId, newActiveId),
    });
  }

  function performCloseMany(ids: string[]) {
    if (ids.length === 0) return 0;
    const toClose = new Set(ids);
    const { tabs, activeTabId, closedTabs, tabCounter, activeWorkspaceId, workspaces } = get();
    // Скоуп: bulk-close НИКОГДА не трогает чужие workspace (не разрушать молча).
    const closing = tabs.filter(
      (t) => toClose.has(t.id) && !t.isDirty && t.workspaceId === activeWorkspaceId,
    );
    if (closing.length === 0) return 0;
    const closingIds = new Set(closing.map((t) => t.id));
    closingIds.forEach(disposeHistory);
    const newClosedTabs = [...closedTabs, ...closing].slice(-MAX_CLOSED_TABS);
    const remaining = tabs.filter((t) => !closingIds.has(t.id));

    const refill = refillIfEmpty(remaining, activeWorkspaceId, tabCounter);
    if (refill) {
      set({
        ...refill,
        closedTabs: newClosedTabs,
        workspaces: rememberActive(workspaces, activeWorkspaceId, refill.activeTabId),
      });
      return closing.length;
    }

    let newActiveId = activeTabId;
    if (activeTabId && closingIds.has(activeTabId)) {
      const visibleBefore = tabsOf(tabs, activeWorkspaceId);
      const closedIndex = visibleBefore.findIndex((t) => t.id === activeTabId);
      const survivor =
        visibleBefore.slice(closedIndex).find((t) => !closingIds.has(t.id)) ??
        tabsOf(remaining, activeWorkspaceId)[0];
      newActiveId = survivor.id;
    }

    set({
      tabs: remaining,
      activeTabId: newActiveId,
      closedTabs: newClosedTabs,
      workspaces: rememberActive(workspaces, activeWorkspaceId, newActiveId),
    });
    return closing.length;
  }

  return {
  tabs: [initialTab],
  activeTabId: initialTab.id,
  tabCounter: 1,
  isHydrated: false,
  closedTabs: [],
  pendingClose: null,
  workspaces: [initialWorkspace],
  activeWorkspaceId: initialWorkspace.id,

  createTab: () => {
    const next = get().tabCounter + 1;
    const tab = makeTab(next, get().activeWorkspaceId);
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      tabCounter: next,
      workspaces: rememberActive(s.workspaces, s.activeWorkspaceId, tab.id),
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

  // Все bulk-close скоуплены активным workspace (фильтр — внутри performCloseMany).
  closeSavedTabs: () => performCloseMany(get().tabs.filter((t) => !t.isDirty && !t.pinned).map((t) => t.id)),

  closeOtherTabs: (keepId) => performCloseMany(get().tabs.filter((t) => t.id !== keepId && !t.pinned).map((t) => t.id)),

  closeTabsToRight: (id) => {
    const { tabs, activeWorkspaceId } = get();
    // «Правее» — по ВИДИМОМУ списку, глобальные индексы тут не имеют смысла.
    const visible = tabsOf(tabs, activeWorkspaceId);
    const idx = visible.findIndex((t) => t.id === id);
    if (idx < 0) return 0;
    return performCloseMany(visible.slice(idx + 1).filter((t) => !t.pinned).map((t) => t.id));
  },

  cleanupEmptyTabs: () => {
    const { tabs, activeTabId, closedTabs, activeWorkspaceId, workspaces } = get();
    const visible = tabsOf(tabs, activeWorkspaceId);
    if (visible.length <= 1) return 0;

    // Чистим только внутри активного workspace.
    const cleanupIds = new Set(visible.filter(canCleanupTab).map((t) => t.id));
    if (cleanupIds.size === 0) return 0;
    if (cleanupIds.size === visible.length) {
      cleanupIds.delete(activeTabId ?? visible[0].id);
    }
    if (cleanupIds.size === 0) return 0;

    const closing = tabs.filter((t) => cleanupIds.has(t.id));
    cleanupIds.forEach(disposeHistory);
    const remaining = tabs.filter((t) => !cleanupIds.has(t.id));
    const newClosedTabs = [...closedTabs, ...closing].slice(-MAX_CLOSED_TABS);

    let newActiveId = activeTabId;
    if (activeTabId && cleanupIds.has(activeTabId)) {
      const activeIndex = visible.findIndex((t) => t.id === activeTabId);
      const right = visible.slice(activeIndex + 1).find((t) => !cleanupIds.has(t.id));
      const left = [...visible.slice(0, activeIndex)].reverse().find((t) => !cleanupIds.has(t.id));
      newActiveId = right?.id ?? left?.id ?? tabsOf(remaining, activeWorkspaceId)[0]?.id ?? null;
    }

    set({
      tabs: remaining,
      activeTabId: newActiveId,
      closedTabs: newClosedTabs,
      workspaces: rememberActive(workspaces, activeWorkspaceId, newActiveId),
    });
    return cleanupIds.size;
  },

  // Возвращает последний закрытый таб АКТИВНОГО workspace (стек закрытых — глобальный).
  reopenTab: () => {
    const { closedTabs, activeWorkspaceId, workspaces } = get();
    const idx = [...closedTabs]
      .map((t, i) => ({ t, i }))
      .reverse()
      .find(({ t }) => t.workspaceId === activeWorkspaceId)?.i;
    if (idx === undefined) return;
    const tab = closedTabs[idx];
    set((s) => ({
      tabs: partitionPinned([...s.tabs, tab]),
      activeTabId: tab.id,
      closedTabs: s.closedTabs.filter((_, i) => i !== idx),
      workspaces: rememberActive(workspaces, activeWorkspaceId, tab.id),
    }));
  },

  // Активация таба из другого workspace ПЕРЕКЛЮЧАЕТ и workspace — за счёт этого
  // global search (кросс-workspace) работает без отдельного экшена.
  setActiveTab: (id) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      if (!tab) return {};
      const wsId = tab.workspaceId;
      return {
        activeTabId: id,
        activeWorkspaceId: wsId,
        workspaces: rememberActive(s.workspaces, wsId, id),
      };
    }),

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

  // По id, а не по индексам: TabBar рендерит ОТФИЛЬТРОВАННЫЙ список, его индексы
  // не совпадают с глобальными.
  reorderTab: (fromId, toId) =>
    set((s) => {
      if (fromId === toId) return {};
      const tabs = [...s.tabs];
      const from = tabs.findIndex((t) => t.id === fromId);
      if (from < 0) return {};
      const [moved] = tabs.splice(from, 1);
      const to = tabs.findIndex((t) => t.id === toId);
      if (to < 0) return {};
      tabs.splice(to, 0, moved);
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
      workspaceId: get().activeWorkspaceId,
    };
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
      tabCounter: next,
      workspaces: rememberActive(s.workspaces, s.activeWorkspaceId, tab.id),
    }));
  },

  setActiveWorkspace: (id) =>
    set((s) => {
      if (id === s.activeWorkspaceId) return {};
      const target = s.workspaces.find((w) => w.id === id);
      if (!target) return {};

      // Запомнить, где были, чтобы вернуться сюда же.
      const workspaces = rememberActive(s.workspaces, s.activeWorkspaceId, s.activeTabId);
      const pick = pickActiveIn(s.tabs, target, id);

      // Пустой workspace → материализуем свежий таб (инвариант «активный непуст»).
      if (!pick) {
        const next = s.tabCounter + 1;
        const fresh = makeTab(next, id);
        return {
          tabs: [...s.tabs, fresh],
          activeTabId: fresh.id,
          tabCounter: next,
          activeWorkspaceId: id,
          workspaces: rememberActive(workspaces, id, fresh.id),
        };
      }

      return {
        activeTabId: pick,
        activeWorkspaceId: id,
        workspaces: rememberActive(workspaces, id, pick),
      };
    }),

  createWorkspace: (name) =>
    set((s) => {
      const ws: Workspace = {
        id: crypto.randomUUID(),
        name: name.trim() || "Workspace",
        createdAt: Date.now(),
      };
      const next = s.tabCounter + 1;
      const fresh = makeTab(next, ws.id);
      return {
        workspaces: [
          ...rememberActive(s.workspaces, s.activeWorkspaceId, s.activeTabId),
          { ...ws, lastActiveTabId: fresh.id },
        ],
        tabs: [...s.tabs, fresh],
        activeTabId: fresh.id,
        activeWorkspaceId: ws.id,
        tabCounter: next,
      };
    }),

  renameWorkspace: (id, name) =>
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === id ? { ...w, name: name.trim() || w.name } : w,
      ),
    })),

  // Последний workspace удалить нельзя. Табы НИКОГДА не удаляются молча — переезжают
  // в первый оставшийся.
  deleteWorkspace: (id) =>
    set((s) => {
      if (s.workspaces.length <= 1) return {};
      const target = s.workspaces.find((w) => w.id !== id);
      if (!target) return {};

      const tabs = s.tabs.map((t) => (t.workspaceId === id ? { ...t, workspaceId: target.id } : t));
      const workspaces = s.workspaces.filter((w) => w.id !== id);

      if (id !== s.activeWorkspaceId) return { tabs, workspaces };

      const pick = pickActiveIn(tabs, target, target.id);
      if (!pick) {
        const next = s.tabCounter + 1;
        const fresh = makeTab(next, target.id);
        return {
          tabs: [...tabs, fresh],
          workspaces: rememberActive(workspaces, target.id, fresh.id),
          activeTabId: fresh.id,
          activeWorkspaceId: target.id,
          tabCounter: next,
        };
      }
      return {
        tabs,
        workspaces: rememberActive(workspaces, target.id, pick),
        activeTabId: pick,
        activeWorkspaceId: target.id,
      };
    }),

  moveTabToWorkspace: (tabId, workspaceId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab || tab.workspaceId === workspaceId) return {};
      if (!s.workspaces.some((w) => w.id === workspaceId)) return {};

      const from = tab.workspaceId;
      const tabs = partitionPinned(
        s.tabs.map((t) => (t.id === tabId ? { ...t, workspaceId, updatedAt: Date.now() } : t)),
      );

      // Уехал не из активного workspace — активный таб не затронут.
      if (from !== s.activeWorkspaceId) return { tabs };

      // Уехал активный таб → в текущем workspace выбрать нового (или создать свежий,
      // если опустел).
      let activeTabId = s.activeTabId;
      let workspaces = s.workspaces;
      let tabCounter = s.tabCounter;
      let result = tabs;

      if (s.activeTabId === tabId) {
        const rest = tabsOf(tabs, from);
        if (rest.length === 0) {
          tabCounter = s.tabCounter + 1;
          const fresh = makeTab(tabCounter, from);
          result = [...tabs, fresh];
          activeTabId = fresh.id;
        } else {
          activeTabId = rest[0].id;
        }
        workspaces = rememberActive(workspaces, from, activeTabId);
      }
      // Целевой workspace должен открыться на переехавшем табе.
      workspaces = rememberActive(workspaces, workspaceId, tabId);

      return { tabs: result, activeTabId, workspaces, tabCounter };
    }),

  // Bootstrap старой базы: нет workspaces → создаём «Default», все табы уходят в него.
  // Ничего не теряется — это единственное место, где можно повредить чужие данные.
  hydrate: (tabs, activeTabId, tabCounter, workspaces, activeWorkspaceId) =>
    set(() => {
      const list: Workspace[] = workspaces.length > 0
        ? workspaces
        : [{ id: crypto.randomUUID(), name: DEFAULT_WORKSPACE_NAME, createdAt: Date.now() }];
      const known = new Set(list.map((w) => w.id));

      // Таб без workspaceId (легаси) или с указателем на исчезнувший workspace → в первый.
      const normalized = tabs
        .map(normalizeTab)
        .map((t) => (t.workspaceId && known.has(t.workspaceId) ? t : { ...t, workspaceId: list[0].id }));

      const activeWs = activeWorkspaceId && known.has(activeWorkspaceId) ? activeWorkspaceId : list[0].id;
      const active =
        activeTabId && normalized.some((t) => t.id === activeTabId && t.workspaceId === activeWs)
          ? activeTabId
          : pickActiveIn(normalized, list.find((w) => w.id === activeWs), activeWs);

      // Активный workspace обязан быть непустым.
      if (!active) {
        const next = tabCounter + 1;
        const fresh = makeTab(next, activeWs);
        return {
          tabs: partitionPinned([...normalized, fresh]),
          activeTabId: fresh.id,
          tabCounter: next,
          workspaces: rememberActive(list, activeWs, fresh.id),
          activeWorkspaceId: activeWs,
          isHydrated: true,
        };
      }

      return {
        tabs: partitionPinned(normalized),
        activeTabId: active,
        tabCounter,
        workspaces: rememberActive(list, activeWs, active),
        activeWorkspaceId: activeWs,
        isHydrated: true,
      };
    }),
  };
});
