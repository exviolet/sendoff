import { useEffect, useRef, useState } from "react";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  // Задан → диалог работает как prompt: показывает поле, значение уходит в onConfirm.
  inputDefault?: string;
  inputPlaceholder?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Подтвердить",
  cancelLabel = "Отмена",
  danger = false,
  inputDefault,
  inputPlaceholder,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isPrompt = inputDefault !== undefined;
  const [value, setValue] = useState(inputDefault ?? "");

  useEffect(() => {
    if (isPrompt) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else {
      confirmRef.current?.focus();
    }
  }, [isPrompt]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        onConfirm(value);
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onConfirm, onCancel, value]);

  const confirmClasses = danger
    ? "bg-danger/15 text-danger hover:bg-danger/25 border-danger/20"
    : "bg-accent/15 text-accent hover:bg-accent/25 border-accent/20";

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4">
          <h2 className="text-sm font-medium text-text mb-1.5">{title}</h2>
          <p className="text-xs text-text-muted">{message}</p>
          {isPrompt && (
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={inputPlaceholder}
              spellCheck={false}
              className="mt-3 w-full px-2.5 py-1.5 rounded-[6px] border border-border bg-bg text-[12px] text-text placeholder:text-text-muted/40 focus:outline-none focus:border-accent/50 transition-colors"
            />
          )}
        </div>
        <div className="flex gap-1.5 px-5 py-3 border-t border-border/50">
          <button
            onClick={onCancel}
            className="flex-1 h-7 text-[11px] rounded-[3px] bg-surface-hover text-text-muted hover:text-text border border-border/50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            onClick={() => onConfirm(value)}
            className={`flex-1 h-7 text-[11px] rounded-[3px] border transition-colors ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
