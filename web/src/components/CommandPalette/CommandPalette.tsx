import { useState, useMemo, useCallback } from "react";
import { fuzzyMatch } from "../../lib/fuzzyMatch";
import { highlightMatches } from "../../lib/highlight";
import { usePickerModal } from "../../hooks/usePickerModal";
import { PickerModal, PickerHeader } from "../PickerModal/PickerModal";

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

  const execute = useCallback((item: (typeof filtered)[number] | undefined) => {
    if (!item) return;
    onClose();
    item.cmd.action();
  }, [onClose]);

  const onEnter = useCallback((index: number) => execute(filtered[index]), [execute, filtered]);

  const { selectedIndex, setSelectedIndex, inputRef, listRef } = usePickerModal({
    count: filtered.length,
    onEnter,
    onClose,
  });

  return (
    // Футер не переопределяем: дефолтная подсказка примитива здесь ровно та же.
    <PickerModal onClose={onClose} width="min(100%, 28rem)" paddingTop="15vh">
      <PickerHeader
        inputRef={inputRef}
        value={query}
        onChange={(v) => {
          setQuery(v);
          setSelectedIndex(0);
        }}
        placeholder="Type a command..."
        prefix={
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5" />
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        }
      />

      <div ref={listRef} className="max-h-64 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <div className="px-4 py-6 text-center text-text-muted text-xs">
            No matches
          </div>
        )}
        {filtered.map((item, i) => (
          <button
            key={item.cmd.id}
            data-picker-index={i}
            onClick={() => execute(item)}
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
    </PickerModal>
  );
}
