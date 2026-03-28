import { useState, useRef, useEffect, useCallback } from "react";
import { useEditorStore } from "../../store/editorStore";

interface TabBarProps {
  onPresetsToggle: () => void;
  presetsOpen: boolean;
  onAIPromptToggle: () => void;
  aiPromptOpen: boolean;
  onDownloadTab: () => void;
  onExportAll: () => void;
  onImportBackup: () => void;
}

export function TabBar({ onPresetsToggle, presetsOpen, onAIPromptToggle, aiPromptOpen, onDownloadTab, onExportAll, onImportBackup }: TabBarProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const createTab = useEditorStore((s) => s.createTab);
  const renameTab = useEditorStore((s) => s.renameTab);
  const reorderTab = useEditorStore((s) => s.reorderTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    <header className="flex items-center h-10 bg-surface border-b border-border shrink-0 select-none">
      {/* App identity — ultra-compact */}
      <div className="flex items-center gap-1.5 pl-3 pr-2 text-text-muted">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="opacity-50">
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 5h6M5 8h4M5 11h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </div>

      {/* Tab strip */}
      <nav className="flex items-center gap-px flex-1 overflow-x-auto min-w-0 pr-1" role="tablist">
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
        {/* Download current tab as .txt */}
        <button
          onClick={onDownloadTab}
          className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
          aria-label="Download as .txt"
          title="Download as .txt"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 2h5l3 3v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
            <path d="M7 2v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

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

        {/* AI Prompt button */}
        <button
          onClick={onAIPromptToggle}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${aiPromptOpen
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
          onClick={onPresetsToggle}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${presetsOpen
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
      </div>
    </header>
  );
}
