import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { fuzzyMatch } from "../../lib/fuzzyMatch";
import { highlightMatches } from "../../lib/highlight";

export interface Command {
  id: string;
  label: string;
  shortcut?: string;
  action: () => void;
}

interface CommandPaletteProps {
  commands: Command[];
  onClose: () => void;
}

export function CommandPalette({ commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return commands.map((cmd) => ({ cmd, indices: [] as number[], score: 0 }));
    }
    return commands
      .map((cmd) => {
        const result = fuzzyMatch(query, cmd.label);
        return { cmd, indices: result.indices, score: result.score, match: result.match };
      })
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score);
  }, [query, commands]);

  const executeSelected = useCallback(() => {
    const item = filtered[selectedIndex];
    if (item) {
      onClose();
      item.cmd.action();
    }
  }, [filtered, selectedIndex, onClose]);

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
        setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        executeSelected();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, filtered.length, executeSelected]);

  // Scroll selected item into view
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    if (item) {
      item.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Palette */}
      <div
        className="relative w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Input */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Введите команду..."
            className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-muted/50"
          />
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-text-muted text-xs">
              Ничего не найдено
            </div>
          )}
          {filtered.map((item, i) => (
            <button
              key={item.cmd.id}
              onClick={() => {
                onClose();
                item.cmd.action();
              }}
              onMouseEnter={() => setSelectedIndex(i)}
              className={`
                w-full flex items-center justify-between px-4 py-2 text-left text-sm
                transition-colors duration-75
                ${i === selectedIndex
                  ? "bg-accent/10 text-text"
                  : "text-text-muted hover:text-text"
                }
              `}
            >
              <span>{highlightMatches(item.cmd.label, item.indices)}</span>
              {item.cmd.shortcut && (
                <kbd className="text-[10px] text-text-muted/60 bg-surface-hover px-1.5 py-0.5 rounded border border-border/50 font-mono">
                  {item.cmd.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted/50">
          <span>↑↓ навигация</span>
          <span>↵ выбрать</span>
          <span>Esc закрыть</span>
        </div>
      </div>
    </div>
  );
}
