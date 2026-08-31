import { useCallback, useEffect, useMemo, useState } from "react";
import { useEditorStore, type Workspace } from "../../store/editorStore";
import { tabsOf } from "../../lib/tabUtils";
import { toast } from "../../store/toastStore";
import { usePickerModal, type PickerKeyContext } from "../../hooks/usePickerModal";
import { PickerModal, PickerHeader, PickerHint } from "../PickerModal/PickerModal";

interface WorkspaceSwitcherProps {
  onClose: () => void;
  // "switch" — переключить активный workspace; "move" — выбрать целевой для переноса таба.
  mode: "switch" | "move";
  onPick: (workspaceId: string) => void;
  // Открыть сразу на правке этого workspace (палитра: rename/delete над активным).
  initialEdit?: string;
}

// Список и правка — два вида ОДНОЙ модалки, как в TriggerPhrasePicker. Отдельный
// ConfirmDialog поверх пикера не нужен: он клал диалог на диалог и заставлял оба
// слушателя клавиш договариваться о том, кто владеет Enter/Esc.
type View = "list" | "edit";

export function WorkspaceSwitcher({ onClose, mode, onPick, initialEdit }: WorkspaceSwitcherProps) {
  const workspaces = useEditorStore((s) => s.workspaces);
  const tabs = useEditorStore((s) => s.tabs);
  const tabGroups = useEditorStore((s) => s.tabGroups);
  const activeWorkspaceId = useEditorStore((s) => s.activeWorkspaceId);
  const createWorkspace = useEditorStore((s) => s.createWorkspace);
  const renameWorkspace = useEditorStore((s) => s.renameWorkspace);
  const deleteWorkspace = useEditorStore((s) => s.deleteWorkspace);

  const [query, setQuery] = useState("");
  const [view, setView] = useState<View>(initialEdit ? "edit" : "list");
  const [editingId, setEditingId] = useState<string | null>(initialEdit ?? null);
  const [editName, setEditName] = useState(
    () => workspaces.find((w) => w.id === initialEdit)?.name ?? "",
  );
  // Удаление уносит табы, но стирает группы — второй клик, а не диалог поверх.
  const [armed, setArmed] = useState(false);

  // В move-режиме идёт выбор адресата переноса — правка чужих workspace тут не при чём.
  const canEdit = mode === "switch";

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

  const startEdit = useCallback(
    (index: number) => {
      const row = rows[index];
      if (!row) return; // строка «создать» сюда не проходит
      setEditingId(row.id);
      setEditName(row.name);
      setArmed(false);
      setView("edit");
    },
    [rows],
  );

  const backToList = useCallback(() => {
    setView("list");
    setEditingId(null);
    setArmed(false);
  }, []);

  // Клавиши сверх дефолтной навигации примитива. Гасим их сами (true) — примитив
  // про них не знает. Ctrl+Backspace не трогаем: это «удалить слово» в инпуте.
  const onKeyDown = useCallback(
    (e: KeyboardEvent, { index }: PickerKeyContext) => {
      if (!canEdit) return false;
      if (e.key === "F2") {
        e.preventDefault();
        e.stopPropagation();
        startEdit(index);
        return true;
      }
      return false;
    },
    [canEdit, startEdit],
  );

  const { selectedIndex, setSelectedIndex, inputRef, listRef } = usePickerModal({
    count: total,
    onEnter: pick,
    onClose,
    onKeyDown,
    // В правке стрелки и Enter обязаны быть нативными (ввод в поле имени), а Esc
    // должен возвращать в список, а не закрывать модалку — см. слушатель ниже.
    disabled: view !== "list",
    // Стартуем на активном workspace (switch-режим).
    initialIndex:
      mode === "switch" ? Math.max(0, workspaces.findIndex((w) => w.id === activeWorkspaceId)) : 0,
  });

  // Esc в правке — «назад», не «закрыть». Примитив в этот момент отключён.
  useEffect(() => {
    if (view === "list") return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      backToList();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [view, backToList]);

  // Возврат из правки — фокус обратно в поиск (примитив фокусирует только на маунте).
  useEffect(() => {
    if (view === "list") inputRef.current?.focus();
  }, [view, inputRef]);

  const editing = editingId ? workspaces.find((w) => w.id === editingId) : undefined;
  const canDelete = workspaces.length > 1;
  // Тот же адресат, что выберет deleteWorkspace: первый оставшийся.
  const moveTarget = editing ? workspaces.find((w) => w.id !== editing.id) : undefined;
  const editTabCount = editing ? (counts.get(editing.id) ?? 0) : 0;
  const editGroupCount = editing
    ? tabGroups.filter((g) => g.workspaceId === editing.id).length
    : 0;

  const save = useCallback(() => {
    const name = editName.trim();
    if (!editing || !name || name === editing.name) {
      backToList();
      return;
    }
    renameWorkspace(editing.id, name);
    backToList();
  }, [editName, editing, renameWorkspace, backToList]);

  const remove = useCallback(() => {
    if (!editing || !canDelete) return;
    if (!armed) {
      setArmed(true);
      return;
    }
    const name = editing.name;
    deleteWorkspace(editing.id);
    // Список стал короче — сдвигаем курсор внутрь него, иначе он повиснет за концом
    // (примитив клампит индекс только на ArrowDown).
    setSelectedIndex((i) => Math.max(0, Math.min(i, workspaces.length - 2)));
    backToList();
    toast(
      moveTarget && editTabCount > 0
        ? `“${name}” deleted — ${editTabCount} tab(s) moved to “${moveTarget.name}”`
        : `“${name}” deleted`,
      "success",
    );
  }, [
    editing, canDelete, armed, deleteWorkspace, setSelectedIndex, workspaces.length,
    backToList, moveTarget, editTabCount,
  ]);

  // ── Правка ──────────────────────────────────────────────────────────────────
  if (view === "edit" && editing) {
    return (
      <PickerModal
        onClose={onClose}
        width="min(94vw, 560px)"
        footer={
          <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
            <button
              onClick={remove}
              disabled={!canDelete}
              title={canDelete ? undefined : "The only workspace cannot be deleted"}
              className={`px-2 py-1.5 text-[11px] rounded transition-colors disabled:opacity-40 disabled:hover:bg-transparent ${
                armed
                  ? "bg-danger/15 text-danger hover:bg-danger/25"
                  : "text-danger hover:bg-danger/10"
              }`}
            >
              {armed ? "Confirm delete" : "Delete"}
            </button>
            {armed && (
              <span className="text-[10px] text-text-muted/60">Click again — this cannot be undone.</span>
            )}
            <div className="flex-1" />
            <button
              onClick={save}
              disabled={!editName.trim()}
              className="px-3 py-1.5 text-[11px] bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors disabled:opacity-40"
            >
              Save
            </button>
          </div>
        }
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[11px] tracking-wide text-text-muted uppercase">Edit workspace</span>
          <button onClick={backToList} className="text-text-muted hover:text-text text-xs">
            Back
          </button>
        </div>

        <div className="p-4 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">Name</span>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
              spellCheck={false}
              placeholder="Workspace name"
              className="bg-bg border border-border rounded px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50"
            />
          </label>

          {/* Последствие удаления — здесь, рядом с кнопкой, а не в диалоге поверх:
              читается ДО клика, а не после него. */}
          <div className="flex flex-col gap-1 rounded border border-border/60 bg-bg/40 px-3 py-2">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">Contents</span>
            <span className="text-[11px] text-text-muted/80 tabular-nums">
              {editTabCount} tab{editTabCount === 1 ? "" : "s"}
              {editGroupCount > 0 && ` · ${editGroupCount} group${editGroupCount === 1 ? "" : "s"}`}
            </span>
            <span className="text-[10px] leading-relaxed text-text-muted/60">
              {canDelete ? (
                <>
                  Deleting moves the tabs to “{moveTarget?.name}” — none are lost.
                  {editGroupCount > 0 && " Its groups are discarded; the tabs themselves survive."}
                </>
              ) : (
                "This is the only workspace, so it cannot be deleted."
              )}
            </span>
          </div>
        </div>
      </PickerModal>
    );
  }

  // ── Список ──────────────────────────────────────────────────────────────────
  return (
    <PickerModal
      onClose={onClose}
      width="min(94vw, 560px)"
      footer={
        <PickerHint>
          <span>↑↓ navigate</span>
          <span>↵ {mode === "move" ? "move" : "switch"}</span>
          {canEdit && <span>F2 edit</span>}
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
            // Строка — контейнер, а не сама кнопка: «edit» не вкладывается в <button>.
            // data-picker-index живёт здесь — доскролл ищет по атрибуту, тег ему безразличен.
            <div
              key={row.id}
              data-picker-index={index}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`
                flex items-center transition-colors duration-75
                ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
              `}
            >
              <button
                onClick={() => pick(index)}
                className="min-w-0 flex-1 grid grid-cols-[auto_1fr] items-center gap-3 pl-4 py-2 text-left"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? "bg-accent" : "bg-border"}`}
                />
                <span className="min-w-0 flex items-center gap-2">
                  <span className="truncate text-[12px] text-text">{row.name}</span>
                  {isActive && <span className="shrink-0 text-[9px] text-accent">active</span>}
                </span>
              </button>

              {/* Тихая надпись, а не кнопка с рамкой: список из десятка workspace не
                  должен рябить. Проявляется на выбранной строке — наведение мышью
                  делает строку выбранной, так что ховер покрыт тем же условием.
                  Место под неё занято всегда (invisible), иначе счётчик прыгал бы. */}
              {canEdit && (
                <button
                  onClick={() => startEdit(index)}
                  title="Rename or delete (F2)"
                  aria-label={`Edit workspace ${row.name}`}
                  className={`shrink-0 px-2 text-[10px] transition-colors ${
                    selected ? "text-text-muted hover:text-accent" : "invisible"
                  }`}
                >
                  edit
                </button>
              )}

              {/* Счётчик — крайний правый столбец фиксированной ширины: он не должен
                  ездить от появления «edit» и от разрядности числа. */}
              <span className="shrink-0 pr-4 min-w-[32px] text-right text-[10px] text-text-muted/45 tabular-nums">
                {counts.get(row.id) ?? 0}
              </span>
            </div>
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
