import { useRef, useEffect, useCallback } from "react";
import { useEditorStore } from "../../store/editorStore";

interface HighlightMatch {
  index: number;
  length: number;
}

interface EditorProps {
  highlights?: HighlightMatch[];
  activeHighlight?: number;
}

export function Editor({ highlights = [], activeHighlight = -1 }: EditorProps) {
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const updateContent = useEditorStore((s) => s.updateContent);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, [activeTabId]);

  const syncScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop;
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft;
    }
  }, []);

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
    <div className="h-full relative bg-bg overflow-hidden">
      {/* Highlight backdrop */}
      {highlights.length > 0 && (
        <div
          ref={backdropRef}
          className="absolute inset-0 w-full h-full p-6 pt-5 overflow-hidden pointer-events-none text-[13px] leading-[1.7] tracking-wide whitespace-pre-wrap break-words text-transparent"
          style={{ wordBreak: "break-word" }}
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
          text-[13px] leading-[1.7] tracking-wide
          p-6 pt-5
          resize-none outline-none
          caret-accent
        "
      />

      <div className="absolute inset-x-0 top-0 h-px bg-border/50 pointer-events-none" />
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
