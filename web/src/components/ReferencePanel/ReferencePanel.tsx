import { useEffect, useRef, type RefObject } from "react";
import { useEditorStore } from "../../store/editorStore";
import {
  useReferenceStore,
  clampReferenceWidth,
} from "../../store/referenceStore";
import { toast } from "../../store/toastStore";

interface ReferencePanelProps {
  onClose: () => void;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

function joinWithSpacing(before: string, inserted: string, after: string) {
  const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
  const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
  return `${before}${prefix}${inserted}${suffix}${after}`;
}

export function ReferencePanel({ onClose, textareaRef }: ReferencePanelProps) {
  const text = useReferenceStore((s) => s.text);
  const setText = useReferenceStore((s) => s.setText);
  const setWidth = useReferenceStore((s) => s.setWidth);
  const clear = useReferenceStore((s) => s.clear);
  const width = useReferenceStore((s) => s.width);

  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // Re-clamp width on viewport resize so panel never exceeds bounds
  useEffect(() => {
    function handleResize() {
      const current = useReferenceStore.getState().width;
      const clamped = clampReferenceWidth(current);
      if (clamped !== current) {
        useReferenceStore.getState().setWidth(clamped);
      }
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  function handleResizeStart(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    dragStateRef.current = {
      startX: e.clientX,
      startWidth: useReferenceStore.getState().width,
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    function onMove(ev: MouseEvent) {
      const drag = dragStateRef.current;
      if (!drag) return;
      const next = drag.startWidth + (drag.startX - ev.clientX);
      setWidth(next);
    }
    function onUp() {
      dragStateRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  function insertIntoPrompt() {
    const reference = text.trim();
    if (!reference) {
      toast("Reference пустой", "info");
      return;
    }

    const { tabs, activeTabId, updateContent } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;

    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? tab.content.length;
    const end = textarea?.selectionEnd ?? tab.content.length;
    const next = joinWithSpacing(
      tab.content.slice(0, start),
      reference,
      tab.content.slice(end),
    );

    updateContent(tab.id, next);
    requestAnimationFrame(() => {
      const cursor = start + (start > 0 && !tab.content.slice(0, start).endsWith("\n") ? 2 : 0) + reference.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(cursor, cursor);
    });
    toast("Reference вставлен в prompt", "success");
  }

  return (
    <aside
      style={{ width: `${width}px` }}
      className="absolute inset-y-0 right-0 bg-surface border-l border-border z-20 flex flex-col animate-slide-left"
    >
      <div
        onMouseDown={handleResizeStart}
        className="absolute inset-y-0 -left-0.5 w-1 cursor-col-resize hover:bg-accent/40 active:bg-accent/60 transition-colors z-30"
        title="Перетащите, чтобы изменить ширину"
      />

      <div className="flex items-center justify-between h-9 px-3 border-b border-border shrink-0">
        <span className="text-[11px] tracking-wide text-text-muted uppercase">
          Reference
        </span>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          title="Закрыть"
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

      <div className="flex-1 min-h-0 p-3 flex flex-col gap-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Временный контекст, требования, ошибка, факты для промпта..."
          className="flex-1 min-h-0 resize-none bg-bg border border-border rounded px-2.5 py-2 text-[12px] leading-relaxed text-text outline-none focus:border-accent/50 placeholder:text-text-muted/45"
        />

        <div className="grid grid-cols-2 gap-1.5">
          <button
            onClick={insertIntoPrompt}
            disabled={!text.trim()}
            className="h-8 text-[11px] bg-accent/20 text-accent hover:bg-accent/30 rounded transition-colors disabled:opacity-40"
          >
            Вставить
          </button>
          <button
            onClick={clear}
            disabled={!text}
            className="h-8 text-[11px] text-text-muted hover:text-danger hover:bg-danger/10 rounded transition-colors disabled:opacity-40"
          >
            Очистить
          </button>
        </div>

        <div className="text-[10px] leading-relaxed text-text-muted/60">
          Текст хранится локально и не привязан к табам.
        </div>
      </div>
    </aside>
  );
}
