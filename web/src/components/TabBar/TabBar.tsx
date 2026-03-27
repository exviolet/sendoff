import { useState, useRef, useEffect } from "react";
import { useEditorStore } from "../../store/editorStore";

interface TabBarProps {
  onPresetsToggle: () => void;
  presetsOpen: boolean;
  onExportAll: () => void;
  onImportBackup: () => void;
}

export function TabBar({ onPresetsToggle, presetsOpen, onExportAll, onImportBackup }: TabBarProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const createTab = useEditorStore((s) => s.createTab);
  const renameTab = useEditorStore((s) => s.renameTab);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
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
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = tab.id === editingId;

          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActiveTab(tab.id)}
              onDoubleClick={() => startRename(tab.id, tab.title)}
              className={`
                group relative flex items-center gap-1.5 h-7 px-2.5 rounded-[4px] cursor-pointer
                text-[11px] tracking-wide whitespace-nowrap
                transition-all duration-150 ease-out
                ${isActive
                  ? "bg-surface-hover text-text shadow-[inset_0_0_0_1px_rgba(124,110,240,0.15)]"
                  : "text-text-muted hover:text-text hover:bg-surface-hover/50"
                }
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
