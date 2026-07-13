import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore, type Workspace } from "../../store/editorStore";
import { tabsOf } from "../../lib/tabUtils";

// Намеренно повторяет структуру OrcaTargetPicker / TmuxTargetPicker: паттерн
// «модалка-список» дублируется пятью компонентами, извлечение общего примитива
// отложено (см. GitHub issue #9). Не изобретать свой каркас — чтобы будущее
// извлечение осталось механическим.

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
  // Стартуем на активном workspace (switch-режим). Ленивый инициализатор, а не эффект:
  // модалка монтируется заново при каждом открытии, а setState в эффекте запрещён
  // правилом react-hooks/set-state-in-effect (React Compiler).
  const [selectedIndex, setSelectedIndex] = useState(() => {
    if (mode !== "switch") return 0;
    const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
    return idx >= 0 ? idx : 0;
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (total > 0) setSelectedIndex((i) => Math.min(i + 1, total - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        pick(selectedIndex);
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, pick, total, selectedIndex]);

  useEffect(() => {
    const item = listRef.current?.querySelector(
      `[data-row-index="${selectedIndex}"]`,
    ) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-[min(94vw,560px)] bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-[11px] font-mono text-accent shrink-0">workspace</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={
              mode === "move" ? "Переместить таб в workspace..." : "Переключить workspace или создать..."
            }
            className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-muted/50"
          />
          <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">{rows.length}</span>
        </div>

        <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1">
          {rows.length === 0 && !canCreate && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">Ничего не найдено</div>
          )}

          {rows.map((row, index) => {
            const selected = index === selectedIndex;
            const isActive = row.id === activeWorkspaceId;
            return (
              <button
                key={row.id}
                data-row-index={index}
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
              data-row-index={createIndex}
              onClick={() => pick(createIndex)}
              onMouseEnter={() => setSelectedIndex(createIndex)}
              className={`
                w-full flex items-center gap-3 px-4 py-2 text-left border-t border-border/40 transition-colors duration-75
                ${selectedIndex === createIndex ? "bg-accent/10" : "hover:bg-surface-hover/50"}
              `}
            >
              <span className="text-accent text-[13px] leading-none">+</span>
              <span className="truncate text-[12px] text-text">
                Новый workspace «{trimmed}»
              </span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted/50">
          <span>↑↓ навигация</span>
          <span>↵ {mode === "move" ? "переместить" : "переключить"}</span>
          <span>Esc закрыть</span>
        </div>
      </div>
    </div>
  );
}
