import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useEditorStore } from "../../store/editorStore";
import { findMatches, replaceAt, replaceAll } from "../../lib/replaceEngine";

interface FindReplacePanelProps {
  mode: "find" | "findReplace";
  onClose: () => void;
  onMatchesChange: (matches: { index: number; length: number }[], currentIndex: number) => void;
}

export function FindReplacePanel({ mode, onClose, onMatchesChange }: FindReplacePanelProps) {
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const findInputRef = useRef<HTMLInputElement>(null);

  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const updateContent = useEditorStore((s) => s.updateContent);

  const content = tab?.content ?? "";

  const matches = useMemo(
    () => findMatches(content, query, { caseSensitive, regex }),
    [content, query, caseSensitive, regex]
  );

  const clampedIndex = useMemo(
    () => (matches.length === 0 ? 0 : Math.min(currentIndex, matches.length - 1)),
    [currentIndex, matches.length]
  );

  const notifyParent = useCallback(
    () => onMatchesChange(matches, clampedIndex),
    [matches, clampedIndex, onMatchesChange]
  );

  useEffect(() => {
    notifyParent();
  }, [notifyParent]);

  useEffect(() => {
    findInputRef.current?.focus();
  }, [mode]);

  function findNext() {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i + 1) % matches.length);
  }

  function findPrev() {
    if (matches.length === 0) return;
    setCurrentIndex((i) => (i - 1 + matches.length) % matches.length);
  }

  function handleReplace() {
    if (!activeTabId || matches.length === 0) return;
    const match = matches[clampedIndex];
    const newContent = replaceAt(content, match, replacement);
    updateContent(activeTabId, newContent);
  }

  function handleReplaceAll() {
    if (!activeTabId || matches.length === 0) return;
    const { result } = replaceAll(content, query, replacement, { caseSensitive, regex });
    updateContent(activeTabId, result);
  }

  function handleFindKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && e.shiftKey) {
      e.preventDefault();
      findPrev();
    } else if (e.key === "Enter") {
      e.preventDefault();
      findNext();
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  function handleReplaceKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      onClose();
    }
  }

  const showReplace = mode === "findReplace";

  return (
    <div className="shrink-0 bg-surface border-b border-border px-3 py-2 flex flex-col gap-1.5 animate-slide-down">
      {/* Find row */}
      <div className="flex items-center gap-1.5">
        <input
          ref={findInputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setCurrentIndex(0); }}
          onKeyDown={handleFindKeyDown}
          placeholder="Find..."
          className="flex-1 h-7 px-2 bg-bg border border-border rounded-[4px] text-[11px] text-text placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors"
        />

        {/* Toggle buttons */}
        <ToggleButton active={caseSensitive} onClick={() => setCaseSensitive(!caseSensitive)} title="Case sensitive">
          Aa
        </ToggleButton>
        <ToggleButton active={regex} onClick={() => setRegex(!regex)} title="Regex">
          .*
        </ToggleButton>

        {/* Match counter */}
        <span className="text-[10px] text-text-muted w-16 text-center shrink-0 tabular-nums">
          {query ? (matches.length > 0 ? `${clampedIndex + 1} of ${matches.length}` : "No matches") : ""}
        </span>

        {/* Nav buttons */}
        <NavButton onClick={findPrev} title="Previous match (Shift+Enter)">
          <path d="M2 5l4-3 4 3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </NavButton>
        <NavButton onClick={findNext} title="Next match (Enter)">
          <path d="M2 3l4 3 4-3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </NavButton>

        {/* Close */}
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded-[3px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          title="Close (Escape)"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Replace row */}
      {showReplace && (
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
            onKeyDown={handleReplaceKeyDown}
            placeholder="Replace..."
            className="flex-1 h-7 px-2 bg-bg border border-border rounded-[4px] text-[11px] text-text placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors"
          />
          <button
            onClick={handleReplace}
            disabled={matches.length === 0}
            className="h-7 px-2.5 text-[10px] rounded-[4px] bg-surface-hover text-text-muted hover:text-text disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            Replace
          </button>
          <button
            onClick={handleReplaceAll}
            disabled={matches.length === 0}
            className="h-7 px-2.5 text-[10px] rounded-[4px] bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          >
            Replace All
          </button>
        </div>
      )}
    </div>
  );
}

function ToggleButton({ active, onClick, title, children }: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`
        flex items-center justify-center h-6 px-1.5 rounded-[3px] text-[10px] font-medium transition-colors
        ${active
          ? "bg-accent/20 text-accent"
          : "text-text-muted hover:text-text hover:bg-surface-hover"
        }
      `}
    >
      {children}
    </button>
  );
}

function NavButton({ onClick, title, children }: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center w-6 h-6 rounded-[3px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
    >
      <svg width="8" height="8" viewBox="0 0 8 8">{children}</svg>
    </button>
  );
}
