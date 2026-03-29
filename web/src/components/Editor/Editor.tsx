import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { marked } from "marked";
import { useEditorStore } from "../../store/editorStore";
import { isTauri } from "../../lib/platform";

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
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const updateContent = useEditorStore((s) => s.updateContent);
  const addTabFromFile = useEditorStore((s) => s.addTabFromFile);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);

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

  const markdownContent = tab?.content ?? "";
  const renderedMarkdown = useMemo(() => {
    if (!markdownPreview) return "";
    return marked.parse(markdownContent, { async: false }) as string;
  }, [markdownPreview, markdownContent]);

  if (!tab) return null;

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
                __html: buildHighlightHTML(tab.content, highlights, activeHighlight),
              }}
            />
          )}

          <textarea
            ref={textareaRef}
            value={tab.content}
            onChange={(e) => updateContent(tab.id, e.target.value)}
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

function escapeHTML(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
