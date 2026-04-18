import { useState, useRef, useEffect, useCallback } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { Theme } from "../../store/themeStore";
import { isTauri } from "../../lib/platform";
import { toast } from "../../store/toastStore";

type SidePanel = null | "presets" | "ai" | "settings";

interface TabBarProps {
  sidePanel: SidePanel;
  onSidePanelToggle: (panel: SidePanel) => void;
  onDownloadTab: (format: "txt" | "md") => void;
  onExportAll: () => void;
  onImportBackup: () => void;
  theme: Theme;
  onThemeToggle: () => void;
}

function tabsMetaEqual(prev: ReturnType<typeof useEditorStore.getState>["tabs"], next: ReturnType<typeof useEditorStore.getState>["tabs"]) {
  if (prev.length !== next.length) return false;
  return prev.every((tab, i) =>
    tab.id === next[i].id &&
    tab.title === next[i].title &&
    tab.isDirty === next[i].isDirty
  );
}

export function TabBar({ sidePanel, onSidePanelToggle, onDownloadTab, onExportAll, onImportBackup, theme, onThemeToggle }: TabBarProps) {
  const tabs = useEditorStore((s) => s.tabs, tabsMetaEqual);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const createTab = useEditorStore((s) => s.createTab);
  const renameTab = useEditorStore((s) => s.renameTab);
  const reorderTab = useEditorStore((s) => s.reorderTab);
  const closeSavedTabs = useEditorStore((s) => s.closeSavedTabs);
  const closeOtherTabs = useEditorStore((s) => s.closeOtherTabs);
  const closeTabsToRight = useEditorStore((s) => s.closeTabsToRight);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!ctxMenu) return;
    function handleClick() { setCtxMenu(null); }
    function handleKey(e: KeyboardEvent) { if (e.key === "Escape") setCtxMenu(null); }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [ctxMenu]);

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

  const handleTabDragStart = useCallback((e: React.DragEvent, index: number) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    (e.currentTarget as HTMLElement).style.opacity = "0.4";
  }, []);

  const handleTabDragEnd = useCallback((e: React.DragEvent) => {
    (e.currentTarget as HTMLElement).style.opacity = "";
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const handleTabDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragIndexRef.current !== null && dragIndexRef.current !== index) {
      setDragOverIndex(index);
    }
  }, []);

  const handleTabDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderTab(fromIndex, toIndex);
    }
    dragIndexRef.current = null;
    setDragOverIndex(null);
  }, [reorderTab]);

  return (
    <header data-tauri-drag-region className="flex items-center h-10 bg-surface border-b border-border shrink-0 select-none">
      {/* App identity — ultra-compact */}
      <div className="flex items-center gap-1.5 pl-3 pr-2 text-text-muted">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-50">
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Tab strip */}
      <nav
        className="no-scrollbar flex items-center gap-px flex-1 overflow-x-auto min-w-0 pr-1"
        role="tablist"
        onWheel={(e) => {
          if (e.deltaY === 0 || e.shiftKey) return;
          const el = e.currentTarget;
          if (el.scrollWidth <= el.clientWidth) return;
          el.scrollLeft += e.deltaY;
        }}
      >
        {tabs.map((tab, index) => {
          const isActive = tab.id === activeTabId;
          const isEditing = tab.id === editingId;
          const isDragTarget = dragOverIndex === index;

          return (
            <div
              key={tab.id}
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
              onDragStart={(e) => handleTabDragStart(e, index)}
              onDragEnd={handleTabDragEnd}
              onDragOver={(e) => handleTabDragOver(e, index)}
              onDrop={(e) => handleTabDrop(e, index)}
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

        {/* AI Prompt button */}
        <button
          onClick={() => onSidePanelToggle("ai")}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${sidePanel === "ai"
              ? "text-accent bg-accent/10"
              : "text-text-muted hover:text-text hover:bg-surface-hover"
            }
          `}
          aria-label="AI Prompt"
          title="AI Prompt (Ctrl+K)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M8 2L3 8l5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M8 2l5 6-5 6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
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
          onClose={() => setCtxMenu(null)}
          onCloseTab={() => closeTab(ctxMenu.id)}
          onCloseOthers={() => reportClosed(closeOtherTabs(ctxMenu.id))}
          onCloseRight={() => reportClosed(closeTabsToRight(ctxMenu.id))}
          onCloseSaved={() => reportClosed(closeSavedTabs())}
        />
      )}
    </header>
  );
}

function TabContextMenu({
  x, y, onClose, onCloseTab, onCloseOthers, onCloseRight, onCloseSaved,
}: {
  x: number; y: number;
  onClose: () => void;
  onCloseTab: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
  onCloseSaved: () => void;
}) {
  const items = [
    { label: "Закрыть", action: onCloseTab, shortcut: "Ctrl+W" },
    { label: "Закрыть остальные", action: onCloseOthers },
    { label: "Закрыть справа", action: onCloseRight },
    { label: "Закрыть все сохранённые", action: onCloseSaved },
  ];
  return (
    <div
      className="fixed z-50 min-w-[200px] bg-surface border border-border rounded-[6px] shadow-lg overflow-hidden animate-slide-down"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {items.map((it) => (
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
      ))}
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
