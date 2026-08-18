import { useSettingsStore } from "../../store/settingsStore";
import { useThemeStore } from "../../store/themeStore";

interface SettingsPanelProps {
  onClose: () => void;
  onOpenDoctor: () => void;
}

export function SettingsPanel({ onClose, onOpenDoctor }: SettingsPanelProps) {
  const fontSize = useSettingsStore((s) => s.fontSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);
  const tmuxAutoSubmit = useSettingsStore((s) => s.tmuxAutoSubmit);
  const fontFamily = useSettingsStore((s) => s.fontFamily);
  const phraseInsertMode = useSettingsStore((s) => s.phraseInsertMode);
  const setFontSize = useSettingsStore((s) => s.setFontSize);
  const setWordWrap = useSettingsStore((s) => s.setWordWrap);
  const setTmuxAutoSubmit = useSettingsStore((s) => s.setTmuxAutoSubmit);
  const setFontFamily = useSettingsStore((s) => s.setFontFamily);
  const setPhraseInsertMode = useSettingsStore((s) => s.setPhraseInsertMode);

  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <aside className="absolute right-0 top-0 bottom-0 w-72 bg-surface border-l border-border z-30 flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <h2 className="text-xs font-medium text-text tracking-wide">Settings</h2>
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
            Font size
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

        {/* Font family */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-text-muted/60">
            Font
          </label>
          <input
            type="text"
            list="font-family-presets"
            value={fontFamily}
            onChange={(e) => setFontFamily(e.target.value)}
            placeholder="Default (JetBrains Mono)"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            className="w-full px-2.5 py-1.5 rounded-[6px] border border-border bg-bg text-[12px] text-text placeholder:text-text-muted/40 focus:outline-none focus:border-accent/50 transition-colors"
          />
          <datalist id="font-family-presets">
            <option value="JetBrainsMono Nerd Font" />
            <option value="FiraCode Nerd Font" />
            <option value="CaskaydiaCove Nerd Font" />
            <option value="Hack Nerd Font" />
            <option value="JetBrains Mono" />
            <option value="Fira Code" />
            <option value="Cascadia Code" />
          </datalist>
          <p className="text-[10px] leading-relaxed text-text-muted/60">
            Name of a monospace font installed on the system. For icons use a Nerd Font
            variant (e.g. <span className="text-text-muted">JetBrainsMono Nerd Font</span>).
            Empty — the bundled JetBrains Mono.
          </p>
        </div>

        {/* Word wrap */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-text-muted/60">
            Word wrap
          </label>
          <button
            onClick={() => setWordWrap(!wordWrap)}
            className="flex items-center justify-between w-full px-3 py-2 rounded-[6px] border border-border hover:bg-surface-hover transition-colors"
          >
            <span className="text-[12px] text-text">
              {wordWrap ? "On" : "Off"}
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
            Theme
          </label>
          <div className="grid grid-cols-3 gap-1 p-1 rounded-[6px] border border-border">
            {(["dark", "light", "system"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`
                  flex items-center justify-center gap-1.5 h-7 rounded-[4px] text-[11px] transition-colors
                  ${theme === t
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text hover:bg-surface-hover"
                  }
                `}
              >
                {t === "dark" && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7A5.5 5.5 0 1 0 13.5 9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                  </svg>
                )}
                {t === "light" && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                )}
                {t === "system" && (
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <rect x="2" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M6 13.5h4M8 11v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                )}
                <span>{t === "dark" ? "Dark" : t === "light" ? "Light" : "System"}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Фразы-триггеры */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-text-muted/60">
            Trigger phrase insertion
          </label>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-[6px] border border-border">
            {(["prepend", "cursor"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setPhraseInsertMode(m)}
                className={`
                  flex items-center justify-center h-7 rounded-[4px] text-[11px] transition-colors
                  ${phraseInsertMode === m
                    ? "bg-accent/15 text-accent"
                    : "text-text-muted hover:text-text hover:bg-surface-hover"
                  }
                `}
              >
                {m === "prepend" ? "Prepend" : "At cursor"}
              </button>
            ))}
          </div>
          <p className="text-[10px] leading-relaxed text-text-muted/60">
            Where <kbd className="font-mono">Ctrl+K</kbd> puts the phrase body: as a prefix to
            the whole prompt, or at the caret position.
          </p>
        </div>

        {/* терминальные таргеты */}
        <div className="space-y-3 pt-2 border-t border-border">
          <label className="text-[10px] uppercase tracking-widest text-text-muted/60">
            Terminal targets
          </label>

          <p className="text-[10px] leading-relaxed text-text-muted/60">
            A target is a herdr agent, an Orca agent or a tmux window. Choose it via the picker
            (<kbd className="font-mono">Ctrl+Shift+Enter</kbd>) or by binding the tab
            (<kbd className="font-mono">Ctrl+Alt+B</kbd>). <kbd className="font-mono">Ctrl+Enter</kbd>:
            binding → last choice → picker.
          </p>

          <button
            onClick={() => setTmuxAutoSubmit(!tmuxAutoSubmit)}
            className="flex items-center justify-between w-full px-3 py-2 rounded-[6px] border border-border hover:bg-surface-hover transition-colors"
          >
            <span className="text-[12px] text-text">
              Auto-submit
            </span>
            <div
              className={`
                relative w-8 h-[18px] rounded-full transition-colors duration-200
                ${tmuxAutoSubmit ? "bg-accent" : "bg-border"}
              `}
            >
              <div
                className={`
                  absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow-sm transition-transform duration-200
                  ${tmuxAutoSubmit ? "translate-x-[16px]" : "translate-x-[2px]"}
                `}
              />
            </div>
          </button>
        </div>

        {/* Диагностика. Живёт в настройках, но настройкой не является: Doctor ничего
            не меняет — поэтому отдельным блоком, а не среди тумблеров.

            Строка-действие, а не ссылка-текст: рядом лежит «Reset to defaults», и
            одинаково выглядящие строки не давали понять, что эта открывает экран.
            Шеврон и рамка — единственное, что об этом сообщает. */}
        <div className="pt-2 border-t border-border">
          <button
            onClick={onOpenDoctor}
            className="w-full flex items-center justify-between gap-3 px-2.5 py-2 rounded border border-border hover:border-accent hover:bg-surface-hover transition-colors text-left group"
          >
            <span>
              <span className="block text-[11px] text-text">Sendoff Doctor</span>
              <span className="block text-[10px] text-text-muted">
                View application and provider diagnostics
              </span>
            </span>
            <span className="text-text-muted group-hover:text-accent transition-colors" aria-hidden>
              <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                <path d="M2.5 1l3 3-3 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          </button>
        </div>

        {/* Reset */}
        <div className="pt-2 border-t border-border">
          <button
            onClick={() => {
              setFontSize(13);
              setWordWrap(true);
              setTmuxAutoSubmit(true);
              setFontFamily("");
            }}
            className="text-[11px] text-text-muted hover:text-accent transition-colors"
          >
            Reset to defaults
          </button>
        </div>
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border text-[10px] text-text-muted/50 text-center">
        Ctrl+, — open/close
      </div>
    </aside>
  );
}
