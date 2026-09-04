import { useState, useRef, useEffect, useCallback, useMemo, type ReactNode, type RefObject } from "react";
import { useEditorStore } from "../../store/editorStore";
import { TAB_GROUP_COLORS, TAB_GROUP_COLOR_LABELS } from "../../store/editorStore";
import type { Tab, TabBinding, TabGroup, TabGroupColor } from "../../store/editorStore";
import { describeBinding } from "../../lib/terminalTargets";
import { tabsOf, groupsOf } from "../../lib/tabUtils";
import { toast } from "../../store/toastStore";

interface TabBarProps {
  onCleanupEmptyTabs: () => void;
  onBindTarget: (tabId: string) => void;
  onMoveTabToWorkspace: (tabId: string) => void;
  onGroupTab: (tabId: string) => void;
  activeTabRef: RefObject<HTMLDivElement | null>;
  // Правый край шапки приходит слотом: полоса табов о нём ничего не знает, а App
  // и так держит все его обработчики — гонять их сквозь TabBar незачем.
  toolbar: ReactNode;
}

// Дескрипторы разной формы — сводим к строке, чтобы сравнение не зависело от источника.
function bindingKey(binding: TabBinding | undefined): string {
  return binding ? describeBinding(binding) : "";
}

function tabsMetaEqual(prev: ReturnType<typeof useEditorStore.getState>["tabs"], next: ReturnType<typeof useEditorStore.getState>["tabs"]) {
  if (prev.length !== next.length) return false;
  return prev.every((tab, i) =>
    tab.id === next[i].id &&
    tab.title === next[i].title &&
    tab.pinned === next[i].pinned &&
    // Без workspaceId полоса «замерзает» при переключении workspace / переносе таба.
    tab.workspaceId === next[i].workspaceId &&
    // Без groupId — то же самое при добавлении таба в группу и выносе из неё.
    tab.groupId === next[i].groupId &&
    // Одна привязка вместо трёх. Поле влияет на отрисовку полосы, поэтому обязано
    // быть здесь: без него полоса молча «замерзает» (так уже было с orcaBinding,
    // workspaceId и groupId).
    bindingKey(tab.binding) === bindingKey(next[i].binding)
  );
}

export function TabBar({ onCleanupEmptyTabs, onBindTarget, onMoveTabToWorkspace, onGroupTab, activeTabRef, toolbar }: TabBarProps) {
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
  const assignTabsToGroup = useEditorStore((s) => s.assignTabsToGroup);
  const reorderTabGroup = useEditorStore((s) => s.reorderTabGroup);
  const selectedTabIds = useEditorStore((s) => s.selectedTabIds);
  const toggleTabSelection = useEditorStore((s) => s.toggleTabSelection);
  const clearTabSelection = useEditorStore((s) => s.clearTabSelection);
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
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useEditorStore((s) => s.closeTabsToRight);
  const setTabBinding = useEditorStore((s) => s.setTabBinding);

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
  // Тащим группу целиком — держим отдельно от dragIdRef: у дропа разные обработчики,
  // и перепутать «таб внутрь группы» с «группа к позиции» нельзя.
  const dragGroupIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Bulk-close теперь только СПРАШИВАЕТ: 0 — молча сообщаем, иначе показывается
  // диалог, и тост про результат печатает уже он (App).
  function reportRequested(n: number) {
    if (n === 0) toast("Nothing to close", "info");
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
  }, [activeTabRef]);

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
  }, [activeTabId, tabs, activeTabRef]);

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
    // Группа имеет приоритет: если тащили run, бросок на таб перемещает всю группу,
    // а не сводит её к одному табу.
    const groupId = dragGroupIdRef.current;
    if (groupId) {
      reorderTabGroup(groupId, toId);
    } else {
      const fromId = dragIdRef.current;
      if (fromId !== null && fromId !== toId) reorderTab(fromId, toId);
    }
    dragIdRef.current = null;
    dragGroupIdRef.current = null;
    setDragOverId(null);
  }, [reorderTab, reorderTabGroup]);

  // Отрисовка одного таба. Вынесена из map: таб рисуется и внутри group-run'а, и вне его.
  function renderTab(tab: Tab) {
    const isActive = tab.id === activeTabId;
    const isEditing = tab.id === editingId;
    const isDragTarget = dragOverId === tab.id;
    const isSelected = selectedTabIds.includes(tab.id);

    return (
      <div
        key={tab.id}
        ref={isActive ? activeTabRef : undefined}
        role="tab"
        aria-selected={isActive}
        draggable={!isEditing}
        onClick={(e) => {
          // Ctrl+клик набирает выделение и НЕ переключает активный таб: иначе каждый
          // клик утаскивал бы редактор на другой таб посреди набора пачки.
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleTabSelection(tab.id);
            return;
          }
          clearTabSelection();
          setActiveTab(tab.id);
        }}
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
          ${isSelected ? "ring-1 ring-accent bg-accent/10" : ""}
          ${isDragTarget ? "ring-1 ring-accent/40" : ""}
        `}
      >
        {/* Pinned indicator */}
        {tab.pinned && (
          <span className="shrink-0 text-accent" title="Pinned">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
              <path d="M5.5 2.5h5l-.8 4 2.3 2.3v1.2H8.7L8 14l-.7-4H4V8.8l2.3-2.3-.8-4z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}

        {/* Привязка к терминалу: один индикатор на все источники (они взаимоисключимы) */}
        {tab.binding && (
          <span className="shrink-0 text-accent" title={describeBinding(tab.binding)}>
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
              // Тащим run за чип (см. draggable ниже): группа переезжает целиком, порядок
              // внутри сохраняется. Дроп ловят табы и чипы других групп.
              onDragOver={(e) => { if (dragGroupIdRef.current) e.preventDefault(); }}
              onDrop={(e) => {
                const dragged = dragGroupIdRef.current;
                if (!dragged || dragged === group.id) return;
                e.preventDefault();
                e.stopPropagation();
                const first = seg.tabs[0];
                dragGroupIdRef.current = null;
                setDragOverId(null);
                if (first) reorderTabGroup(dragged, first.id);
              }}
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
                draggable={renamingGroupId !== group.id}
                onDragStart={(e) => {
                  dragGroupIdRef.current = group.id;
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData("text/plain", group.id);
                }}
                onDragEnd={() => { dragGroupIdRef.current = null; setDragOverId(null); }}
                onClick={() => toggleTabGroupCollapsed(group.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setGroupMenu({ id: group.id, x: e.clientX, y: e.clientY });
                }}
                // Дроп на чип кладёт таб в группу — единственный способ попасть в
                // свёрнутую группу мышью (её табов в полосе нет).
                onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                onDrop={(e) => {
                  // Тащат группу — это дело контейнера (перестановка run'ов), чип не
                  // вмешивается: иначе группа «легла бы внутрь себя».
                  if (dragGroupIdRef.current) return;
                  e.preventDefault();
                  const id = dragIdRef.current;
                  dragIdRef.current = null;
                  setDragOverId(null);
                  if (id) assignTabToGroup(id, group.id);
                }}
                title={group.collapsed ? `Expand “${group.name}”` : `Collapse “${group.name}”`}
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
                      <span className="w-1 h-1 rounded-full bg-accent" title="Active tab inside" />
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
              aria-label="Scroll to active tab"
              title="Scroll to active tab (Ctrl+Shift+A)"
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

      {toolbar}
      {ctxMenu && (
        <TabContextMenu
          x={ctxMenu.x}
          y={ctxMenu.y}
          pinned={tabs.find((t) => t.id === ctxMenu.id)?.pinned ?? false}
          grouped={Boolean(tabs.find((t) => t.id === ctxMenu.id)?.groupId)}
          // Пачка применяется, только если ПКМ пришёлся по выделенному табу: клик по
          // невыделенному — обычное одиночное действие, иначе меню молча трогало бы
          // не то, на что нажали.
          selectedCount={selectedTabIds.includes(ctxMenu.id) ? selectedTabIds.length : 0}
          binding={tabs.find((t) => t.id === ctxMenu.id)?.binding ?? null}
          onClose={() => setCtxMenu(null)}
          onTogglePin={() => togglePin(ctxMenu.id)}
          onGroupTab={() => onGroupTab(ctxMenu.id)}
          onUngroupTab={() => {
            if (selectedTabIds.includes(ctxMenu.id)) assignTabsToGroup(selectedTabIds, null);
            else assignTabToGroup(ctxMenu.id, null);
          }}
          onMoveToWorkspace={() => onMoveTabToWorkspace(ctxMenu.id)}
          onBindTarget={() => onBindTarget(ctxMenu.id)}
          onUnbindTarget={() => setTabBinding(ctxMenu.id, null)}
          onCloseTab={() => closeTab(ctxMenu.id)}
          onCloseOthers={() => reportRequested(closeOtherTabs(ctxMenu.id))}
          onCloseRight={() => reportRequested(closeTabsToRight(ctxMenu.id))}
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
            onCloseGroup={() => reportRequested(closeTabGroup(group.id))}
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
    { label: group.collapsed ? "Expand group" : "Collapse group", action: onToggleCollapsed },
    { label: "Rename group", action: onRename },
    // Расформировать ≠ закрыть: подписи обязаны различаться однозначно, иначе
    // пользователь однажды снесёт табы, думая что просто убирает группировку.
    { label: "Disband (tabs stay)", action: onUngroup },
    { label: "Close all tabs in group", action: onCloseGroup },
  ];

  return (
    <div
      className="fixed z-50 min-w-[210px] bg-surface border border-border rounded-[6px] shadow-lg overflow-hidden animate-slide-down"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Сетка, а не ряд: двенадцать кружков в строку растянули бы меню шире табов.
          6×2 — ширина совпадает с прежней однорядной палитрой из шести. */}
      <div className="grid grid-cols-6 gap-1.5 px-3 py-2 border-b border-border/40">
        {TAB_GROUP_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => { onColor(color); onClose(); }}
            title={TAB_GROUP_COLOR_LABELS[color]}
            aria-label={TAB_GROUP_COLOR_LABELS[color]}
            aria-pressed={group.color === color}
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
  x, y, pinned, grouped, selectedCount, binding, onClose, onTogglePin, onGroupTab, onUngroupTab, onMoveToWorkspace, onBindTarget, onUnbindTarget, onCloseTab, onCloseOthers, onCloseRight, onCleanupEmpty,
}: {
  x: number; y: number;
  pinned: boolean;
  grouped: boolean;
  // 0 = действуем на один таб; >1 = на выделенную пачку (подписи это показывают).
  selectedCount: number;
  binding: TabBinding | null;
  onClose: () => void;
  onTogglePin: () => void;
  onGroupTab: () => void;
  onUngroupTab: () => void;
  onMoveToWorkspace: () => void;
  onBindTarget: () => void;
  onUnbindTarget: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
  onCleanupEmpty: () => void;
}) {
  const targetItems = binding
    ? [
        { label: "Rebind to terminal…", action: onBindTarget },
        { label: `Unbind (${describeBinding(binding)})`, action: onUnbindTarget },
      ]
    : [{ label: "Bind to terminal…", action: onBindTarget }];

  const closeItems = [
    { label: "Close", action: onCloseTab, shortcut: "Ctrl+W" },
    { label: "Close others", action: onCloseOthers },
    { label: "Close to the right", action: onCloseRight },
    { label: "Close empty", action: onCleanupEmpty },
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
          label: pinned ? "Unpin tab" : grouped ? "Pin tab (leaves the group)" : "Pin tab",
          action: onTogglePin,
          shortcut: "Ctrl+P",
        })}
        {renderItem({
          label: selectedCount > 1 ? `Add to group… (${selectedCount} tabs)` : "Add to group…",
          action: onGroupTab,
          shortcut: "Ctrl+G",
        })}
        {grouped && renderItem({
          label: selectedCount > 1 ? `Remove from group (${selectedCount})` : "Remove from group",
          action: onUngroupTab,
        })}
        {renderItem({
          label: selectedCount > 1
            ? `Move to workspace… (${selectedCount} tabs)`
            : "Move to workspace…",
          action: onMoveToWorkspace,
        })}
      </div>
      <div className="border-b border-border/40">{targetItems.map(renderItem)}</div>
      {closeItems.map(renderItem)}
    </div>
  );
}
