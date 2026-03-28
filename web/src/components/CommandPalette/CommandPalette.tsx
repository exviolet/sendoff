import { useState, useEffect, useRef, useMemo, useCallback } from "react";

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

function fuzzyMatch(query: string, text: string): { match: boolean; score: number; indices: number[] } {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  let score = 0;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      // Consecutive matches get bonus
      if (lastMatchIndex === ti - 1) score += 2;
      // Start-of-word bonus
      if (ti === 0 || t[ti - 1] === " ") score += 3;
      score += 1;
      lastMatchIndex = ti;
      qi++;
    }
  }

  return { match: qi === q.length, score, indices };
}

function highlightText(text: string, indices: number[]) {
  if (indices.length === 0) return <span>{text}</span>;

  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  const indexSet = new Set(indices);

  for (let i = 0; i < text.length; i++) {
    if (indexSet.has(i)) {
      if (lastIdx < i) {
        parts.push(<span key={`t-${lastIdx}`}>{text.slice(lastIdx, i)}</span>);
      }
      parts.push(
        <span key={`h-${i}`} className="text-accent font-semibold">
          {text[i]}
        </span>
      );
      lastIdx = i + 1;
    }
  }
  if (lastIdx < text.length) {
    parts.push(<span key={`t-${lastIdx}`}>{text.slice(lastIdx)}</span>);
  }

  return <>{parts}</>;
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
              <span>{highlightText(item.cmd.label, item.indices)}</span>
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
