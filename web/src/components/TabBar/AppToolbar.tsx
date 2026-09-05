import { useState, useRef, useEffect } from "react";
import type { Theme } from "../../store/themeStore";
import { isTauri } from "../../lib/platform";
import { useSettingsStore } from "../../store/settingsStore";

type SidePanel = null | "presets" | "settings" | "reference";

interface AppToolbarProps {
  sidePanel: SidePanel;
  onSidePanelToggle: (panel: SidePanel) => void;
  onDownloadTab: (format: "txt" | "md") => void;
  onExportAll: () => void;
  onImportBackup: () => void;
  theme: Theme;
  onThemeToggle: () => void;
  onTriggerPhrases: () => void;
}

// Правый край шапки: действия НАД приложением (бэкап, тема, панели, окно), а не над
// табами. Живёт отдельно от TabBar, потому что общего с полосой у него только
// строка шапки: ни одного её состояния он не читает.
export function AppToolbar({ sidePanel, onSidePanelToggle, onDownloadTab, onExportAll, onImportBackup, theme, onThemeToggle, onTriggerPhrases }: AppToolbarProps) {
  // Читаем стор здесь, а не пропом сквозь TabBar: полосе табов состав правого края
  // не нужен, а лишний проп вернул бы ей ровно ту связность, ради снятия которой
  // панель отсюда и выносили.
  const hidden = useSettingsStore((s) => s.hiddenToolbarButtons);
  const shown = (id: string) => !hidden.includes(id);

  return (
    <div className="flex items-center gap-0.5 mr-2 shrink-0">
      {/* Download current tab */}
      {shown("download") && <DownloadButton onDownload={onDownloadTab} />}

      {/* Export all */}
      {shown("export") && (
        <button
          onClick={onExportAll}
          className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
          aria-label="Export all"
          title="Export backup"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 2v6M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Import backup */}
      {shown("import") && (
        <button
          onClick={onImportBackup}
          className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
          aria-label="Import backup"
          title="Import backup"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M6 8V2M3.5 4.5L6 2l2.5 2.5M2 10h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {/* Settings button */}
      {shown("settings") && (
        <button
          onClick={() => onSidePanelToggle("settings")}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${sidePanel === "settings"
              ? "text-accent bg-accent/10"
              : "text-text-muted hover:text-text hover:bg-surface-hover"
            }
          `}
          aria-label="Settings"
          title="Settings (Ctrl+,)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.3" strokeDasharray="2.8 2.4" />
          </svg>
        </button>
      )}

      {/* Theme toggle: dark → light → system → dark */}
      {shown("theme") && (
        <button
          onClick={onThemeToggle}
          className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
          aria-label={`Theme: ${theme === "dark" ? "dark" : theme === "light" ? "light" : "system"}`}
          title={`Theme: ${theme === "dark" ? "dark" : theme === "light" ? "light" : "system"} → ${theme === "dark" ? "light" : theme === "light" ? "system" : "dark"}`}
        >
          {theme === "light" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="3.5" stroke="currentColor" strokeWidth="1.3" />
              <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          ) : theme === "dark" ? (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <path d="M13.5 9.5a5.5 5.5 0 0 1-7-7A5.5 5.5 0 1 0 13.5 9.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
              <rect x="2" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.3" />
              <path d="M6 13.5h4M8 11v2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          )}
        </button>
      )}

      {/* Reference button */}
      {shown("reference") && (
        <button
          onClick={() => onSidePanelToggle("reference")}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${sidePanel === "reference"
              ? "text-accent bg-accent/10"
              : "text-text-muted hover:text-text hover:bg-surface-hover"
            }
          `}
          aria-label="Reference"
          title="Reference (Ctrl+R)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M4 2.5h7.5A1.5 1.5 0 0 1 13 4v9.5l-3-1.7-3 1.7V4A1.5 1.5 0 0 0 5.5 2.5H4z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
            <path d="M4 2.5A1.5 1.5 0 0 0 2.5 4v8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {/* Trigger phrases button */}
      {shown("trigger-phrases") && (
        <button
          onClick={onTriggerPhrases}
          className="
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            text-text-muted hover:text-text hover:bg-surface-hover
          "
          aria-label="Trigger phrases"
          title="Trigger phrases (Ctrl+K)"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="2" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.3" />
            <path d="M9 4L5.5 9H8l-1 3 3.5-5H8z" fill="currentColor" />
          </svg>
        </button>
      )}

      {/* Presets button */}
      {shown("presets") && (
        <button
          onClick={() => onSidePanelToggle("presets")}
          className={`
            flex items-center justify-center w-7 h-7 rounded-[4px] transition-colors duration-150
            ${sidePanel === "presets"
              ? "text-accent bg-accent/10"
              : "text-text-muted hover:text-text hover:bg-surface-hover"
            }
          `}
          aria-label="Presets"
          title="Replace Presets"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 4h12M2 8h8M2 12h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {isTauri && <WindowControls />}
    </div>
  );
}

function WindowControls() {
  const handleMinimize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().minimize();
  };
  const handleMaximize = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().toggleMaximize();
  };
  const handleClose = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    getCurrentWindow().close();
  };

  return (
    <div className="flex items-center gap-0.5 ml-2 pl-2 border-l border-border/50">
      <button
        onClick={handleMinimize}
        className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
        aria-label="Minimize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
      <button
        onClick={handleMaximize}
        className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
        aria-label="Maximize"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <rect x="2" y="2" width="6" height="6" rx="0.5" stroke="currentColor" strokeWidth="1.2" />
        </svg>
      </button>
      <button
        onClick={handleClose}
        className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-150"
        aria-label="Close"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function DownloadButton({ onDownload }: { onDownload: (format: "txt" | "md") => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-center w-7 h-7 rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150"
        aria-label="Download"
        title="Download"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 2h5l3 3v5a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V2z" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round" fill="none" />
          <path d="M7 2v3h3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 bg-surface border border-border rounded-[6px] shadow-lg z-50 overflow-hidden animate-slide-down">
          <button
            onClick={() => { onDownload("txt"); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] tracking-wide text-text-muted hover:text-text hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            <span className="text-text-muted/60">.txt</span>
            <span>Text file</span>
          </button>
          <button
            onClick={() => { onDownload("md"); setOpen(false); }}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-[11px] tracking-wide text-text-muted hover:text-text hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            <span className="text-text-muted/60">.md</span>
            <span>Markdown</span>
          </button>
        </div>
      )}
    </div>
  );
}
