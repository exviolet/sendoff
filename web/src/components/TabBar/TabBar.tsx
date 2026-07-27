import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useEditorStore } from "../../store/editorStore";
import { TAB_GROUP_COLORS } from "../../store/editorStore";
import type { TmuxBinding, OrcaBinding, Tab, TabGroup, TabGroupColor } from "../../store/editorStore";
import type { Theme } from "../../store/themeStore";
import { isTauri } from "../../lib/platform";
import { tabsOf, groupsOf } from "../../lib/tabUtils";
import { toast } from "../../store/toastStore";

type SidePanel = null | "presets" | "settings" | "reference";

interface TabBarProps {
  sidePanel: SidePanel;
  onSidePanelToggle: (panel: SidePanel) => void;
  onDownloadTab: (format: "txt" | "md") => void;
  onExportAll: () => void;
  onImportBackup: () => void;
  theme: Theme;
  onThemeToggle: () => void;
  onCleanupEmptyTabs: () => void;
  onBindTmux: (tabId: string) => void;
  onBindOrca: (tabId: string) => void;
  onMoveTabToWorkspace: (tabId: string) => void;
  onGroupTab: (tabId: string) => void;
  onTriggerPhrases: () => void;
}

function tabsMetaEqual(prev: ReturnType<typeof useEditorStore.getState>["tabs"], next: ReturnType<typeof useEditorStore.getState>["tabs"]) {
  if (prev.length !== next.length) return false;
  return prev.every((tab, i) =>
    tab.id === next[i].id &&
    tab.title === next[i].title &&
    tab.isDirty === next[i].isDirty &&
    tab.pinned === next[i].pinned &&
    // Без workspaceId полоса «замерзает» при переключении workspace / переносе таба.
    tab.workspaceId === next[i].workspaceId &&
    // Без groupId — то же самое при добавлении таба в группу и выносе из неё.
    tab.groupId === next[i].groupId &&
    tab.tmuxBinding?.session === next[i].tmuxBinding?.session &&
    tab.tmuxBinding?.window === next[i].tmuxBinding?.window &&
    tab.orcaBinding?.worktree === next[i].orcaBinding?.worktree &&
    tab.orcaBinding?.titleHint === next[i].orcaBinding?.titleHint
  );
}

export function TabBar({ sidePanel, onSidePanelToggle, onDownloadTab, onExportAll, onImportBackup, theme, onThemeToggle, onCleanupEmptyTabs, onBindTmux, onBindOrca, onMoveTabToWorkspace, onGroupTab, onTriggerPhrases }: TabBarProps) {
  const allTabs = useEditorStore((s) => s.tabs, tabsMetaEqual);
  const activeWorkspaceId = useEditorStore((s) => s.activeWorkspaceId);
  // Имя/цвет/collapsed живут НЕ в табах — на группы нужна отдельная подписка, иначе
  // переименование или сворачивание не перерисует полосу (tabsMetaEqual их не видит).
  const allGroups = useEditorStore((s) => s.tabGroups);
  const toggleTabGroupCollapsed = useEditorStore((s) => s.toggleTabGroupCollapsed);
  const renameTabGroup = useEditorStore((s) => s.renameTabGroup);
  const setTabGroupColor = useEditorStore((s) => s.setTabGroupColor);
  const ungroupTabGroup = useEditorStore((s) => s.ungroupTabGroup);
  const closeTabGroup = useEditorStore((s) => s.closeTabGroup);
  const assignTabToGroup = useEditorStore((s) => s.assignTabToGroup);
  // Изоляция: в полосе — только табы активного workspace.
  const tabs = useMemo(() => tabsOf(allTabs, activeWorkspaceId), [allTabs, activeWorkspaceId]);
  const groups = useMemo(() => groupsOf(allGroups, activeWorkspaceId), [allGroups, activeWorkspaceId]);

  // Полоса рисуется сегментами: подряд идущие табы одной группы — один run под общим
  // чипом (непрерывность гарантирует arrangeTabs), остальные — сами по себе.
  // Свёрнутый run отдаёт только чип: члены живы, но не рисуются.
  const segments = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    const out: { group: TabGroup | null; tabs: Tab[] }[] = [];
    for (const tab of tabs) {
      const group = tab.groupId ? byId.get(tab.groupId) ?? null : null;
      const last = out[out.length - 1];
      if (group && last?.group?.id === group.id) last.tabs.push(tab);
      else out.push({ group, tabs: [tab] });
    }
    return out;
  }, [tabs, groups]);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const createTab = useEditorStore((s) => s.createTab);
  const renameTab = useEditorStore((s) => s.renameTab);
  const reorderTab = useEditorStore((s) => s.reorderTab);
  const closeSavedTabs = useEditorStore((s) => s.closeSavedTabs);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useEditorStore((s) => s.closeTabsToRight);
  const setTabBinding = useEditorStore((s) => s.setTabBinding);
  const setOrcaBinding = useEditorStore((s) => s.setOrcaBinding);
  const togglePin = useEditorStore((s) => s.togglePin);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [groupEditValue, setGroupEditValue] = useState("");
  const [activeOff, setActiveOff] = useState<null | "left" | "right">(null);
  const dragIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ctxMenu && !groupMenu) return;
    function closeAll() { setCtxMenu(null); setGroupMenu(null); }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") closeAll(); }
    document.addEventListener("mousedown", closeAll);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", closeAll);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ctxMenu, groupMenu]);

  function reportClosed(n: number) {
    if (n === 0) toast("Нечего закрывать (несохранённые не трогаются)", "info");
    else toast(`Закрыто: ${n}`, "success");
  }

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  // Доскролл активного таба в зону видимости. inline:"nearest" ничего не делает,
  // если таб уже виден; block:"nearest" — без вертикального сдвига хедера; instant.
  const scrollToActive = useCallback(() => {
    activeTabRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, []);

  // Авто-скролл при переключении таба (Ctrl+Tab, Ctrl+T switcher, создание/закрытие).
  useEffect(() => {
    scrollToActive();
  }, [activeTabId, scrollToActive]);

  // Индикатор «активный таб уехал за край» (ручной скролл колесом, таб не менялся):
  // показываем контекстный шеврон, только когда активный таб не влезает в полосу.
  // IntersectionObserver с root=nav ловит и скролл, и ресайз; async-колбэк не
  // нарушает правило set-state-in-effect.
  useEffect(() => {
    const nav = navRef.current;
    const el = activeTabRef.current;
    if (!nav || !el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= 0.99) { setActiveOff(null); return; }
        const navRect = nav.getBoundingClientRect();
        const elRect = el.getBoundingClientRect();
        setActiveOff(elRect.left < navRect.left ? "left" : "right");
      },
      { root: nav, threshold: [0, 0.99] },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [activeTabId, tabs]);

  // Ctrl+Shift+A → доскролл к активному табу. Локально в TabBar: это DOM-скролл-
  // концерн полосы, не store-действие, поэтому не в централизованный
  // useKeyboardShortcuts. e.code (не e.key) — независимо от раскладки; KeyA свободен.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && !e.altKey && e.code === "KeyA") {
        e.preventDefault();
        scrollToActive();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [scrollToActive]);

  function startRename(id: string, title: string) {
    setEditingId(id);
    setEditValue(title);
  }

  function commitRename() {
    if (editingId && editValue.trim()) {
      renameTab(editingId, editValue.trim());
    }
    setEditingId(null);
  }

  // Всё перетаскивание — по id, без индексов вообще: полоса рисуется сегментами, а
  // члены свёрнутых групп в неё не попадают, поэтому позиция в разметке больше не
  // совпадает ни с индексом видимого списка, ни тем более с глобальным.
  const handleTabDragStart = useCallback((e: React.DragEvent, id: string) => {
    dragIdRef.current = id;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    (e.currentTarget as HTMLElement).style.opacity = "0.4";
  }, []);

  const handleTabDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "";
    dragIdRef.current = null;
    setDragOverId(null);
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIdRef.current !== null && dragIdRef.current !== id) {
      setDragOverId(id);
    }
  }, []);

  const handleTabDrop = useCallback((e: React.DragEvent, toId: string) => {
    e.preventDefault();
    const fromId = dragIdRef.current;
    if (fromId !== null && fromId !== toId) reorderTab(fromId, toId);
    dragIdRef.current = null;
    setDragOverId(null);
  }, [reorderTab]);

  // Отрисовка одного таба. Вынесена из map: таб рисуется и внутри group-run'а, и вне его.
  function renderTab(tab: Tab) {
    const isActive = tab.id === activeTabId;
    const isEditing = tab.id === editingId;
    const isDragTarget = dragOverId === tab.id;

    return (
      <div
        key={tab.id}
        ref={isActive ? activeTabRef : undefined}
        role="tab"
        aria-selected={isActive}
        draggable={!isEditing}
        onClick={() => setActiveTab(tab.id)}
        onDoubleClick={() => startRename(tab.id, tab.title)}
        onAuxClick={(e) => {
          if (e.button === 1) {
            e.preventDefault();
            closeTab(tab.id);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          setCtxMenu({ id: tab.id, x: e.clientX, y: e.clientY });
        }}
        onDragStart={(e) => handleTabDragStart(e, tab.id)}
        onDragEnd={handleTabDragEnd}
        onDragOver={(e) => handleTabDragOver(e, tab.id)}
        onDrop={(e) => handleTabDrop(e, tab.id)}
        className={`
          group relative flex items-center gap-1.5 h-7 px-2.5 rounded-[4px] cursor-pointer
          text-[11px] tracking-wide whitespace-nowrap
          transition-all duration-150 ease-out
          ${isActive
            ? "bg-surface-hover text-text shadow-[inset_0_0_0_1px_rgba(124,110,240,0.15)]"
            : "text-text-muted hover:text-text hover:bg-surface-hover/50"
          }
          ${isDragTarget ? "ring-1 ring-accent/40" : ""}
        `}
      >
        {/* Dirty indicator */}
        {tab.isDirty && (
          <span className="w-1.5 h-1.5 rounded-full bg-dirty shrink-0" />
        )}

        {/* Pinned indicator */}
        {tab.pinned && (
          <span className="shrink-0 text-accent" title="Закреплён">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M5.5 2.5h5l-.8 4 2.3 2.3v1.2H8.7L8 14l-.7-4H4V8.8l2.3-2.3-.8-4z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}

        {/* tmux binding indicator */}
        {tab.tmuxBinding && (
          <span
            className="shrink-0 text-accent"
            title={`tmux → ${tab.tmuxBinding.session}:${tab.tmuxBinding.window}`}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}

        {/* Orca binding indicator (терминал-глиф, отличается от tmux-«линка») */}
        {tab.orcaBinding && (
          <span
            className="shrink-0 text-accent"
            title={`orca → ${tab.orcaBinding.titleHint ?? tab.orcaBinding.worktree}`}
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <path d="M5 6.5L7 8l-2 1.5M8.5 9.5H11" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}

        {/* Title — editable or static */}
        {isEditing ? (
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingId(null);
            }}
            className="bg-transparent outline-none text-text text-[11px] tracking-wide w-20 border-b border-accent"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate max-w-[120px]">{tab.title}</span>
        )}

        {/* Close button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            closeTab(tab.id);
          }}
          className={`
            flex items-center justify-center w-4 h-4 rounded-[3px] shrink-0
            transition-all duration-100
            ${isActive
              ? "opacity-40 hover:opacity-100 hover:bg-danger/20 hover:text-danger"
              : "opacity-0 group-hover:opacity-40 hover:!opacity-100 hover:bg-danger/20 hover:text-danger"
            }
          `}
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <header data-tauri-drag-region className="flex items-center h-10 bg-surface border-b border-border shrink-0 select-none">
      {/* App identity — ultra-compact */}
      <div className="flex items-center gap-1.5 pl-3 pr-2 text-text-muted">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-50">
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Tab strip + контекстный шеврон «к активному табу» */}
      <div className="relative flex items-center flex-1 min-w-0">
      <nav
        ref={navRef}
        className="no-scrollbar flex items-center gap-px w-full overflow-x-auto min-w-0 pr-1"
        role="tablist"
        onWheel={(e) => {
          if (e.deltaY === 0 || e.shiftKey) return;
          const el = e.currentTarget;
          if (el.scrollWidth <= el.clientWidth) return;
          el.scrollLeft += e.deltaY;
        }}
      >
        {segments.map((seg, i) => {
          if (!seg.group) return seg.tabs.map(renderTab);
          const group = seg.group;
          const hasActive = seg.tabs.some((t) => t.id === activeTabId);
          return (
            <div
              key={group.id}
              className={`
                flex items-center gap-px h-8 pl-1 pr-1 rounded-[6px] shrink-0
                ${i > 0 ? "ml-1" : ""}
              `}
              style={{
                // Цвет группы — только фон/обводка. Текст таба остаётся штатным, иначе
                // активный таб перестал бы отличаться от остальных внутри run'а.
                background: `color-mix(in srgb, var(--color-group-${group.color}) 12%, transparent)`,
                boxShadow: `inset 0 0 0 1px color-mix(in srgb, var(--color-group-${group.color}) 30%, transparent)`,
              }}
            >
              <button
                onClick={() => toggleTabGroupCollapsed(group.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setGroupMenu({ id: group.id, x: e.clientX, y: e.clientY });
                }}
                // Дроп на чип кладёт таб в группу — единственный способ попасть в
                // свёрнутую группу мышью (её табов в полосе нет).
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = dragIdRef.current;
                  dragIdRef.current = null;
                  setDragOverId(null);
                  if (id) assignTabToGroup(id, group.id);
                }}
                title={group.collapsed ? `Развернуть «${group.name}»` : `Свернуть «${group.name}»`}
                className="flex items-center gap-1.5 h-6 px-1.5 rounded-[4px] shrink-0 transition-colors duration-100 hover:bg-surface-hover/60"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: `var(--color-group-${group.color})` }}
                />
                {renamingGroupId === group.id ? (
                  <input
                    autoFocus
                    value={groupEditValue}
                    onChange={(e) => setGroupEditValue(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onBlur={() => {
                      if (groupEditValue.trim()) renameTabGroup(group.id, groupEditValue.trim());
                      setRenamingGroupId(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") e.currentTarget.blur();
                      if (e.key === "Escape") setRenamingGroupId(null);
                    }}
                    className="w-20 bg-transparent outline-none text-[10px] tracking-wide border-b"
                    style={{ color: `var(--color-group-${group.color})`, borderColor: `var(--color-group-${group.color})` }}
                  />
                ) : (
                  <span
                    className="truncate max-w-[120px] text-[10px] tracking-wide"
                    style={{ color: `var(--color-group-${group.color})` }}
                  >
                    {group.name}
                  </span>
                )}
                {/* Свёрнутая группа обязана показывать, сколько табов спрятала — иначе
                    они выглядят потерянными. Активный внутри помечаем точкой. */}
                {group.collapsed && (
                  <span className="flex items-center gap-1 shrink-0 text-[9px] text-text-muted tabular-nums">
                    {seg.tabs.length}
                    {hasActive && (
                      <span className="w-1 h-1 rounded-full bg-accent" title="Активный таб внутри" />
                    )}
                  </span>
                )}
              </button>
              {!group.collapsed && seg.tabs.map(renderTab)}
            </div>
          );
        })}

        {/* New tab button */}
        <button
          onClick={createTab}
          className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 shrink-0 ml-0.5"
          aria-label="New tab"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v8M2 6h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      </nav>

        {/* Контекстный шеврон «к активному табу»: виден только когда активный таб
            уехал за край. Градиентный fade у края мягко затемняет крайний таб (не
            перекрывает наглухо); стрелка в сторону активного; клик → доскролл.
            Контейнер pointer-events-none (клики проходят к табам), кнопка — auto. */}
        {activeOff && (
          <div
            className={`absolute top-0 bottom-0 z-10 w-14 flex items-center pointer-events-none ${
              activeOff === "left"
                ? "left-0 justify-start bg-gradient-to-r from-surface via-surface/85 to-transparent"
                : "right-0 justify-end bg-gradient-to-l from-surface via-surface/85 to-transparent"
            }`}
          >
            <button
              onClick={scrollToActive}
              aria-label="Прокрутить к активному табу"
              title="К активному табу (Ctrl+Shift+A)"
              className={`pointer-events-auto flex items-center justify-center h-6 w-5 rounded-[3px] text-accent hover:bg-surface-hover transition-colors duration-100 ${activeOff === "left" ? "ml-0.5" : "mr-0.5"}`}
            >
              {activeOff === "left" ? (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M9.5 4L5.5 8l4 4M12.5 4L8.5 8l4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                  <path d="M6.5 4l4 4-4 4M3.5 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 mr-2 shrink-0">
        {/* Download current tab */}
        <DownloadButton onDownload={onDownloadTab} />

        {/* Export all */}
        <button
          onClick={onExportAll}
          className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
          aria-label="Export all"
          title="Export backup"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v6M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Import backup */}
        <button
          onClick={onImportBackup}
          className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
          aria-label="Import backup"
          title="Import backup"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 8V2M3.5 4.5L6 2l2.5 2.5M2 10h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Settings button */}
        <button
          onClick={() => onSidePanelToggle("settings")}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${sidePanel === "settings"
              ? "text-accent bg-accent/10"
              : "text-text-muted hover:text-text hover:bg-surface-hover"
            }
          `}
          aria-label="Настройки"
          title="Настройки (Ctrl+,)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.8 2.4" />
          </svg>
        </button>

        {/* Theme toggle: dark → light → system → dark */}
        <button
          onClick={onThemeToggle}
          className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
          aria-label={`Тема: ${theme === "dark" ? "тёмная" : theme === "light" ? "светлая" : "системная"}`}
          title={`Тема: ${theme === "dark" ? "тёмная" : theme === "light" ? "светлая" : "системная"} → ${theme === "dark" ? "светлая" : theme === "light" ? "системная" : "тёмная"}`}
        >
          {theme === "light" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          ) : theme === "dark" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7A5.5 5.5 0 1 0 13.5 9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <path d="M6 13.5h4M8 11v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          )}
        </button>

        {/* Reference button */}
        <button
          onClick={() => onSidePanelToggle("reference")}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${sidePanel === "reference"
              ? "text-accent bg-accent/10"
              : "text-text-muted hover:text-text hover:bg-surface-hover"
            }
          `}
          aria-label="Reference"
          title="Reference (Ctrl+R)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 2.5h7.5A1.5 1.5 0 0 1 13 4v9.5l-3-1.7-3 1.7V4A1.5 1.5 0 0 0 5.5 2.5H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4 2.5A1.5 1.5 0 0 0 2.5 4v8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>

        {/* Trigger phrases button */}
        <button
          onClick={onTriggerPhrases}
          className="
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            text-text-muted hover:text-text hover:bg-surface-hover
          "
          aria-label="Фразы-триггеры"
          title="Фразы-триггеры (Ctrl+K)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 4L5.5 9H8l-1 3 3.5-5H8z" fill="currentColor" />
          </svg>
        </button>

        {/* Presets button */}
        <button
          onClick={() => onSidePanelToggle("presets")}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${sidePanel === "presets"
              ? "text-accent bg-accent/10"
              : "text-text-muted hover:text-text hover:bg-surface-hover"
            }
          `}
          aria-label="Presets"
          title="Replace Presets"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>

        {isTauri && <WindowControls />}
      </div>
      {ctxMenu && (
        <TabContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          pinned={tabs.find((t) => t.id === ctxMenu.id)?.pinned ?? false}
          grouped={Boolean(tabs.find((t) => t.id === ctxMenu.id)?.groupId)}
          binding={tabs.find((t) => t.id === ctxMenu.id)?.tmuxBinding ?? null}
          orcaBinding={tabs.find((t) => t.id === ctxMenu.id)?.orcaBinding ?? null}
          onClose={() => setCtxMenu(null)}
          onTogglePin={() => togglePin(ctxMenu.id)}
          onGroupTab={() => onGroupTab(ctxMenu.id)}
          onUngroupTab={() => assignTabToGroup(ctxMenu.id, null)}
          onMoveToWorkspace={() => onMoveTabToWorkspace(ctxMenu.id)}
          onBindTmux={() => onBindTmux(ctxMenu.id)}
          onUnbindTmux={() => setTabBinding(ctxMenu.id, null)}
          onBindOrca={() => onBindOrca(ctxMenu.id)}
          onUnbindOrca={() => setOrcaBinding(ctxMenu.id, null)}
          onCloseTab={() => closeTab(ctxMenu.id)}
          onCloseOthers={() => reportClosed(closeOtherTabs(ctxMenu.id))}
          onCloseRight={() => reportClosed(closeTabsToRight(ctxMenu.id))}
          onCloseSaved={() => reportClosed(closeSavedTabs())}
          onCleanupEmpty={onCleanupEmptyTabs}
        />
      )}
      {groupMenu && (() => {
        const group = groups.find((g) => g.id === groupMenu.id);
        if (!group) return null;
        return (
          <GroupContextMenu
            x={groupMenu.x}
            y={groupMenu.y}
            group={group}
            onClose={() => setGroupMenu(null)}
            onToggleCollapsed={() => toggleTabGroupCollapsed(group.id)}
            onRename={() => {
              setGroupEditValue(group.name);
              setRenamingGroupId(group.id);
            }}
            onColor={(color) => setTabGroupColor(group.id, color)}
            onUngroup={() => ungroupTabGroup(group.id)}
            onCloseGroup={() => reportClosed(closeTabGroup(group.id))}
          />
        );
      })()}
    </header>
  );
}

function GroupContextMenu({
  x, y, group, onClose, onToggleCollapsed, onRename, onColor, onUngroup, onCloseGroup,
}: {
  x: number; y: number;
  group: TabGroup;
  onClose: () => void;
  onToggleCollapsed: () => void;
  onRename: () => void;
  onColor: (color: TabGroupColor) => void;
  onUngroup: () => void;
  onCloseGroup: () => void;
}) {
  const items = [
    { label: group.collapsed ? "Развернуть группу" : "Свернуть группу", action: onToggleCollapsed },
    { label: "Переименовать группу", action: onRename },
    // Расформировать ≠ закрыть: подписи обязаны различаться однозначно, иначе
    // пользователь однажды снесёт табы, думая что просто убирает группировку.
    { label: "Расформировать (табы останутся)", action: onUngroup },
    { label: "Закрыть все табы группы", action: onCloseGroup },
  ];

  return (
    <div
      className="fixed z-50 min-w-[210px] bg-surface border border-border rounded-[6px] shadow-lg overflow-hidden animate-slide-down"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40">
        {TAB_GROUP_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => { onColor(color); onClose(); }}
            title={color}
            className={`w-4 h-4 rounded-full transition-transform hover:scale-110 ${
              group.color === color ? "ring-2 ring-offset-1 ring-offset-surface ring-text-muted/50" : ""
            }`}
            style={{ background: `var(--color-group-${color})` }}
          />
        ))}
      </div>
      {items.map((it) => (
        <button
          key={it.label}
          onClick={() => { it.action(); onClose(); }}
          className="flex items-center w-full px-3 py-1.5 text-[11px] tracking-wide text-text-muted hover:text-text hover:bg-surface-hover transition-colors whitespace-nowrap"
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function TabContextMenu({
  x, y, pinned, grouped, binding, orcaBinding, onClose, onTogglePin, onGroupTab, onUngroupTab, onMoveToWorkspace, onBindTmux, onUnbindTmux, onBindOrca, onUnbindOrca, onCloseTab, onCloseOthers, onCloseRight, onCloseSaved, onCleanupEmpty,
}: {
  x: number; y: number;
  pinned: boolean;
  grouped: boolean;
  binding: TmuxBinding | null;
  orcaBinding: OrcaBinding | null;
  onClose: () => void;
  onTogglePin: () => void;
  onGroupTab: () => void;
  onUngroupTab: () => void;
  onMoveToWorkspace: () => void;
  onBindTmux: () => void;
  onUnbindTmux: () => void;
  onBindOrca: () => void;
  onUnbindOrca: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
  onCloseSaved: () => void;
  onCleanupEmpty: () => void;
}) {
  const tmuxItems = binding
    ? [
        { label: "Перепривязать к tmux-окну…", action: onBindTmux },
        { label: `Отвязать от tmux (${binding.window})`, action: onUnbindTmux },
      ]
    : [{ label: "Привязать к tmux-окну…", action: onBindTmux }];

  const orcaItems = orcaBinding
    ? [
        { label: "Перепривязать к Orca-агенту…", action: onBindOrca },
        { label: `Отвязать от Orca (${orcaBinding.titleHint ?? orcaBinding.worktree})`, action: onUnbindOrca },
      ]
    : [{ label: "Привязать к Orca-агенту…", action: onBindOrca }];

  const closeItems = [
    { label: "Закрыть", action: onCloseTab, shortcut: "Ctrl+W" },
    { label: "Закрыть остальные", action: onCloseOthers },
    { label: "Закрыть справа", action: onCloseRight },
    { label: "Закрыть все сохранённые", action: onCloseSaved },
    { label: "Закрыть пустые", action: onCleanupEmpty },
  ];

  function renderItem(it: { label: string; action: () => void; shortcut?: string }) {
    return (
      <button
        key={it.label}
        onClick={() => { it.action(); onClose(); }}
        className="flex items-center justify-between w-full px-3 py-1.5 text-[11px] tracking-wide text-text-muted hover:text-text hover:bg-surface-hover transition-colors whitespace-nowrap"
      >
        <span>{it.label}</span>
        {it.shortcut && (
          <kbd className="text-[10px] text-text-muted/60 font-mono ml-4">{it.shortcut}</kbd>
        )}
      </button>
    );
  }

  return (
    <div
      className="fixed z-50 min-w-[200px] bg-surface border border-border rounded-[6px] shadow-lg overflow-hidden animate-slide-down"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="border-b border-border/40">
        {renderItem({
          // Пин и группа взаимоисключимы: подсказываем это прямо в подписи, чтобы
          // «таб выпрыгнул из группы» не выглядело сбоем (tasks/14, решение 1).
          label: pinned ? "Открепить таб" : grouped ? "Закрепить таб (выйдет из группы)" : "Закрепить таб",
          action: onTogglePin,
          shortcut: "Ctrl+P",
        })}
        {renderItem({ label: "В группу…", action: onGroupTab, shortcut: "Ctrl+G" })}
        {grouped && renderItem({ label: "Убрать из группы", action: onUngroupTab })}
        {renderItem({ label: "Переместить в workspace…", action: onMoveToWorkspace })}
      </div>
      <div className="border-b border-border/40">{tmuxItems.map(renderItem)}</div>
      <div className="border-b border-border/40">{orcaItems.map(renderItem)}</div>
      {closeItems.map(renderItem)}
    </div>
  );
}

function WindowControls() {
  const handleMinimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().minimize();
  };
  const handleMaximize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().toggleMaximize();
  };
  const handleClose = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  };

  return (
    <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-border/50">
      <button
        onClick={handleMinimize}
        className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
        aria-label="Minimize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        onClick={handleMaximize}
        className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
        aria-label="Maximize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="2" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button
        onClick={handleClose}
        className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-150"
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function DownloadButton({ onDownload }: { onDownload: (format: "txt" | "md") => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
        aria-label="Download"
        title="Download"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2h5l3 3v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
          <path d="M7 2v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-[6px] shadow-lg z-50 overflow-hidden animate-slide-down">
          <button
            onClick={() => { onDownload("txt"); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] tracking-wide text-text-muted hover:text-text hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            <span className="text-text-muted/60">.txt</span>
            <span>Текстовый файл</span>
          </button>
          <button
            onClick={() => { onDownload("md"); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] tracking-wide text-text-muted hover:text-text hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            <span className="text-text-muted/60">.md</span>
            <span>Markdown</span>
          </button>
        </div>
      )}
    </div>
  );
}
