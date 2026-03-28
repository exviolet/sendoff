import { useEffect } from "react";

const SHORTCUT_GROUPS = [
  {
    title: "Табы",
    items: [
      { keys: "Ctrl+N", action: "Новый таб" },
      { keys: "Ctrl+W", action: "Закрыть таб" },
      { keys: "Ctrl+Tab", action: "Следующий таб" },
      { keys: "Ctrl+Shift+Tab", action: "Предыдущий таб" },
    ],
  },
  {
    title: "Редактирование",
    items: [
      { keys: "Ctrl+Z", action: "Отменить" },
      { keys: "Ctrl+Shift+Z", action: "Повторить" },
      { keys: "Ctrl+F", action: "Найти" },
      { keys: "Ctrl+H", action: "Найти и заменить" },
    ],
  },
  {
    title: "Панели",
    items: [
      { keys: "Ctrl+K", action: "AI Prompt" },
      { keys: "Ctrl+,", action: "Настройки" },
      { keys: "Ctrl+.", action: "Toggle sidebar" },
      { keys: "Ctrl+M", action: "Markdown превью" },
      { keys: "Ctrl+P", action: "Command Palette" },
      { keys: "Ctrl+Shift+F", action: "Distraction-free режим" },
      { keys: "Escape", action: "Закрыть панели" },
    ],
  },
  {
    title: "Файлы",
    items: [
      { keys: "Ctrl+S", action: "Сохранить" },
      { keys: "Ctrl+O", action: "Открыть файл" },
    ],
  },
  {
    title: "Справка",
    items: [
      { keys: "Ctrl+/", action: "Шорткаты (это окно)" },
    ],
  },
];

interface ShortcutsModalProps {
  onClose: () => void;
}

export function ShortcutsModal({ onClose }: ShortcutsModalProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-text">Клавиатурные сокращения</h2>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
              <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.title}>
              <h3 className="text-[10px] uppercase tracking-widest text-text-muted/60 mb-2">
                {group.title}
              </h3>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <div
                    key={item.keys}
                    className="flex items-center justify-between py-1.5 text-sm"
                  >
                    <span className="text-text-muted">{item.action}</span>
                    <kbd className="text-[10px] text-text-muted/80 bg-surface-hover px-2 py-0.5 rounded border border-border/50 font-mono">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 py-2 border-t border-border text-[10px] text-text-muted/50 text-center">
          Нажмите Esc для закрытия
        </div>
      </div>
    </div>
  );
}
