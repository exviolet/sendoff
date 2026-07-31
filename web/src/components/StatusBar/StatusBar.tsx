import { useEditorStore } from "../../store/editorStore";
import { describeBinding } from "../../lib/terminalTargets";

interface StatusBarProps {
  onBindTarget: () => void;
  onWorkspaceSwitch: () => void;
}

export function StatusBar({ onBindTarget, onWorkspaceSwitch }: StatusBarProps) {
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));
  const workspaceName = useEditorStore(
    (s) => s.workspaces.find((w) => w.id === s.activeWorkspaceId)?.name,
  );

  if (!tab) return null;

  const content = tab.content;
  const chars = content.length;
  const words = content.trim() ? content.trim().split(/\s+/).length : 0;
  const lines = content.split("\n").length;

  const binding = tab.binding;
  const bindingLabel = binding ? describeBinding(binding) : null;
  const bindTitle = binding
    ? `Привязан: ${bindingLabel} — Ctrl+Alt+B перепривязать, Ctrl+Alt+Shift+B отвязать`
    : "Не привязан — Ctrl+Alt+B привязать к терминалу";

  return (
    <footer className="flex items-center h-6 px-3 bg-surface border-t border-border text-[10px] tracking-wide text-text-muted shrink-0 select-none gap-4">
      <button
        onClick={onWorkspaceSwitch}
        title="Активный workspace — Ctrl+Shift+W переключить"
        className="flex items-center gap-1 px-1.5 h-4 rounded-[3px] text-accent bg-accent/10 hover:bg-accent/20 transition-colors max-w-[160px]"
      >
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
          <rect x="2" y="3" width="12" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M2 6.5h12" stroke="currentColor" strokeWidth="1.4" />
        </svg>
        <span className="truncate text-text">{workspaceName ?? "—"}</span>
      </button>

      <button
        onClick={onBindTarget}
        title={bindTitle}
        className={`
          flex items-center gap-1 px-1.5 h-4 rounded-[3px] transition-colors
          ${binding ? "text-accent hover:bg-accent/10" : "text-text-muted/45 hover:text-text-muted hover:bg-surface-hover"}
        `}
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
          <path d="M6.5 9.5l3-3M7 4.5l1-1a2.5 2.5 0 0 1 3.5 3.5l-1 1M9 11.5l-1 1a2.5 2.5 0 0 1-3.5-3.5l1-1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="tabular-nums">{binding ? bindingLabel : "привязать"}</span>
      </button>

      <span className="ml-auto">{lines} {lines === 1 ? "line" : "lines"}</span>
      <span>{words} {words === 1 ? "word" : "words"}</span>
      <span>{chars} {chars === 1 ? "char" : "chars"}</span>
      <span>{tab.isDirty ? "Modified" : "Saved"}</span>
    </footer>
  );
}
