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
  source: "title" | "preview" | "content";
}

interface TabResult {
  tab: Tab;
  index: number;
  indices: number[];
  score: number;
  source: MatchResult["source"] | null;
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

function fuzzyMatch(query: string, text: string, baseScore = 0, source: MatchResult["source"]): MatchResult {
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

  return { match: qi === q.length, score, indices, source };
}

function bestMatch(query: string, tab: Tab) {
  const title = fuzzyMatch(query, tab.title, 20, "title");
  const preview = fuzzyMatch(query, makePreview(tab), 8, "preview");
  const content = fuzzyMatch(query, tab.content, 0, "content");
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

function lineStartAt(text: string, index: number) {
  const start = text.lastIndexOf("\n", Math.max(0, index - 1));
  return start === -1 ? 0 : start + 1;
}

function lineEndAt(text: string, index: number) {
  const end = text.indexOf("\n", index);
  return end === -1 ? text.length : end;
}

function makePreviewContext(tab: Tab, result: TabResult | undefined, query: string) {
  if (!tab.content.trim()) {
    return {
      text: "",
      indices: [] as number[],
      before: false,
      after: false,
    };
  }

  const normalizedQuery = query.trim().toLowerCase();
  const shouldUseContentMatch = result?.source === "content" && normalizedQuery;
  const firstIndex = shouldUseContentMatch ? result.indices[0] ?? -1 : -1;

  if (firstIndex >= 0) {
    const startLine = lineStartAt(tab.content, firstIndex);
    const lastIndex = result?.indices.at(-1) ?? firstIndex;
    const endLine = lineEndAt(tab.content, lastIndex + 1);
    const beforeStart = Math.max(0, lineStartAt(tab.content, startLine - 1));
    const afterEnd = lineEndAt(tab.content, endLine + 1);
    const rawText = tab.content.slice(beforeStart, afterEnd);
    const leadingWhitespace = rawText.length - rawText.trimStart().length;
    const text = rawText.trim();

    return {
      text,
      indices: (result?.indices ?? [])
        .map((i) => i - beforeStart - leadingWhitespace)
        .filter((i) => i >= 0 && i < text.length),
      before: beforeStart > 0,
      after: afterEnd < tab.content.length,
    };
  }

  const lines = tab.content
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, 14);

  const text = lines.join("\n");
  const previewMatch = normalizedQuery ? fuzzyMatch(normalizedQuery, text, 0, "preview") : null;

  return {
    text,
    indices: previewMatch?.match ? previewMatch.indices : [] as number[],
    before: false,
    after: tab.content.split(/\r?\n/).filter((line) => line.trim().length > 0).length > lines.length,
  };
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
        .map((item) => ({ ...item, indices: [] as number[], score: 0, source: null }));
    }

    return indexedTabs
      .flatMap((item): TabResult[] => {
        const match = bestMatch(query.trim(), item.tab);
        return match ? [{ ...item, indices: match.indices, score: match.score, source: match.source }] : [];
      })
      .sort((a, b) => b.score - a.score || b.tab.updatedAt - a.tab.updatedAt);
  }, [query, tabs]);

  const selectedResult = results[selectedIndex];
  const previewContext = selectedResult
    ? makePreviewContext(selectedResult.tab, selectedResult, query)
    : null;

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
        className="relative w-[min(92vw,980px)] bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
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

        <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,0.92fr)_minmax(340px,1.08fr)]">
          <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1 md:border-r md:border-border">
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
                      <span className="truncate text-[13px] text-text">{highlightText(item.tab.title, item.source === "title" ? item.indices : [])}</span>
                      {isActive && <span className="text-[10px] text-accent shrink-0">активный</span>}
                    </span>
                    <span className="block truncate text-[11px] text-text-muted/70 mt-0.5">{preview}</span>
                  </span>
                  <span className="text-[10px] text-text-muted/50 tabular-nums">#{item.index + 1}</span>
                </button>
              );
            })}
          </div>

          <aside className="hidden md:flex min-h-[52vh] max-h-[52vh] flex-col bg-surface/60">
            {selectedResult && previewContext ? (
              <>
                <div className="px-4 py-3 border-b border-border">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${selectedResult.tab.isDirty ? "bg-dirty" : selectedResult.tab.id === activeTabId ? "bg-accent" : "bg-border"}`} />
                    <h2 className="truncate text-sm font-medium text-text">{selectedResult.tab.title}</h2>
                    <span className="ml-auto text-[10px] text-text-muted/50 tabular-nums shrink-0">#{selectedResult.index + 1}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted/50">
                    {selectedResult.tab.id === activeTabId && <span className="text-accent">активный</span>}
                    {selectedResult.tab.isDirty && <span className="text-dirty">изменён</span>}
                    {selectedResult.source === "content" && <span>совпадение в тексте</span>}
                  </div>
                </div>

                <div className="flex-1 overflow-hidden p-4">
                  {previewContext.text ? (
                    <div className="h-full overflow-hidden rounded-md border border-border/70 bg-bg/40">
                      <div className="h-full overflow-hidden whitespace-pre-wrap break-words px-4 py-3 text-[12px] leading-5 text-text-muted font-mono">
                        {previewContext.before && <span className="block text-text-muted/40">...</span>}
                        <span>{highlightText(previewContext.text, previewContext.indices)}</span>
                        {previewContext.after && <span className="block text-text-muted/40">...</span>}
                      </div>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center rounded-md border border-dashed border-border text-xs text-text-muted/60">
                      Пустой таб
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs text-text-muted/60">
                Выберите таб
              </div>
            )}
          </aside>
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
