import { createWithEqualityFn as create } from "zustand/traditional";
import { pushHistory, disposeHistory, takeUndo, takeRedo } from "./editorHistory";
import {
  makeTab,
  makeAutoTitle,
  normalizeTab,
  partitionPinned,
  arrangeTabs,
  visibleTabsOf,
  pruneGroups,
  isAutoTitled,
  canCleanupTab,
  tabsOf,
  stepTab,
} from "../lib/tabUtils";

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  lastActiveTabId?: string;
}

export const DEFAULT_WORKSPACE_NAME = "Default";

// Фиксированная палитра, а не произвольный hex: цвета обязаны читаться в обеих темах и не
// спорить с accent-подсветкой активного таба (tasks/14).
export const TAB_GROUP_COLORS = ["accent", "green", "yellow", "red", "purple", "gray"] as const;
export type TabGroupColor = (typeof TAB_GROUP_COLORS)[number];

export interface TabGroup {
  id: string;
  name: string;
  color: TabGroupColor;
  collapsed: boolean;
  workspaceId: string; // группа живёт внутри workspace: таб не может попасть в чужую
  createdAt: number;
}

export interface TmuxBinding {
  session: string;
  window: string;   // имя окна: отображение + fallback, НЕ уникально
  windowId?: string; // #{window_id} (@N) — первичный ключ резолва; опционален у легаси-привязок
}

export interface OrcaBinding {
  worktree: string;   // worktreePath или displayName (стабильно; хендл резолвится живьём)
  titleHint?: string; // титул терминала для disambiguation внутри worktree
}

// Herdr persist'ит pane_id в session.json, поэтому привязка переживает рестарт сервера
// и ребут — в отличие от tmux @id и orca term_… . НО публичные номера панелей
// переиспользуются после закрытия, а лейблы не уникальны (две вкладки «codex» в одном
// workspace — норма). Поэтому храним и то, и другое: резолв требует совпадения paneId
// И пары лейблов, иначе промпт уедет чужому агенту (баг 2026-07-10).
export interface HerdrBinding {
  paneId: string;    // "wK:p1" — таргет всех agent-команд, единственная принимаемая форма
  workspace: string; // ЛЕЙБЛ workspace ("rewrite-desktop"), не id: id пересобирается
  tab: string;       // ЛЕЙБЛ вкладки ("1", "claude")
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
  herdrBinding?: HerdrBinding;
  workspaceId: string; // обязателен после гидрации (старым табам присваивается «Default»)
  groupId?: string;    // аддитивно: отсутствие = таб вне групп (валидное состояние)
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
  tabGroups: TabGroup[];
  // Ctrl+клик по табам. Эфемерно: НЕ персистится (в saveSession не попадает) — выделение
  // переживать перезапуск не должно, это состояние текущего жеста, а не данные.
  selectedTabIds: string[];
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
  setHerdrBinding: (id: string, binding: HerdrBinding | null) => void;
  togglePin: (id: string) => void;
  reorderTab: (fromId: string, toId: string) => void;
  moveTabStep: (id: string, dir: -1 | 1) => void;
  undo: (id: string) => void;
  redo: (id: string) => void;
  addTabFromFile: (title: string, content: string) => void;
  setActiveWorkspace: (id: string) => void;
  createWorkspace: (name: string) => void;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  moveTabToWorkspace: (tabId: string, workspaceId: string) => void;
  createTabGroup: (name: string, color: TabGroupColor, tabId?: string) => void;
  renameTabGroup: (id: string, name: string) => void;
  setTabGroupColor: (id: string, color: TabGroupColor) => void;
  toggleTabGroupCollapsed: (id: string) => void;
  assignTabToGroup: (tabId: string, groupId: string | null) => void;
  assignTabsToGroup: (tabIds: string[], groupId: string | null) => void;
  moveTabsToWorkspace: (tabIds: string[], workspaceId: string) => void;
  reorderTabGroup: (groupId: string, toTabId: string) => void;
  toggleTabSelection: (tabId: string) => void;
  clearTabSelection: () => void;
  ungroupTabGroup: (id: string) => void;
  closeTabGroup: (id: string) => number;
  hydrate: (
    tabs: Tab[],
    activeTabId: string | null,
    tabCounter: number,
    workspaces: Workspace[],
    activeWorkspaceId: string | null,
    tabGroups: TabGroup[],
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

// Один терминальный таргет на таб: установка любой привязки стирает две другие.
// Раньше взаимоисключимость держали парой `delete` в каждом сеттере — с тремя
// таргетами это шесть мест, где легко забыть одно и получить таб с двумя привязками
// (диспетчер Ctrl+Enter выбрал бы по порядку проверок, а не по тому, что привязал юзер).
const BINDING_FIELDS = ["tmuxBinding", "orcaBinding", "herdrBinding"] as const;
type BindingField = (typeof BINDING_FIELDS)[number];

function applyBinding<F extends BindingField>(
  tab: Tab,
  id: string,
  field: F,
  binding: Tab[F] | null,
): Tab {
  if (tab.id !== id) return tab;
  const next = { ...tab, updatedAt: Date.now() };
  for (const f of BINDING_FIELDS) delete next[f];
  if (binding) next[field] = binding;
  return next;
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

  // Выделение не должно держать id закрытых табов: иначе следующая пачечная операция
  // молча промахнётся мимо несуществующих табов.
  function keepSelection(remaining: Tab[]) {
    const alive = new Set(remaining.map((t) => t.id));
    return get().selectedTabIds.filter((id) => alive.has(id));
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
        tabGroups: pruneGroups(refill.tabs, get().tabGroups),
        selectedTabIds: keepSelection(refill.tabs),
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
      tabGroups: pruneGroups(remaining, get().tabGroups),
      selectedTabIds: keepSelection(remaining),
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
        tabGroups: pruneGroups(refill.tabs, get().tabGroups),
        selectedTabIds: keepSelection(refill.tabs),
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
      tabGroups: pruneGroups(remaining, get().tabGroups),
      selectedTabIds: keepSelection(remaining),
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
  tabGroups: [],
  selectedTabIds: [],

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

  // Пин и группа взаимоисключимы: закрепление ВЫНИМАЕТ таб из группы. Иначе partitionPinned
  // утащил бы члена run'а влево и разорвал группу (tasks/14, решение 1).
  togglePin: (id) =>
    set((s) => {
      const tabs = s.tabs.map((t) =>
        t.id === id
          ? { ...t, pinned: !t.pinned, groupId: t.pinned ? t.groupId : undefined, updatedAt: Date.now() }
          : t
      );
      return { tabs: arrangeTabs(tabs), tabGroups: pruneGroups(tabs, s.tabGroups) };
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

      // Членство определяется местом приземления: бросил внутрь группы — таб в ней,
      // бросил наружу — вышел. Иначе таб сел бы в run визуально, оставшись вне группы
      // логически, и уехал бы обратно при следующем arrangeTabs (tasks/14, ловушки).
      const landed = moved.pinned ? moved : { ...moved, groupId: tabs[to].groupId };
      tabs.splice(to, 0, landed);
      return { tabs: arrangeTabs(tabs), tabGroups: pruneGroups(tabs, s.tabGroups) };
    }),

  // Клавиатурный сдвиг таба на соседнюю видимую позицию (Ctrl+Shift+PgUp/PgDn).
  moveTabStep: (id, dir) =>
    set((s) => {
      const next = stepTab(s.tabs, s.tabGroups, id, dir);
      if (!next) return {};
      return { tabs: arrangeTabs(next), tabGroups: pruneGroups(next, s.tabGroups) };
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
    set((s) => ({ tabs: s.tabs.map((t) => applyBinding(t, id, "tmuxBinding", binding)) })),

  setOrcaBinding: (id, binding) =>
    set((s) => ({ tabs: s.tabs.map((t) => applyBinding(t, id, "orcaBinding", binding)) })),

  setHerdrBinding: (id, binding) =>
    set((s) => ({ tabs: s.tabs.map((t) => applyBinding(t, id, "herdrBinding", binding)) })),

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

      // Выделение скоуплено workspace'ом: унести его в другой набор табов — значит
      // применить пачечную операцию к тому, чего пользователь уже не видит.
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
          selectedTabIds: [],
        };
      }

      return {
        activeTabId: pick,
        activeWorkspaceId: id,
        workspaces: rememberActive(workspaces, id, pick),
        selectedTabIds: [],
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

      // groupId стирается вместе с переездом: группы удаляемого workspace в целевом не
      // существуют, а «висячий» groupId дал бы табу ссылку в никуда.
      const tabs = s.tabs.map((t) =>
        t.workspaceId === id ? { ...t, workspaceId: target.id, groupId: undefined } : t,
      );
      const workspaces = s.workspaces.filter((w) => w.id !== id);
      const tabGroups = pruneGroups(tabs, s.tabGroups);

      if (id !== s.activeWorkspaceId) return { tabs, workspaces, tabGroups };

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
          tabGroups,
        };
      }
      return {
        tabs,
        workspaces: rememberActive(workspaces, target.id, pick),
        activeTabId: pick,
        activeWorkspaceId: target.id,
        tabGroups,
      };
    }),

  moveTabToWorkspace: (tabId, workspaceId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab || tab.workspaceId === workspaceId) return {};
      if (!s.workspaces.some((w) => w.id === workspaceId)) return {};

      const from = tab.workspaceId;
      // groupId стирается: в целевом workspace такой группы нет (tasks/14, решение 5).
      const tabs = arrangeTabs(
        s.tabs.map((t) =>
          t.id === tabId ? { ...t, workspaceId, groupId: undefined, updatedAt: Date.now() } : t,
        ),
      );
      const tabGroups = pruneGroups(tabs, s.tabGroups);

      // Уехал не из активного workspace — активный таб не затронут.
      if (from !== s.activeWorkspaceId) return { tabs, tabGroups };

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

      return { tabs: result, activeTabId, workspaces, tabCounter, tabGroups };
    }),

  createTabGroup: (name, color, tabId) =>
    set((s) => {
      const group: TabGroup = {
        id: crypto.randomUUID(),
        name: name.trim() || "Группа",
        color,
        collapsed: false,
        workspaceId: s.activeWorkspaceId,
        createdAt: Date.now(),
      };
      // Группа без табов мгновенно умрёт от pruneGroups, поэтому создаём её только
      // вместе с первым жильцом — иначе получили бы чип, который сам себя удаляет.
      const target = tabId ?? s.activeTabId;
      const tabs = s.tabs.map((t) =>
        t.id === target && t.workspaceId === s.activeWorkspaceId
          ? { ...t, groupId: group.id, pinned: false }
          : t,
      );
      if (!tabs.some((t) => t.groupId === group.id)) return {};
      return { tabs: arrangeTabs(tabs), tabGroups: [...s.tabGroups, group] };
    }),

  renameTabGroup: (id, name) =>
    set((s) => ({
      tabGroups: s.tabGroups.map((g) => (g.id === id ? { ...g, name: name.trim() || g.name } : g)),
    })),

  setTabGroupColor: (id, color) =>
    set((s) => ({
      tabGroups: s.tabGroups.map((g) => (g.id === id ? { ...g, color } : g)),
    })),

  // Свёрнутость — ТОЛЬКО видимость: ни один таб не закрывается и не теряется.
  toggleTabGroupCollapsed: (id) =>
    set((s) => {
      const group = s.tabGroups.find((g) => g.id === id);
      if (!group) return {};
      const tabGroups = s.tabGroups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g));
      const collapsing = !group.collapsed;

      const active = s.tabs.find((t) => t.id === s.activeTabId);
      if (!collapsing || active?.groupId !== id) return { tabGroups };

      // Свернули группу с активным табом → активация переезжает на ближайший видимый:
      // сначала правее run'а, иначе левее. Если видимых не осталось вовсе (всё в свёрнутых
      // группах) — активный таб СОХРАНЯЕМ скрытым, а чип подсветится как активный.
      // Плодить новый таб или запрещать сворачивание — оба варианта хуже.
      const visible = visibleTabsOf(s.tabs, tabGroups, s.activeWorkspaceId);
      if (visible.length === 0) return { tabGroups };

      const order = tabsOf(s.tabs, s.activeWorkspaceId);
      const from = order.findIndex((t) => t.id === s.activeTabId);
      const visibleIds = new Set(visible.map((t) => t.id));
      const next =
        order.slice(from + 1).find((t) => visibleIds.has(t.id)) ??
        [...order.slice(0, from)].reverse().find((t) => visibleIds.has(t.id));
      if (!next) return { tabGroups };

      return {
        tabGroups,
        activeTabId: next.id,
        workspaces: rememberActive(s.workspaces, s.activeWorkspaceId, next.id),
      };
    }),

  assignTabToGroup: (tabId, groupId) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === tabId);
      if (!tab) return {};
      if (groupId) {
        const group = s.tabGroups.find((g) => g.id === groupId);
        // Чужой workspace — не наша группа. Молча не переносим ни таб, ни группу.
        if (!group || group.workspaceId !== tab.workspaceId) return {};
      }
      const tabs = s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, groupId: groupId ?? undefined, pinned: groupId ? false : t.pinned }
          : t,
      );
      return { tabs: arrangeTabs(tabs), tabGroups: pruneGroups(tabs, s.tabGroups) };
    }),

  // Тот же инвариант, что у одиночной версии, но одним set: поштучный цикл прогнал бы
  // arrangeTabs на каждый таб и дал бы промежуточные перерисовки полосы.
  assignTabsToGroup: (tabIds, groupId) =>
    set((s) => {
      const ids = new Set(tabIds);
      const group = groupId ? s.tabGroups.find((g) => g.id === groupId) : null;
      if (groupId && !group) return {};
      const tabs = s.tabs.map((t) => {
        if (!ids.has(t.id)) return t;
        // Таб из чужого workspace в эту группу не пускаем — молча пропускаем его.
        if (group && group.workspaceId !== t.workspaceId) return t;
        return { ...t, groupId: groupId ?? undefined, pinned: groupId ? false : t.pinned };
      });
      return { tabs: arrangeTabs(tabs), tabGroups: pruneGroups(tabs, s.tabGroups), selectedTabIds: [] };
    }),

  // Переезд пачкой идёт через одиночный moveTabToWorkspace: в нём вся логика выбора нового
  // активного таба и добивки опустевшего workspace, дублировать её нельзя.
  moveTabsToWorkspace: (tabIds, workspaceId) => {
    for (const id of tabIds) get().moveTabToWorkspace(id, workspaceId);
    set({ selectedTabIds: [] });
  },

  // Перетаскивание группы целиком: run уезжает к позиции целевого таба, порядок внутри
  // сохраняется. Реализовано переносом ПЕРВОГО члена — arrangeTabs подтянет остальных
  // (позиция run'а задаётся его первым табом), поэтому отдельной логики для хвоста нет.
  reorderTabGroup: (groupId, toTabId) =>
    set((s) => {
      const members = s.tabs.filter((t) => t.groupId === groupId);
      if (members.length === 0) return {};
      const target = s.tabs.find((t) => t.id === toTabId);
      // Бросок на собственного члена — no-op, иначе run «прыгнул» бы сам в себя.
      if (!target || target.groupId === groupId) return {};

      const rest = s.tabs.filter((t) => t.groupId !== groupId);
      const at = rest.findIndex((t) => t.id === toTabId);
      if (at < 0) return {};
      const tabs = [...rest.slice(0, at), ...members, ...rest.slice(at)];
      return { tabs: arrangeTabs(tabs) };
    }),

  toggleTabSelection: (tabId) =>
    set((s) => ({
      selectedTabIds: s.selectedTabIds.includes(tabId)
        ? s.selectedTabIds.filter((id) => id !== tabId)
        : [...s.selectedTabIds, tabId],
    })),

  clearTabSelection: () => set((s) => (s.selectedTabIds.length === 0 ? {} : { selectedTabIds: [] })),

  // Расформировать ≠ закрыть: табы остаются, исчезает только сама группа.
  ungroupTabGroup: (id) =>
    set((s) => {
      if (!s.tabGroups.some((g) => g.id === id)) return {};
      const tabs = s.tabs.map((t) => (t.groupId === id ? { ...t, groupId: undefined } : t));
      return { tabs: arrangeTabs(tabs), tabGroups: s.tabGroups.filter((g) => g.id !== id) };
    }),

  // Закрытие идёт через общий performCloseMany: он держит скоуп по workspace, наполняет
  // closedTabs (Ctrl+Shift+T вернёт), пропускает несохранённые и чистит осиротевшую группу.
  closeTabGroup: (id) => performCloseMany(get().tabs.filter((t) => t.groupId === id).map((t) => t.id)),

  // Bootstrap старой базы: нет workspaces → создаём «Default», все табы уходят в него.
  // Ничего не теряется — это единственное место, где можно повредить чужие данные.
  hydrate: (tabs, activeTabId, tabCounter, workspaces, activeWorkspaceId, tabGroups) =>
    set(() => {
      const list: Workspace[] = workspaces.length > 0
        ? workspaces
        : [{ id: crypto.randomUUID(), name: DEFAULT_WORKSPACE_NAME, createdAt: Date.now() }];
      const known = new Set(list.map((w) => w.id));

      // Таб без workspaceId (легаси) или с указателем на исчезнувший workspace → в первый.
      const withWorkspace = tabs
        .map(normalizeTab)
        .map((t) => (t.workspaceId && known.has(t.workspaceId) ? t : { ...t, workspaceId: list[0].id }));

      // Группы: выкидываем те, чей workspace не дожил. Затем чистим ссылки табов на
      // неизвестные/чужие группы и снимаем группу с закреплённых (инвариант «пин ⊕ группа»).
      // База без groupId/tabGroups — норма, а не повреждение: у всех табов просто нет групп.
      const groupList = tabGroups.filter((g) => known.has(g.workspaceId));
      const byId = new Map(groupList.map((g) => [g.id, g]));
      const normalized = withWorkspace.map((t) => {
        if (!t.groupId) return t;
        const group = byId.get(t.groupId);
        const keep = group && group.workspaceId === t.workspaceId && !t.pinned;
        return keep ? t : { ...t, groupId: undefined };
      });
      const groups = pruneGroups(normalized, groupList);

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
          tabs: arrangeTabs([...normalized, fresh]),
          activeTabId: fresh.id,
          tabCounter: next,
          workspaces: rememberActive(list, activeWs, fresh.id),
          activeWorkspaceId: activeWs,
          tabGroups: groups,
          isHydrated: true,
        };
      }

      return {
        tabs: arrangeTabs(normalized),
        activeTabId: active,
        tabCounter,
        workspaces: rememberActive(list, activeWs, active),
        activeWorkspaceId: activeWs,
        tabGroups: groups,
        isHydrated: true,
      };
    }),
  };
});
