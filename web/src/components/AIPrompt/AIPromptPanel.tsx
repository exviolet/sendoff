import { useState, useCallback, useEffect, useRef } from "react";
import { useEditorStore } from "../../store/editorStore";
import { usePromptTemplatesStore } from "../../store/promptTemplatesStore";
import {
  assemblePrompt,
  hasInstructionPlaceholder,
} from "../../lib/promptBuilder";
import type { PromptTemplate } from "../../lib/promptBuilder";

interface AIPromptPanelProps {
  onClose: () => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
}

type EditorMode = "main" | "editTemplate" | "newTemplate";

export function AIPromptPanel({ onClose, textareaRef }: AIPromptPanelProps) {
  const templates = usePromptTemplatesStore((s) => s.templates);
  const addTemplate = usePromptTemplatesStore((s) => s.addTemplate);
  const updateTemplate = usePromptTemplatesStore((s) => s.updateTemplate);
  const deleteTemplate = usePromptTemplatesStore((s) => s.deleteTemplate);

  const tab = useEditorStore((s) =>
    s.tabs.find((t) => t.id === s.activeTabId),
  );

  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? "");
  const [instruction, setInstruction] = useState("");
  const [sourceMode, setSourceMode] = useState<"selection" | "full">("full");
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("main");
  const [editName, setEditName] = useState("");
  const [editTemplate, setEditTemplate] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectionRange, setSelectionRange] = useState<{ start: number; end: number } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const selectedTemplate = templates.find((t) => t.id === selectedId);
  const needsInstruction = selectedTemplate
    ? hasInstructionPlaceholder(selectedTemplate.template)
    : false;

  const getSourceText = useCallback((): string => {
    if (!tab) return "";
    if (sourceMode === "selection" && selectionRange && selectionRange.start !== selectionRange.end) {
      return tab.content.slice(selectionRange.start, selectionRange.end);
    }
    return tab.content;
  }, [tab, sourceMode, selectionRange]);

  const computePreview = useCallback((): string => {
    if (!selectedTemplate) return "";
    return assemblePrompt(selectedTemplate.template, getSourceText(), instruction);
  }, [selectedTemplate, getSourceText, instruction]);

  // Sync selection range from editor textarea into state
  useEffect(() => {
    let rafId: number | null = null;
    function handleSelectionChange() {
      const ta = textareaRef.current;
      if (document.activeElement !== ta) return;
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const el = textareaRef.current;
        if (el) {
          setSelectionRange({ start: el.selectionStart, end: el.selectionEnd });
        }
      });
    }

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      document.removeEventListener("selectionchange", handleSelectionChange);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [textareaRef]);

  const previewText = computePreview();

  const showToast = useCallback((msg: string) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => {
    return () => clearTimeout(toastTimer.current);
  }, []);

  async function copyToClipboard(text: string, message: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(message);
      setCopied(true);
    } catch {
      showToast("Не удалось скопировать");
    }
  }

  function handlePasteResult() {
    textareaRef.current?.focus();
    setCopied(false);
  }

  function startEditTemplate(tpl: PromptTemplate) {
    setEditingId(tpl.id);
    setEditName(tpl.name);
    setEditTemplate(tpl.template);
    setEditorMode("editTemplate");
  }

  function startNewTemplate() {
    setEditingId(null);
    setEditName("");
    setEditTemplate("{{INSTRUCTION}}\n\n{{TEXT}}");
    setEditorMode("newTemplate");
  }

  function saveTemplate() {
    const name = editName.trim();
    if (!name) return;

    if (editorMode === "newTemplate") {
      const id = crypto.randomUUID();
      addTemplate({ id, name, template: editTemplate, order: 0 });
      setSelectedId(id);
    } else if (editingId) {
      updateTemplate(editingId, { name, template: editTemplate });
    }
    setEditorMode("main");
  }

  function handleDeleteTemplate(id: string) {
    deleteTemplate(id);
    if (selectedId === id) {
      setSelectedId(templates.find((t) => t.id !== id)?.id ?? "");
    }
    setEditorMode("main");
  }

  if (editorMode !== "main") {
    return (
      <div className="absolute inset-y-0 right-0 w-80 bg-surface border-l border-border z-20 flex flex-col animate-slide-left">
        <div className="flex items-center justify-between h-9 px-3 border-b border-border shrink-0">
          <span className="text-[11px] tracking-wide text-text-muted uppercase">
            {editorMode === "newTemplate" ? "Новый шаблон" : "Редактировать"}
          </span>
          <button
            onClick={() => setEditorMode("main")}
            className="text-text-muted hover:text-text text-xs"
          >
            Назад
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Название
            </span>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="bg-bg border border-border rounded px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50"
              placeholder="Название шаблона"
            />
          </label>
          <label className="flex flex-col gap-1 flex-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Шаблон
            </span>
            <textarea
              value={editTemplate}
              onChange={(e) => setEditTemplate(e.target.value)}
              className="bg-bg border border-border rounded px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50 flex-1 min-h-[120px] resize-none leading-relaxed"
              placeholder="Используйте {{TEXT}} и {{INSTRUCTION}}"
            />
          </label>
          <p className="text-[10px] text-text-muted leading-relaxed">
            {"{{TEXT}}"} — текст из редактора
            <br />
            {"{{INSTRUCTION}}"} — пользовательская инструкция (опционально)
          </p>
        </div>
        <div className="p-3 border-t border-border flex gap-2">
          {editorMode === "editTemplate" && editingId && templates.length > 1 && (
            <button
              onClick={() => handleDeleteTemplate(editingId)}
              className="px-2 py-1.5 text-[11px] text-danger hover:bg-danger/10 rounded transition-colors"
            >
              Удалить
            </button>
          )}
          <div className="flex-1" />
          <button
            onClick={saveTemplate}
            disabled={!editName.trim()}
            className="px-3 py-1.5 text-[11px] bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors disabled:opacity-40"
          >
            Сохранить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-y-0 right-0 w-80 bg-surface border-l border-border z-20 flex flex-col animate-slide-left">
      {/* Header */}
      <div className="flex items-center justify-between h-9 px-3 border-b border-border shrink-0">
        <span className="text-[11px] tracking-wide text-text-muted uppercase">
          AI Prompt
        </span>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path
              d="M1.5 1.5l5 5M6.5 1.5l-5 5"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
        {/* Template selector */}
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Шаблон
          </span>
          <select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value);
              setInstruction("");
              setCopied(false);
            }}
            className="bg-bg border border-border rounded px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50 appearance-none cursor-pointer"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        {/* Custom instruction */}
        {needsInstruction && (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-text-muted">
              Инструкция
            </span>
            <textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Что нужно сделать с текстом..."
              rows={3}
              className="bg-bg border border-border rounded px-2 py-1.5 text-[12px] text-text outline-none focus:border-accent/50 resize-none leading-relaxed"
            />
            {!instruction.trim() && (
              <span className="text-[10px] text-dirty">
                Введите инструкцию для копирования промпта
              </span>
            )}
          </label>
        )}

        {/* Source toggle */}
        <div className="flex gap-1">
          <button
            onClick={() => setSourceMode("full")}
            className={`flex-1 py-1 text-[11px] rounded transition-colors ${
              sourceMode === "full"
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text hover:bg-surface-hover"
            }`}
          >
            Весь текст
          </button>
          <button
            onClick={() => setSourceMode("selection")}
            className={`flex-1 py-1 text-[11px] rounded transition-colors ${
              sourceMode === "selection"
                ? "bg-accent/20 text-accent"
                : "text-text-muted hover:text-text hover:bg-surface-hover"
            }`}
          >
            Выделенный
          </button>
        </div>

        {/* Preview */}
        <div className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Превью
          </span>
          <div className="bg-bg border border-border rounded p-2 text-[11px] text-text-muted leading-relaxed max-h-40 overflow-y-auto whitespace-pre-wrap break-words">
            {previewText || "Нет текста"}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1.5">
          <button
            onClick={() =>
              copyToClipboard(
                computePreview(),
                "Промпт скопирован \u2192 вставь в Claude Desktop",
              )
            }
            disabled={!previewText || (needsInstruction && !instruction.trim())}
            className="w-full py-2 text-[11px] bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors disabled:opacity-40"
          >
            Скопировать промпт
          </button>
          <button
            onClick={() => copyToClipboard(getSourceText(), "Текст скопирован")
            }
            disabled={!tab?.content}
            className="w-full py-1.5 text-[11px] text-text-muted hover:text-text hover:bg-surface-hover rounded transition-colors disabled:opacity-40"
          >
            Скопировать только текст
          </button>
        </div>

        {/* Paste result helper */}
        {copied && (
          <button
            onClick={handlePasteResult}
            className="w-full py-2 text-[11px] border border-dashed border-accent/30 text-accent/70 hover:text-accent hover:border-accent/50 rounded transition-colors"
          >
            Вставить результат
          </button>
        )}

        {/* Template management */}
        <div className="border-t border-border pt-3 mt-1 flex flex-col gap-1.5">
          <span className="text-[10px] uppercase tracking-wider text-text-muted">
            Шаблоны
          </span>
          {templates.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between group"
            >
              <span className="text-[11px] text-text truncate">{t.name}</span>
              <button
                onClick={() => startEditTemplate(t)}
                className="text-[10px] text-text-muted opacity-0 group-hover:opacity-100 hover:text-accent transition-all"
              >
                edit
              </button>
            </div>
          ))}
          <button
            onClick={startNewTemplate}
            className="w-full py-1.5 text-[11px] text-text-muted hover:text-accent border border-dashed border-border hover:border-accent/30 rounded transition-colors mt-1"
          >
            + Новый шаблон
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-3 left-3 right-3 bg-accent/20 text-accent text-[11px] text-center py-2 rounded animate-slide-down">
          {toast}
        </div>
      )}
    </div>
  );
}
