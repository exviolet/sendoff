import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { marked } from "marked";
import { useEditorStore } from "../../store/editorStore";
import { useTriggerPhrasesStore } from "../../store/triggerPhrasesStore";
import { isTauri } from "../../lib/platform";
import { useEditorKeymap } from "../../hooks/useEditorKeymap";
import { useImageAttachment } from "../../hooks/useImageAttachment";
import type { EditPatch } from "../../lib/markdownEdit";
import {
  applySlashItem,
  detectSlashQuery,
  filterSlashItems,
  phraseSlashItem,
  slashItems,
  type SlashItem,
  type SlashTrigger,
} from "../../lib/slashMenu";
import { caretCoords, type CaretPoint } from "./caretCoords";
import { SlashMenu } from "./SlashMenu";

interface HighlightMatch {
  index: number;
  length: number;
}

interface EditorProps {
  highlights?: HighlightMatch[];
  activeHighlight?: number;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  markdownPreview?: boolean;
  fontSize?: number;
  wordWrap?: boolean;
}

const ACCEPTED_EXTENSIONS = [".txt", ".md", ".markdown", ".text"];

function isAcceptedFile(file: File): boolean {
  return ACCEPTED_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext));
}

export function Editor({ highlights = [], activeHighlight = -1, textareaRef, markdownPreview = false, fontSize = 13, wordWrap = true }: EditorProps) {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateContent = useEditorStore((s) => s.updateContent);
  const addTabFromFile = useEditorStore((s) => s.addTabFromFile);
  const { attachClipboardImage } = useImageAttachment(textareaRef);

  // Контент нужен в рендере только для markdown preview и highlight backdrop.
  // В обычном режиме возвращаем "" — Zustand не триггерит ре-рендер при вводе.
  const renderContent = useEditorStore((s) =>
    markdownPreview || highlights.length > 0
      ? (s.tabs.find((t) => t.id === s.activeTabId)?.content ?? "")
      : ""
  );

  // hasTab нужен только для null-guard — не подписываемся на content
  const hasTab = useEditorStore((s) => s.tabs.some((t) => t.id === s.activeTabId));

  const phrases = useTriggerPhrasesStore((s) => s.phrases);

  const backdropRef = useRef<HTMLDivElement>(null);
  // Состояние слэш-меню держится здесь и равно null, пока меню закрыто: пока оно null,
  // ввод не вызывает ни одного ре-рендера сверх обычного (см. renderContent выше).
  const [slash, setSlash] = useState<{
    trigger: SlashTrigger;
    point: CaretPoint;
    // Замеряются вместе с кареткой: читать ref.current в рендере запрещено правилом
    // react-hooks/refs, а меню должно знать, куда ему не вылезать.
    bounds: { width: number; height: number };
  } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  // Индекс слэша, который пользователь закрыл Escape'ом. Без этого Escape бесполезен:
  // следующая же буква снова открывала бы меню, и написать «/h2» текстом было бы нельзя.
  const [slashDismissed, setSlashDismissed] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const rafRef = useRef<number | undefined>(undefined);
  // Отслеживаем контент вне React — для определения внешних изменений
  const prevStoreContent = useRef("");

  // Инициализируем prevStoreContent при монтировании
  useEffect(() => {
    prevStoreContent.current = useEditorStore.getState().tabs.find((t) => t.id === activeTabId)?.content ?? "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // На смену таба — принудительно обновляем textarea
  useEffect(() => {
    const content = useEditorStore.getState().tabs.find((t) => t.id === activeTabId)?.content ?? "";
    if (textareaRef.current) {
      textareaRef.current.value = content;
    }
    prevStoreContent.current = content;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, [activeTabId, textareaRef]);

  // Внешние изменения (undo/redo, preset apply) — обновляем textarea через subscribe,
  // без React ре-рендера
  useEffect(() => {
    const unsub = useEditorStore.subscribe((state) => {
      const content = state.tabs.find((t) => t.id === state.activeTabId)?.content ?? "";
      if (content !== prevStoreContent.current) {
        prevStoreContent.current = content;
        // Смена таба, undo/redo, применение пресета — текст под меню больше не тот,
        // на котором оно открылось. Свои же правки сюда не доходят: applyPatch и
        // onChange обновляют prevStoreContent до записи в стор.
        setSlash(null);
        if (textareaRef.current && textareaRef.current.value !== content) {
          const { selectionStart, selectionEnd } = textareaRef.current;
          textareaRef.current.value = content;
          textareaRef.current.setSelectionRange(selectionStart, selectionEnd);
        }
      }
    });
    return unsub;
  }, [textareaRef]);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeTabId, textareaRef]);

  useEffect(() => {
    if (!isTauri) return;
    let unlisten: (() => void) | undefined;

    (async () => {
      const { getCurrentWebview } = await import("@tauri-apps/api/webview");
      const { readTextFile } = await import("@tauri-apps/plugin-fs");

      unlisten = await getCurrentWebview().onDragDropEvent(async (event) => {
        if (event.payload.type === "over") {
          setIsDragging(true);
        } else if (event.payload.type === "drop") {
          for (const filePath of event.payload.paths) {
            const ext = filePath.split(".").pop()?.toLowerCase();
            if (["txt", "md", "markdown", "text"].includes(ext ?? "")) {
              const content = await readTextFile(filePath);
              const name = filePath.split(/[\\/]/).pop() ?? "Untitled";
              addTabFromFile(name, content);
            }
          }
          setIsDragging(false);
          dragCounter.current = 0;
        } else {
          setIsDragging(false);
          dragCounter.current = 0;
        }
      });
    })();

    return () => { unlisten?.(); };
  }, [addTabFromFile]);

  // Правки клавиатурных операций идут мимо onChange, поэтому стор обновляем руками.
  // Висящий RAF от предыдущего ввода обязателен к отмене: он держит значение,
  // снятое ДО патча, и, сработав следом, откатил бы результат.
  const applyPatch = useCallback(
    (patch: EditPatch) => {
      const ta = textareaRef.current;
      if (!ta) return;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      const before = ta.value;
      ta.setRangeText(patch.text, patch.from, patch.to, "preserve");
      ta.setSelectionRange(patch.selStart, patch.selEnd);

      // setRangeText не доскролливает каретку (нативный ввод — доскролливает), поэтому
      // Enter в конце длинного текста уводил бы её за кадр. Пере-фокус заставляет браузер
      // показать каретку и ничего не двигает, когда она и так видна.
      ta.blur();
      ta.focus();

      if (ta.value === before) return;
      prevStoreContent.current = ta.value;
      if (activeTabId) updateContent(activeTabId, ta.value);
    },
    [textareaRef, activeTabId, updateContent]
  );

  const editorKeyDown = useEditorKeymap(applyPatch);

  const slashList = useMemo(() => {
    if (!slash) return [];
    const catalog = slashItems(
      phrases.map((p) => phraseSlashItem(p.id, p.label, p.body)),
    );
    return filterSlashItems(catalog, slash.trigger.query);
  }, [slash, phrases]);

  // Пересчёт триггера по тексту слева от каретки. Раскладконезависим по построению:
  // смотрим на вставленный символ, а не на код клавиши (на ЙЦУКЕН Slash даёт «.»).
  const refreshSlash = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    if (ta.selectionStart !== ta.selectionEnd) {
      setSlash(null);
      return;
    }
    const trigger = detectSlashQuery(ta.value, ta.selectionStart);
    if (!trigger) {
      setSlash(null);
      setSlashDismissed(null);
      return;
    }
    // Тот же слэш, что закрыли Escape'ом, второй раз не открываем. Другой слэш —
    // другое намерение, метка снимается сама сравнением индексов.
    if (trigger.from === slashDismissed) {
      setSlash(null);
      return;
    }
    setSlash({
      // Меню висит под самим слэшем, а не под кареткой: иначе оно ползло бы вбок,
      // пока набирается запрос.
      point: caretCoords(ta, trigger.from),
      trigger,
      bounds: { width: ta.clientWidth, height: ta.clientHeight },
    });
    setSlashIndex(0);
  }, [textareaRef, slashDismissed]);

  const pickSlash = useCallback(
    (item: SlashItem) => {
      const ta = textareaRef.current;
      if (!ta) return;
      // Триггер перечитывается из живой textarea, а не берётся из состояния: сохранённый
      // мог устареть (внешняя правка, смена таба), и вставка ушла бы по чужим индексам.
      const trigger = detectSlashQuery(ta.value, ta.selectionStart);
      setSlash(null);
      if (!trigger) return;
      applyPatch(applySlashItem(ta.value, trigger, ta.selectionStart, item));
    },
    [applyPatch, textareaRef],
  );

  // Перехват обязан стоять ДО useEditorKeymap: иначе Enter уйдёт в continueList, а Tab —
  // в indentSelection. stopPropagation нужен для Escape — глобальный листенер закрыл бы
  // заодно панели, которых пользователь не трогал.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (slash && slashList.length > 0 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const total = slashList.length;
        switch (e.code) {
          case "ArrowDown":
            e.preventDefault();
            setSlashIndex((i) => (i + 1) % total);
            return;
          case "ArrowUp":
            e.preventDefault();
            setSlashIndex((i) => (i - 1 + total) % total);
            return;
          case "Enter":
          case "Tab":
            e.preventDefault();
            e.stopPropagation();
            pickSlash(slashList[Math.min(slashIndex, total - 1)]);
            return;
          case "Escape":
            e.preventDefault();
            e.stopPropagation();
            setSlashDismissed(slash.trigger.from);
            setSlash(null);
            return;
        }
      }
      // Уход каретки вбок или по строкам — запрос больше не про эту позицию.
      if (slash && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(e.code)) {
        setSlash(null);
      }
      editorKeyDown(e);
    },
    [slash, slashList, slashIndex, pickSlash, editorKeyDown],
  );

  const syncScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, [textareaRef]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current = 0;
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files).filter(isAcceptedFile);
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = () => {
        addTabFromFile(file.name, reader.result as string);
      };
      reader.readAsText(file);
    }
  }, [addTabFromFile]);

  const renderedMarkdown = useMemo(() => {
    if (!markdownPreview) return "";
    return marked.parse(renderContent, { async: false }) as string;
  }, [markdownPreview, renderContent]);

  if (!hasTab) return null;

  return (
    <div
      className="h-full relative bg-bg overflow-hidden"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {markdownPreview ? (
        <div
          className="absolute inset-0 w-full h-full p-6 pt-5 overflow-y-auto prose-markdown text-text"
          dangerouslySetInnerHTML={{ __html: renderedMarkdown }}
        />
      ) : (
        <>
          {/* Highlight backdrop */}
          {highlights.length > 0 && (
            <div
              ref={backdropRef}
              className="absolute inset-0 w-full h-full p-6 pt-5 overflow-hidden pointer-events-none leading-[1.7] tracking-wide text-transparent"
              style={{
                fontSize: `${fontSize}px`,
                whiteSpace: wordWrap ? "pre-wrap" : "pre",
                wordBreak: wordWrap ? "break-word" : "normal",
                overflowX: wordWrap ? "hidden" : "auto",
              }}
              dangerouslySetInnerHTML={{
                __html: buildHighlightHTML(renderContent, highlights, activeHighlight),
              }}
            />
          )}

          <textarea
            ref={textareaRef}
            defaultValue={useEditorStore.getState().tabs.find((t) => t.id === activeTabId)?.content ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              prevStoreContent.current = value;
              const id = activeTabId;
              if (rafRef.current) cancelAnimationFrame(rafRef.current);
              rafRef.current = requestAnimationFrame(() => { if (id) updateContent(id, value); });
              refreshSlash();
            }}
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              // Текст пусть вставляется браузером как обычно — перехватываем только
              // картинку, у которой в буфере нет файла на диске, а значит и пути.
              if (!isTauri) return;
              // Решение принимается по types события, а не по его содержимому: саму
              // картинку WebKitGTK в событии не отдаёт (см. imageFromClipboard).
              // Есть текст — это не наш случай, отдаём событие браузеру нетронутым.
              const types = Array.from(e.clipboardData.types);
              if (types.some((t) => t.startsWith("text/"))) return;
              // Текста нет — значит браузеру вставлять всё равно нечего, гасим и
              // читаем буфер сами. Читать надо здесь же: это жест пользователя.
              e.preventDefault();
              void attachClipboardImage();
            }}
            onClick={() => { if (slash) setSlash(null); }}
            onBlur={() => { if (slash) setSlash(null); }}
            onScroll={syncScroll}
            placeholder="Start typing or paste text..."
            spellCheck={false}
            className="
              absolute inset-0 w-full h-full
              bg-transparent text-text placeholder:text-text-muted/40
              leading-[1.7] tracking-wide
              p-6 pt-5
              resize-none outline-none
              caret-accent
            "
            style={{
              fontSize: `${fontSize}px`,
              whiteSpace: wordWrap ? "pre-wrap" : "pre",
              wordBreak: wordWrap ? "break-word" : "normal",
              overflowX: wordWrap ? "hidden" : "auto",
            }}
          />

          {/* Пустой список — меню не рисуется вовсе: висящая пустая рамка читалась бы
              как «редактор завис», а не как «ничего не нашлось». */}
          {slash && slashList.length > 0 && (
            <SlashMenu
              items={slashList}
              index={Math.min(slashIndex, slashList.length - 1)}
              point={slash.point}
              bounds={slash.bounds}
              onPick={pickSlash}
              onHover={setSlashIndex}
            />
          )}
        </>
      )}

      <div className="absolute inset-x-0 top-0 h-px bg-border/50 pointer-events-none" />

      {/* Drop overlay */}
      {isDragging && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-bg/80 backdrop-blur-sm border-2 border-dashed border-accent/50 rounded-lg m-3 animate-drop-zone">
          <div className="flex flex-col items-center gap-3 text-accent">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" className="animate-drop-icon">
              <path d="M12 3v12M8 11l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="text-sm tracking-wide font-medium">Drop files here</span>
            <span className="text-xs text-text-muted">.txt, .md, .markdown</span>
          </div>
        </div>
      )}
    </div>
  );
}

function buildHighlightHTML(content: string, matches: HighlightMatch[], activeIdx: number): string {
  if (matches.length === 0) return escapeHTML(content) + "\n";

  let result = "";
  let lastEnd = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    result += escapeHTML(content.slice(lastEnd, m.index));
    const cls = i === activeIdx ? "bg-accent/40 text-text" : "bg-accent/20 text-text";
    result += `<mark class="${cls} rounded-[2px]">${escapeHTML(content.slice(m.index, m.index + m.length))}</mark>`;
    lastEnd = m.index + m.length;
  }

  result += escapeHTML(content.slice(lastEnd));
  return result + "\n";
}

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
