import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { Tab } from "../../store/editorStore";

interface TabSwitcherProps {
  onClose: () => void;
}

interface MatchResult {
  match: boolean;
  score: number;
  indices: number[];
}

function firstContentLine(content: string) {
  return content
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .find(Boolean) ?? "";
}

function makePreview(tab: Tab) {
  const line = firstContentLine(tab.content) || tab.content.trim().replace(/\s+/g, " ");
  if (!line) return "Пустой таб";
  return line.length > 80 ? `${line.slice(0, 77)}...` : line;
}

function fuzzyMatch(query: string, text: string, baseScore = 0): MatchResult {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const indices: number[] = [];
  let qi = 0;
  let score = baseScore;
  let lastMatchIndex = -1;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      if (lastMatchIndex === ti - 1) score += 2;
      if (ti === 0 || t[ti - 1] === " " || t[ti - 1] === "-" || t[ti - 1] === "_") score += 3;
      score += 1;
      lastMatchIndex = ti;
      qi++;
    }
  }

  return { match: qi === q.length, score, indices };
}

function bestMatch(query: string, tab: Tab) {
  const title = fuzzyMatch(query, tab.title, 20);
  const preview = fuzzyMatch(query, makePreview(tab), 8);
  const content = fuzzyMatch(query, tab.content, 0);
  const matches = [title, preview, content].filter((result) => result.match);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.score - a.score)[0];
}

function highlightText(text: string, indices: number[]) {
  if (indices.length === 0) return text;

  const parts: ReactNode[] = [];
  const indexSet = new Set(indices);
  let start = 0;

  for (let i = 0; i < text.length; i++) {
    if (!indexSet.has(i)) continue;
    if (start < i) parts.push(<span key={`t-${start}`}>{text.slice(start, i)}</span>);
    parts.push(<span key={`h-${i}`} className="text-accent font-semibold">{text[i]}</span>);
    start = i + 1;
  }

  if (start < text.length) parts.push(<span key={`t-${start}`}>{text.slice(start)}</span>);
  return parts;
}

export function TabSwitcher({ onClose }: TabSwitcherProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => {
    const indexedTabs = tabs.map((tab, index) => ({ tab, index }));
    if (!query.trim()) {
      return indexedTabs
        .sort((a, b) => b.tab.updatedAt - a.tab.updatedAt)
        .map((item) => ({ ...item, indices: [] as number[], score: 0 }));
    }

    return indexedTabs
      .map((item) => {
        const match = bestMatch(query.trim(), item.tab);
        return match ? { ...item, indices: match.indices, score: match.score } : null;
      })
      .filter((item): item is { tab: Tab; index: number; indices: number[]; score: number } => item !== null)
      .sort((a, b) => b.score - a.score || b.tab.updatedAt - a.tab.updatedAt);
  }, [query, tabs]);

  const selectResult = useCallback((id: string) => {
    setActiveTab(id);
    onClose();
  }, [onClose, setActiveTab]);

  const executeSelected = useCallback(() => {
    const item = results[selectedIndex];
    if (item) selectResult(item.tab.id);
  }, [results, selectedIndex, selectResult]);

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
        setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
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
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [executeSelected, onClose, results.length]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.children[selectedIndex] as HTMLElement | undefined;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-xl bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <path d="M3 4h10M3 8h7M3 12h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Найти таб..."
            className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-muted/50"
          />
          <span className="text-[10px] text-text-muted/50 tabular-nums">{tabs.length} табов</span>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-text-muted text-xs">
              Ничего не найдено
            </div>
          )}
          {results.map((item, i) => {
            const isSelected = i === selectedIndex;
            const isActive = item.tab.id === activeTabId;
            const preview = makePreview(item.tab);

            return (
              <button
                key={item.tab.id}
                onClick={() => selectResult(item.tab.id)}
                onMouseEnter={() => setSelectedIndex(i)}
                className={`
                  w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-left
                  transition-colors duration-75
                  ${isSelected ? "bg-accent/10 text-text" : "text-text-muted hover:text-text hover:bg-surface-hover/50"}
                `}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${item.tab.isDirty ? "bg-dirty" : isActive ? "bg-accent" : "bg-border"}`} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-[13px] text-text">{highlightText(item.tab.title, item.indices)}</span>
                    {isActive && <span className="text-[10px] text-accent shrink-0">активный</span>}
                  </span>
                  <span className="block truncate text-[11px] text-text-muted/70 mt-0.5">{preview}</span>
                </span>
                <span className="text-[10px] text-text-muted/50 tabular-nums">#{item.index + 1}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted/50">
          <span>↑↓ навигация</span>
          <span>↵ открыть</span>
          <span>Esc закрыть</span>
        </div>
      </div>
    </div>
  );
}
