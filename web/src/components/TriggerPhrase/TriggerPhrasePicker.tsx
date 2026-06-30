import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useTriggerPhrasesStore, type TriggerPhrase } from "../../store/triggerPhrasesStore";

interface TriggerPhrasePickerProps {
  onClose: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

type Mode = "list" | "edit" | "new";

function bodyPreview(body: string): string {
  const line = body.split(/\r?\n/).find((l) => l.trim()) ?? "";
  return line.length > 64 ? `${line.slice(0, 61)}...` : line;
}

export function TriggerPhrasePicker({ onClose, textareaRef }: TriggerPhrasePickerProps) {
  const phrases = useTriggerPhrasesStore((s) => s.phrases);
  const addPhrase = useTriggerPhrasesStore((s) => s.addPhrase);
  const updatePhrase = useTriggerPhrasesStore((s) => s.updatePhrase);
  const deletePhrase = useTriggerPhrasesStore((s) => s.deletePhrase);

  const [mode, setMode] = useState<Mode>("list");
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editBody, setEditBody] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (mode === "list") inputRef.current?.focus();
  }, [mode]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return phrases;
    return phrases.filter(
      (p) => p.label.toLowerCase().includes(q) || p.body.toLowerCase().includes(q),
    );
  }, [query, phrases]);

  // Вставка: префикс в самое начало активного таба, курсор встаёт после него.
  const insertPhrase = useCallback((body: string) => {
    const { activeTabId, tabs, updateContent } = useEditorStore.getState();
    const tab = activeTabId ? tabs.find((t) => t.id === activeTabId) : undefined;
    if (!activeTabId || !tab) {
      onClose();
      return;
    }
    updateContent(activeTabId, body + tab.content);
    onClose();
    requestAnimationFrame(() => {
      const ta = textareaRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(body.length, body.length);
      }
    });
  }, [onClose, textareaRef]);

  const startNew = useCallback(() => {
    setEditingId(null);
    setEditLabel("");
    setEditBody("");
    setMode("new");
  }, []);

  const startEdit = useCallback((p: TriggerPhrase) => {
    setEditingId(p.id);
    setEditLabel(p.label);
    setEditBody(p.body);
    setMode("edit");
  }, []);

  const save = useCallback(() => {
    const label = editLabel.trim();
    if (!label || !editBody) return;
    if (mode === "new") {
      addPhrase({ id: crypto.randomUUID(), label, body: editBody, order: 0 });
    } else if (editingId) {
      updatePhrase(editingId, { label, body: editBody });
    }
    setMode("list");
  }, [editLabel, editBody, mode, editingId, addPhrase, updatePhrase]);

  const removeCurrent = useCallback(() => {
    if (editingId) deletePhrase(editingId);
    setMode("list");
  }, [editingId, deletePhrase]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (mode === "list") onClose();
        else setMode("list");
        return;
      }
      if (mode !== "list") return; // в edit/new Enter и стрелки — нативные (ввод в textarea)
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const p = results[selectedIndex];
        if (p) insertPhrase(p.body);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [mode, results, selectedIndex, insertPhrase, onClose]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[14vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-[min(92vw,560px)] bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "list" ? (
          <>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
                <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
                <path d="M9 4L5.5 9H8l-1 3 3.5-5H8z" fill="currentColor" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Фраза-триггер..."
                className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-muted/50"
              />
              <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">{results.length}</span>
            </div>

            <div ref={listRef} className="max-h-[48vh] overflow-y-auto py-1">
              {results.length === 0 && (
                <div className="px-4 py-8 text-center text-text-muted text-xs">
                  {phrases.length === 0 ? "Нет фраз — создай первую" : "Ничего не найдено"}
                </div>
              )}
              {results.map((p, i) => {
                const isSelected = i === selectedIndex;
                return (
                  <div
                    key={p.id}
                    onMouseEnter={() => setSelectedIndex(i)}
                    className={`group w-full grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-2.5 ${
                      isSelected ? "bg-accent/10" : "hover:bg-surface-hover/50"
                    }`}
                  >
                    <button onClick={() => insertPhrase(p.body)} className="min-w-0 text-left">
                      <span className="block truncate text-[13px] text-text">{p.label}</span>
                      <span className="block truncate text-[11px] text-text-muted/70 mt-0.5 font-mono">{bodyPreview(p.body)}</span>
                    </button>
                    <button
                      onClick={() => startEdit(p)}
                      className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 hover:text-accent transition-all shrink-0"
                    >
                      edit
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 px-4 py-2 border-t border-border">
              <div className="flex items-center gap-3 text-[10px] text-text-muted/50">
                <span>↑↓ навигация</span>
                <span>↵ вставить</span>
                <span>Esc закрыть</span>
              </div>
              <button
                onClick={startNew}
                className="text-[11px] text-text-muted hover:text-accent transition-colors"
              >
                + Новая фраза
              </button>
            </div>
          </>
        ) : (
          <div className="flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <span className="text-[11px] tracking-wide text-text-muted uppercase">
                {mode === "new" ? "Новая фраза" : "Редактировать фразу"}
              </span>
              <button onClick={() => setMode("list")} className="text-text-muted hover:text-text text-xs">
                Назад
              </button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Название</span>
                <input
                  value={editLabel}
                  onChange={(e) => setEditLabel(e.target.value)}
                  autoFocus
                  className="bg-bg border border-border rounded px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50"
                  placeholder="Только план"
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-text-muted">Префикс</span>
                <textarea
                  value={editBody}
                  onChange={(e) => setEditBody(e.target.value)}
                  rows={4}
                  className="bg-bg border border-border rounded px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50 resize-none leading-relaxed font-mono"
                  placeholder={"Только план, без изменений:\n\n"}
                />
                <span className="text-[10px] text-text-muted/60">Вставляется в начало промпта как есть.</span>
              </label>
            </div>
            <div className="px-4 py-3 border-t border-border flex gap-2">
              {mode === "edit" && editingId && (
                <button
                  onClick={removeCurrent}
                  className="px-2 py-1.5 text-[11px] text-danger hover:bg-danger/10 rounded transition-colors"
                >
                  Удалить
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={save}
                disabled={!editLabel.trim() || !editBody}
                className="px-3 py-1.5 text-[11px] bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors disabled:opacity-40"
              >
                Сохранить
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
