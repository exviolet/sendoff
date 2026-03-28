import { useSettingsStore } from "../../store/settingsStore";
import { useThemeStore } from "../../store/themeStore";

interface SettingsPanelProps {
  onClose: () => void;
}

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setWordWrap = useSettingsStore((s) => s.setWordWrap);

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  return (
    <aside className="absolute right-0 top-0 bottom-0 w-72 bg-surface border-l border-border z-30 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-xs font-medium text-text tracking-wide">Настройки</h2>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-5 h-5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Font size */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-text-muted/60">
            Размер шрифта
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFontSize(fontSize - 1)}
              disabled={fontSize <= 10}
              className="flex items-center justify-center w-7 h-7 rounded-[4px] border border-border text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M2 5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            <input
              type="range"
              min={10}
              max={24}
              step={1}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value))}
              className="flex-1 h-1 accent-accent cursor-pointer"
            />
            <button
              onClick={() => setFontSize(fontSize + 1)}
              disabled={fontSize >= 24}
              className="flex items-center justify-center w-7 h-7 rounded-[4px] border border-border text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:pointer-events-none"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M5 2v6M2 5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
              </svg>
            </button>
            <span className="text-[11px] text-text-muted tabular-nums w-8 text-right">
              {fontSize}px
            </span>
          </div>
        </div>

        {/* Word wrap */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-text-muted/60">
            Перенос строк
          </label>
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className="flex items-center justify-between w-full px-3 py-2 rounded-[6px] border border-border hover:bg-surface-hover transition-colors"
          >
            <span className="text-[12px] text-text">
              {wordWrap ? "Включён" : "Выключен"}
            </span>
            <div
              className={`
                relative w-8 h-[18px] rounded-full transition-colors duration-200
                ${wordWrap ? "bg-accent" : "bg-border"}
              `}
            >
              <div
                className={`
                  absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-200
                  ${wordWrap ? "translate-x-[16px]" : "translate-x-[2px]"}
                `}
              />
            </div>
          </button>
        </div>

        {/* Theme */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-text-muted/60">
            Тема
          </label>
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between w-full px-3 py-2 rounded-[6px] border border-border hover:bg-surface-hover transition-colors"
          >
            <div className="flex items-center gap-2">
              {theme === "dark" ? (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                  <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7A5.5 5.5 0 1 0 13.5 9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted">
                  <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                  <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              )}
              <span className="text-[12px] text-text">
                {theme === "dark" ? "Тёмная" : "Светлая"}
              </span>
            </div>
            <div
              className={`
                relative w-8 h-[18px] rounded-full transition-colors duration-200
                ${theme === "light" ? "bg-accent" : "bg-border"}
              `}
            >
              <div
                className={`
                  absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-200
                  ${theme === "light" ? "translate-x-[16px]" : "translate-x-[2px]"}
                `}
              />
            </div>
          </button>
        </div>

        {/* Reset */}
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => {
              setFontSize(13);
              setWordWrap(true);
            }}
            className="text-[11px] text-text-muted hover:text-accent transition-colors"
          >
            Сбросить по умолчанию
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border text-[10px] text-text-muted/50 text-center">
        Ctrl+, — открыть/закрыть
      </div>
    </aside>
  );
}
