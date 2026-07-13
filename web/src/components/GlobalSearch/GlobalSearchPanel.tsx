import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { findMatches, type MatchResult } from "../../lib/replaceEngine";
import { useEditorStore } from "../../store/editorStore";
import type { Tab } from "../../store/editorStore";

interface GlobalSearchPanelProps {
  onClose: () => void;
  onOpenMatch: (tabId: string, match: MatchResult) => void;
}

interface TabMatches {
  tab: Tab;
  tabIndex: number;
  matches: MatchResult[];
}

interface FlatResult {
  tab: Tab;
  tabIndex: number;
  match: MatchResult;
  matchIndex: number;
}

function makeSnippet(content: string, match: MatchResult) {
  const radius = 72;
  const rawStart = Math.max(0, match.index - radius);
  const rawEnd = Math.min(content.length, match.index + match.length + radius);
  const lineStart = content.lastIndexOf("\n", Math.max(0, match.index - 1));
  const lineEnd = content.indexOf("\n", match.index + match.length);
  const start = Math.max(rawStart, lineStart === -1 ? 0 : lineStart + 1);
  const end = Math.min(rawEnd, lineEnd === -1 ? content.length : lineEnd);
  const rawText = content.slice(start, end);
  const leadingTrim = rawText.length - rawText.trimStart().length;
  const text = rawText.trim();
  const index = Math.max(0, match.index - start - Math.max(0, leadingTrim));

  return {
    text,
    indices: Array.from({ length: match.length }, (_, i) => index + i).filter((i) => i >= 0 && i < text.length),
    before: start > 0,
    after: end < content.length,
  };
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

export function GlobalSearchPanel({ onClose, onOpenMatch }: GlobalSearchPanelProps) {
  // Намеренно кросс-workspace (в отличие от Ctrl+T): это escape hatch из изоляции.
  // Выбор таба из чужого workspace переключит workspace — setActiveTab делает это сам.
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const workspaces = useEditorStore((s) => s.workspaces);
  const activeWorkspaceId = useEditorStore((s) => s.activeWorkspaceId);
  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [regex, setRegex] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const groupedResults = useMemo<TabMatches[]>(() => {
    const needle = query.trim();
    if (!needle) return [];

    return tabs
      .map((tab, tabIndex) => ({
        tab,
        tabIndex,
        matches: findMatches(tab.content, needle, { caseSensitive, regex }),
      }))
      .filter((item) => item.matches.length > 0);
  }, [caseSensitive, query, regex, tabs]);

  const flatResults = useMemo<FlatResult[]>(
    () => groupedResults.flatMap((group) =>
      group.matches.map((match, matchIndex) => ({
        tab: group.tab,
        tabIndex: group.tabIndex,
        match,
        matchIndex,
      }))
    ),
    [groupedResults]
  );

  const totalMatches = flatResults.length;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, caseSensitive, regex]);

  const openResult = useCallback((result: FlatResult | undefined) => {
    if (!result) return;
    onOpenMatch(result.tab.id, result.match);
    onClose();
  }, [onClose, onOpenMatch]);

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
        if (totalMatches > 0) setSelectedIndex((i) => Math.min(i + 1, totalMatches - 1));
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        openResult(flatResults[selectedIndex]);
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [flatResults, onClose, openResult, selectedIndex, totalMatches]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector(`[data-result-index="${selectedIndex}"]`) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  let resultCursor = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[10vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-[min(94vw,900px)] bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <circle cx="7" cy="7" r="4" stroke="currentColor" strokeWidth="1.4" />
            <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по всем табам..."
            className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-muted/50"
          />
          <ToggleButton active={caseSensitive} onClick={() => setCaseSensitive((v) => !v)} title="Case sensitive">
            Aa
          </ToggleButton>
          <ToggleButton active={regex} onClick={() => setRegex((v) => !v)} title="Regex">
            .*
          </ToggleButton>
          <span className="text-[10px] text-text-muted/50 tabular-nums w-24 text-right">
            {query.trim() ? `${totalMatches} совп.` : `${tabs.length} табов`}
          </span>
        </div>

        <div ref={listRef} className="max-h-[62vh] overflow-y-auto py-1">
          {!query.trim() && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">
              Введите текст для поиска по открытым табам
            </div>
          )}

          {query.trim() && groupedResults.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">
              Совпадений нет
            </div>
          )}

          {groupedResults.map((group) => (
            <section key={group.tab.id} className="border-b border-border/40 last:border-b-0">
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-2 bg-surface/95 border-b border-border/30">
                <span className={`w-1.5 h-1.5 rounded-full ${group.tab.isDirty ? "bg-dirty" : group.tab.id === activeTabId ? "bg-accent" : "bg-border"}`} />
                <span className="truncate text-[12px] text-text">{group.tab.title}</span>
                {group.tab.workspaceId !== activeWorkspaceId && (
                  <span className="shrink-0 text-[9px] px-1 py-px rounded-sm bg-surface-hover text-text-muted/70">
                    {workspaces.find((w) => w.id === group.tab.workspaceId)?.name ?? "?"}
                  </span>
                )}
                {group.tab.id === activeTabId && <span className="text-[10px] text-accent shrink-0">активный</span>}
                <span className="ml-auto text-[10px] text-text-muted/50 tabular-nums shrink-0">
                  #{group.tabIndex + 1} · {group.matches.length}
                </span>
              </div>

              <div className="py-1">
                {group.matches.map((match) => {
                  const current = resultCursor++;
                  const selected = current === selectedIndex;
                  const snippet = makeSnippet(group.tab.content, match);

                  return (
                    <button
                      key={`${group.tab.id}-${match.index}-${current}`}
                      data-result-index={current}
                      onClick={() => openResult({ tab: group.tab, tabIndex: group.tabIndex, match, matchIndex: current })}
                      onMouseEnter={() => setSelectedIndex(current)}
                      className={`
                        w-full grid grid-cols-[auto_1fr_auto] gap-3 px-4 py-2 text-left transition-colors duration-75
                        ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
                      `}
                    >
                      <span className="pt-0.5 text-[10px] text-text-muted/45 tabular-nums">
                        {current + 1}
                      </span>
                      <span className="min-w-0 whitespace-pre-wrap break-words text-[11px] leading-5 text-text-muted">
                        {snippet.before && <span className="text-text-muted/40">... </span>}
                        {highlightText(snippet.text, snippet.indices)}
                        {snippet.after && <span className="text-text-muted/40"> ...</span>}
                      </span>
                      <span className="pt-0.5 text-[10px] text-text-muted/45 tabular-nums">
                        {match.index}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
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

function ToggleButton({ active, onClick, title, children }: {
  active: boolean;
  onClick: () => void;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
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
