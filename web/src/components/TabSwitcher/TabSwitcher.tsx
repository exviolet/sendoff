import { useCallback, useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useEditorStore } from "../../store/editorStore";
import type { Tab } from "../../store/editorStore";
import { tabsOf } from "../../lib/tabUtils";
import { fuzzyMatch } from "../../lib/fuzzyMatch";
import { highlightMatches } from "../../lib/highlight";
import { describeBinding } from "../../lib/terminalTargets";
import { usePickerModal, type PickerKeyContext } from "../../hooks/usePickerModal";
import { PickerModal, PickerHeader, PickerHint } from "../PickerModal/PickerModal";

interface TabSwitcherProps {
  onClose: () => void;
}

interface MatchResult {
  match: boolean;
  score: number;
  indices: number[];
  source: "title" | "binding" | "preview" | "content";
}

interface TabResult {
  tab: Tab;
  index: number;
  indices: number[];
  score: number;
  source: MatchResult["source"] | null;
}

// «Только привязанные»-фильтр держится на сессию (сбрасывается на перезагрузке), но
// переживает закрытие/открытие модалки. IndexedDB-персист не нужен — это эфемерный
// режим просмотра, не настройка.
let sessionBoundOnly = false;

function bindingLabel(tab: Tab): string {
  return tab.binding ? describeBinding(tab.binding) : "";
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

// Обёртка над lib/fuzzyMatch: добавляет source (концерн этого компонента, не lib).
function scored(query: string, text: string, baseScore: number, source: MatchResult["source"]): MatchResult {
  return { ...fuzzyMatch(query, text, baseScore), source };
}

function bestMatch(query: string, tab: Tab) {
  const title = scored(query, tab.title, 20, "title");
  const label = bindingLabel(tab);
  // Привязка участвует в поиске: печатаешь `work:claude` или просто `claude` —
  // привязанный таб всплывает. Балл между title и preview.
  const binding: MatchResult = label
    ? scored(query, label, 16, "binding")
    : { match: false, score: 0, indices: [], source: "binding" };
  const preview = scored(query, makePreview(tab), 8, "preview");
  const content = scored(query, tab.content, 0, "content");
  const matches = [title, binding, preview, content].filter((result) => result.match);
  if (matches.length === 0) return null;
  return matches.sort((a, b) => b.score - a.score)[0];
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
  const previewMatch = normalizedQuery ? fuzzyMatch(normalizedQuery, text, 0) : null;

  return {
    text,
    indices: previewMatch?.match ? previewMatch.indices : [] as number[],
    before: false,
    after: tab.content.split(/\r?\n/).filter((line) => line.trim().length > 0).length > lines.length,
  };
}

export function TabSwitcher({ onClose }: TabSwitcherProps) {
  const allTabs = useEditorStore((s) => s.tabs);
  const tabGroups = useEditorStore((s) => s.tabGroups);
  const groupOf = useCallback(
    (tab: Tab) => (tab.groupId ? tabGroups.find((g) => g.id === tab.groupId) : undefined),
    [tabGroups],
  );
  const activeWorkspaceId = useEditorStore((s) => s.activeWorkspaceId);
  // Скоуп активного workspace: кросс-workspace поиск — это Ctrl+Shift+D (global search).
  const tabs = useMemo(() => tabsOf(allTabs, activeWorkspaceId), [allTabs, activeWorkspaceId]);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const pendingClose = useEditorStore((s) => s.pendingClose);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);
  const [query, setQuery] = useState("");
  const [boundOnly, setBoundOnly] = useState(sessionBoundOnly);

  const boundCount = useMemo(() => tabs.filter((t) => t.binding).length, [tabs]);

  // setIndex приходит аргументом — обе точки вызова (клавиша до хука, кнопка после)
  // передают его сами, см. PickerKeyContext.
  const toggleBoundOnly = useCallback((setIndex: Dispatch<SetStateAction<number>>) => {
    setBoundOnly((v) => {
      sessionBoundOnly = !v;
      return !v;
    });
    setIndex(0);
  }, []);

  const results = useMemo(() => {
    const indexedTabs = tabs
      .map((tab, index) => ({ tab, index }))
      .filter((item) => !boundOnly || item.tab.binding);

    if (!query.trim()) {
      // Пустой запрос: привязанные первыми, внутри групп — по свежести.
      return indexedTabs
        .sort((a, b) => {
          const aBound = a.tab.binding ? 1 : 0;
          const bBound = b.tab.binding ? 1 : 0;
          if (aBound !== bBound) return bBound - aBound;
          return b.tab.updatedAt - a.tab.updatedAt;
        })
        .map((item) => ({ ...item, indices: [] as number[], score: 0, source: null }));
    }

    return indexedTabs
      .flatMap((item): TabResult[] => {
        const match = bestMatch(query.trim(), item.tab);
        return match ? [{ ...item, indices: match.indices, score: match.score, source: match.source }] : [];
      })
      .sort((a, b) => b.score - a.score || b.tab.updatedAt - a.tab.updatedAt);
  }, [query, tabs, boundOnly]);

  const selectResult = useCallback((id: string) => {
    setActiveTab(id);
    onClose();
  }, [onClose, setActiveTab]);

  const closeSelected = useCallback((index: number, setIndex: Dispatch<SetStateAction<number>>) => {
    const item = results[index];
    if (!item) return;

    const nextIndex = Math.min(index, Math.max(0, results.length - 2));
    closeTab(item.tab.id);
    setIndex(nextIndex);
  }, [closeTab, results]);

  // Клавиши сверх дефолтной навигации примитива: гасим их сами (true) и оставляем
  // bespoke-поведение здесь — примитив про них не знает.
  const onKeyDown = useCallback((e: KeyboardEvent, { index, setIndex }: PickerKeyContext) => {
    if (e.key === "Tab") {
      e.preventDefault();
      e.stopPropagation();
      toggleBoundOnly(setIndex);
      return true;
    }

    // Только Ctrl+Del закрывает таб. Ctrl+Backspace НЕ перехватываем — это
    // стандартное «удалить слово» в инпуте поиска.
    if ((e.ctrlKey || e.metaKey) && e.key === "Delete") {
      e.preventDefault();
      e.stopPropagation();
      closeSelected(index, setIndex);
      return true;
    }

    return false;
  }, [closeSelected, toggleBoundOnly]);

  const onEnter = useCallback((index: number) => {
    const item = results[index];
    if (item) selectResult(item.tab.id);
  }, [results, selectResult]);

  const { selectedIndex, setSelectedIndex, inputRef, listRef } = usePickerModal({
    count: results.length,
    onEnter,
    onClose,
    onKeyDown,
    // Подтверждение закрытия таба открыто — модалка не должна перехватывать клавиши.
    disabled: pendingClose !== null,
  });

  const selectedResult = results[selectedIndex];
  const previewContext = selectedResult
    ? makePreviewContext(selectedResult.tab, selectedResult, query)
    : null;

  return (
    <PickerModal
      onClose={onClose}
      width="min(92vw, 980px)"
      footer={
        <PickerHint>
          <span>↑↓ навигация</span>
          <span>↵ открыть</span>
          <span>Tab только привязанные</span>
          <span>Ctrl+Del закрыть</span>
          <span>Esc закрыть</span>
        </PickerHint>
      }
    >
      <PickerHeader
        inputRef={inputRef}
        value={query}
        onChange={(v) => {
          setQuery(v);
          setSelectedIndex(0);
        }}
        placeholder={boundOnly ? "Найти привязанный таб..." : "Найти таб..."}
        prefix={
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="text-text-muted shrink-0">
            <path d="M3 4h10M3 8h7M3 12h9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
        }
        suffix={
          <>
            <button
              type="button"
              onClick={() => toggleBoundOnly(setSelectedIndex)}
              title="Только привязанные к терминалу — herdr / Orca / tmux (Tab)"
              className={`shrink-0 px-2 py-0.5 rounded-[3px] border text-[10px] font-medium transition-colors ${
                boundOnly
                  ? "border-accent/30 bg-accent/15 text-accent"
                  : "border-border text-text-muted hover:text-text"
              }`}
            >
              привязанные
            </button>
            <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
              {results.length}/{boundOnly ? boundCount : tabs.length}
            </span>
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-[minmax(260px,0.92fr)_minmax(340px,1.08fr)]">
        <div ref={listRef} className="max-h-[52vh] overflow-y-auto py-1 md:border-r md:border-border">
          {results.length === 0 && (
            <div className="px-4 py-8 text-center text-text-muted text-xs">
              {boundOnly && boundCount === 0 ? "Нет привязанных табов" : "Ничего не найдено"}
            </div>
          )}
          {results.map((item, i) => {
            const isSelected = i === selectedIndex;
            const isActive = item.tab.id === activeTabId;
            const preview = makePreview(item.tab);

            return (
              <button
                key={item.tab.id}
                data-picker-index={i}
                onClick={() => selectResult(item.tab.id)}
                onMouseEnter={() => setSelectedIndex(i)}
                // Цвет группы — полосой слева: читается периферийным зрением при
                // проматывании списка, в отличие от метки в конце плотной строки.
                style={groupOf(item.tab)
                  ? { borderLeft: `2px solid var(--color-group-${groupOf(item.tab)!.color})` }
                  : { borderLeft: "2px solid transparent" }}
                className={`
                  w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 pl-3 pr-4 py-2.5 text-left
                  transition-colors duration-75
                  ${isSelected ? "bg-accent/10 text-text" : "text-text-muted hover:text-text hover:bg-surface-hover/50"}
                `}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${item.tab.isDirty ? "bg-dirty" : isActive ? "bg-accent" : "bg-border"}`} />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="truncate text-[13px] text-text">{highlightMatches(item.tab.title, item.source === "title" ? item.indices : [])}</span>
                    {isActive && <span className="text-[10px] text-accent shrink-0">активный</span>}
                    {/* Метка группы: только цвет и имя, БЕЗ участия в fuzzy-скоринге —
                        иначе bestMatch пришлось бы расширять пятым источником
                        (tasks/14, решение 7). */}
                    {/* Цвет уже несёт полоса слева — здесь только имя, без второй точки. */}
                    {groupOf(item.tab) && (
                      <span
                        className="shrink-0 truncate max-w-[90px] text-[9px] leading-none"
                        style={{ color: `var(--color-group-${groupOf(item.tab)!.color})` }}
                        title={`группа → ${groupOf(item.tab)!.name}`}
                      >
                        {groupOf(item.tab)!.name}
                      </span>
                    )}
                    {item.tab.binding && (
                      <span
                        className="shrink-0 px-1.5 py-0.5 rounded-[3px] bg-accent/10 text-accent text-[9px] font-mono leading-none"
                        title={`терминал → ${bindingLabel(item.tab)}`}
                      >
                        {item.source === "binding"
                          ? highlightMatches(bindingLabel(item.tab), item.indices)
                          : bindingLabel(item.tab)}
                      </span>
                    )}
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
                  {selectedResult.tab.binding && (
                    <span className="shrink-0 px-1.5 py-0.5 rounded-[3px] bg-accent/10 text-accent text-[10px] font-mono leading-none">
                      {bindingLabel(selectedResult.tab)}
                    </span>
                  )}
                  <span className="ml-auto text-[10px] text-text-muted/50 tabular-nums shrink-0">#{selectedResult.index + 1}</span>
                  <button
                    type="button"
                    onClick={() => closeSelected(selectedIndex, setSelectedIndex)}
                    className="h-6 px-2 rounded-[3px] border border-danger/20 bg-danger/10 text-[10px] text-danger hover:bg-danger/20 transition-colors shrink-0"
                    title="Закрыть выбранный таб"
                  >
                    Закрыть
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[10px] text-text-muted/50">
                  {selectedResult.tab.id === activeTabId && <span className="text-accent">активный</span>}
                  {selectedResult.tab.isDirty && <span className="text-dirty">изменён</span>}
                  {selectedResult.source === "content" && <span>совпадение в тексте</span>}
                  {selectedResult.source === "binding" && <span>совпадение в привязке</span>}
                </div>
              </div>

              <div className="flex-1 overflow-hidden p-4">
                {previewContext.text ? (
                  <div className="h-full overflow-hidden rounded-md border border-border/70 bg-bg/40">
                    <div className="h-full overflow-hidden whitespace-pre-wrap break-words px-4 py-3 text-[12px] leading-5 text-text-muted font-mono">
                      {previewContext.before && <span className="block text-text-muted/40">...</span>}
                      <span>{highlightMatches(previewContext.text, previewContext.indices)}</span>
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
    </PickerModal>
  );
}
