import { useCallback, useMemo, useState } from "react";
import { useEditorStore, type Workspace } from "../../store/editorStore";
import { tabsOf } from "../../lib/tabUtils";
import { usePickerModal } from "../../hooks/usePickerModal";
import { PickerModal, PickerHeader, PickerHint } from "../PickerModal/PickerModal";

interface WorkspaceSwitcherProps {
  onClose: () => void;
  // "switch" — переключить активный workspace; "move" — выбрать целевой для переноса таба.
  mode: "switch" | "move";
  onPick: (workspaceId: string) => void;
}

export function WorkspaceSwitcher({ onClose, mode, onPick }: WorkspaceSwitcherProps) {
  const workspaces = useEditorStore((s) => s.workspaces);
  const tabs = useEditorStore((s) => s.tabs);
  const activeWorkspaceId = useEditorStore((s) => s.activeWorkspaceId);
  const createWorkspace = useEditorStore((s) => s.createWorkspace);

  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const w of workspaces) map.set(w.id, tabsOf(tabs, w.id).length);
    return map;
  }, [workspaces, tabs]);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workspaces;
    return workspaces.filter((w) => w.name.toLowerCase().includes(needle));
  }, [workspaces, query]);

  // В switch-режиме под списком есть строка «создать» — она валидна, только когда
  // введено имя, не совпадающее с существующим.
  const trimmed = query.trim();
  const canCreate =
    mode === "switch" &&
    trimmed.length > 0 &&
    !workspaces.some((w) => w.name.toLowerCase() === trimmed.toLowerCase());
  const createIndex = canCreate ? rows.length : -1;
  const total = rows.length + (canCreate ? 1 : 0);

  const pick = useCallback(
    (index: number) => {
      if (index === createIndex) {
        createWorkspace(trimmed);
        onClose();
        return;
      }
      const row: Workspace | undefined = rows[index];
      if (row) onPick(row.id);
    },
    [createIndex, createWorkspace, trimmed, onClose, rows, onPick],
  );

  // Стартуем на активном workspace (switch-режим).
  const initialIndex = mode === "switch" ? Math.max(0, workspaces.findIndex((w) => w.id === activeWorkspaceId)) : 0;

  const { selectedIndex, setSelectedIndex, inputRef, listRef } = usePickerModal({
    count: total,
    onEnter: pick,
    onClose,
    initialIndex,
  });

  return (
    <PickerModal
      onClose={onClose}
      width="min(94vw, 560px)"
      footer={
        <PickerHint>
          <span>↑↓ navigate</span>
          <span>↵ {mode === "move" ? "move" : "switch"}</span>
          <span>Esc close</span>
        </PickerHint>
      }
    >
      <PickerHeader
        inputRef={inputRef}
        value={query}
        onChange={(v) => {
          setQuery(v);
          setSelectedIndex(0);
        }}
        placeholder={mode === "move" ? "Move tab to a workspace..." : "Switch workspace or create..."}
        prefix={<span className="text-[11px] font-mono text-accent shrink-0">workspace</span>}
        suffix={<span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">{rows.length}</span>}
      />

      <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1">
        {rows.length === 0 && !canCreate && (
          <div className="px-4 py-10 text-center text-xs text-text-muted/60">No matches</div>
        )}

        {rows.map((row, index) => {
          const selected = index === selectedIndex;
          const isActive = row.id === activeWorkspaceId;
          return (
            <button
              key={row.id}
              data-picker-index={index}
              onClick={() => pick(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`
                w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-left transition-colors duration-75
                ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
              `}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-accent" : "bg-border"}`}
              />
              <span className="min-w-0 flex items-center gap-2">
                <span className="truncate text-[12px] text-text">{row.name}</span>
                {isActive && <span className="shrink-0 text-[9px] text-accent">active</span>}
              </span>
              <span className="text-[10px] text-text-muted/45 tabular-nums">
                {counts.get(row.id) ?? 0}
              </span>
            </button>
          );
        })}

        {canCreate && (
          <button
            data-picker-index={createIndex}
            onClick={() => pick(createIndex)}
            onMouseEnter={() => setSelectedIndex(createIndex)}
            className={`
              w-full flex items-center gap-3 px-4 py-2 text-left border-t border-border/40 transition-colors duration-75
              ${selectedIndex === createIndex ? "bg-accent/10" : "hover:bg-surface-hover/50"}
            `}
          >
            <span className="text-accent text-[13px] leading-none">+</span>
            <span className="truncate text-[12px] text-text">
              New workspace “{trimmed}”
            </span>
          </button>
        )}
      </div>
    </PickerModal>
  );
}
