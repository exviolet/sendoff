import { useEditorStore } from "../../store/editorStore";

export function StatusBar() {
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));

  if (!tab) return null;

  const content = tab.content;
  const chars = content.length;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const lines = content.split("\n").length;

  return (
    <footer className="flex items-center h-6 px-3 bg-surface border-t border-border text-[10px] tracking-wide text-text-muted shrink-0 select-none gap-4">
      <span>{lines} {lines === 1 ? "line" : "lines"}</span>
      <span>{words} {words === 1 ? "word" : "words"}</span>
      <span>{chars} {chars === 1 ? "char" : "chars"}</span>
      <span className="ml-auto">{tab.isDirty ? "Modified" : "Saved"}</span>
    </footer>
  );
}
