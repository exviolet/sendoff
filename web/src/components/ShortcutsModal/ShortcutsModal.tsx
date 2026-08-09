import { useCallback, useEffect, useRef, useState } from "react";
import {
  effectiveChords,
  formatChord,
  isValidChord,
  replaceChord,
  resetAllShortcuts,
  resetShortcut,
  shortcutCommands,
  type Chord,
  type ShortcutCommandId,
  type ShortcutOverrides,
} from "../../lib/shortcuts";
import { useSettingsStore } from "../../store/settingsStore";

const GROUP_ORDER = ["Tabs", "Editing", "Markdown", "Panels", "Files", "Help"] as const;
type ShortcutGroup = (typeof GROUP_ORDER)[number];

// Эти строки описывают семантику ввода и структурный выход, а не команды.
// Они намеренно остаются вне реестра, но должны быть видимы в справке — и,
// в отличие от команд, не редактируются.
const NON_COMMAND_SHORTCUTS: Partial<
  Record<ShortcutGroup, readonly { keys: string; action: string }[]>
> = {
  Markdown: [
    { keys: "Tab", action: "Indent / nest list item" },
    { keys: "Shift+Tab", action: "Outdent" },
    { keys: "Enter", action: "Continue list or quote" },
    { keys: "`", action: "Wrap selection (third in a row — code block)" },
  ],
  Panels: [{ keys: "Escape", action: "Close panels" }],
};

type Recording = { commandId: ShortcutCommandId; chord: Chord };
type Conflict = {
  commandId: ShortcutCommandId;
  oldChord: Chord;
  newChord: Chord;
  ownerLabel: string;
};

const labelOf = (id: ShortcutCommandId) =>
  shortcutCommands.find((command) => command.id === id)?.label ?? id;

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  const overrides = useSettingsStore((state) => state.shortcutOverrides);
  const setOverrides = useSettingsStore((state) => state.setShortcutOverrides);

  const [recording, setRecording] = useState<Recording | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Esc во время записи обязан отменять запись, а не закрывать модалку. Обработчик
  // закрытия смотрит в ref, а не в состояние: он вешается один раз и иначе видел бы
  // recording === null навсегда.
  const recordingRef = useRef<Recording | null>(null);
  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);

  const apply = useCallback(
    (next: ShortcutOverrides) => {
      setOverrides(next);
      setRecording(null);
      setConflict(null);
      setError(null);
    },
    [setOverrides],
  );

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !recordingRef.current) {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  // Запись комбинации. Ловим на capture и глушим доставку: без этого записываемый
  // Ctrl+W закрыл бы таб, а Ctrl+Shift+P открыл палитру поверх модалки.
  useEffect(() => {
    if (!recording) return;

    function onKeyDown(e: KeyboardEvent) {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === "Escape") {
        setRecording(null);
        return;
      }

      const chord: Chord = {
        code: e.code,
        ...(e.ctrlKey || e.metaKey ? { ctrl: true } : {}),
        ...(e.shiftKey ? { shift: true } : {}),
        ...(e.altKey ? { alt: true } : {}),
      };
      // Пока зажат только модификатор — ждём саму клавишу, а не отвергаем ввод.
      if (!isValidChord(chord)) return;

      const target = recording as Recording;
      const result = replaceChord(overrides, target.commandId, target.chord, chord);
      if (!result.ok) {
        setError(
          result.reason === "would-unbind-shortcuts"
            ? "This is the only chord for the shortcuts list — otherwise the window becomes unreachable."
            : "That chord cannot be assigned.",
        );
        setRecording(null);
        return;
      }
      if (result.stolenFrom) {
        setConflict({
          commandId: target.commandId,
          oldChord: target.chord,
          newChord: chord,
          ownerLabel: labelOf(result.stolenFrom),
        });
        setRecording(null);
        return;
      }
      apply(result.overrides);
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [recording, overrides, apply]);

  function confirmSteal() {
    if (!conflict) return;
    const result = replaceChord(overrides, conflict.commandId, conflict.oldChord, conflict.newChord);
    if (result.ok) apply(result.overrides);
    else setConflict(null);
  }

  const hasOverrides = Object.keys(overrides).length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-text">Keyboard shortcuts</h2>
          <div className="flex items-center gap-2">
            {hasOverrides && (
              <button
                onClick={() => apply(resetAllShortcuts())}
                className="text-[10px] text-text-muted hover:text-text px-2 py-1 rounded hover:bg-surface-hover transition-colors"
              >
                Reset all
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        {(recording || conflict || error) && (
          <div className="px-5 py-2 border-b border-border bg-surface-hover/40 text-[11px]">
            {recording && (
              <span className="text-accent">
                Press a new chord for “{labelOf(recording.commandId)}” — Esc cancels.
              </span>
            )}
            {conflict && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">
                  {formatChord(conflict.newChord)} is taken by “{conflict.ownerLabel}”. Reassign?
                </span>
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setConflict(null)}
                    className="px-2 py-0.5 rounded border border-border text-text-muted hover:text-text"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={confirmSteal}
                    className="px-2 py-0.5 rounded bg-accent/15 text-accent hover:bg-accent/25"
                  >
                    Reassign
                  </button>
                </div>
              </div>
            )}
            {error && <span className="text-dirty">{error}</span>}
          </div>
        )}

        <div className="px-5 py-4 max-h-[60vh] overflow-y-auto space-y-4">
          {GROUP_ORDER.map((title) => (
            <div key={title}>
              <h3 className="text-[10px] uppercase tracking-widest text-text-muted/60 mb-2">
                {title}
              </h3>
              <div className="space-y-1">
                {shortcutCommands
                  .filter((command) => command.group === title)
                  .map((command) => {
                    const chords = effectiveChords(command.id, overrides);
                    const changed = overrides[command.id] !== undefined;
                    return (
                      <div key={command.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                        <span className="text-text-muted min-w-0 truncate">{command.label}</span>
                        <div className="flex items-center gap-1 shrink-0">
                          {changed && (
                            <button
                              onClick={() => apply(resetShortcut(overrides, command.id))}
                              title="Restore default chord"
                              className="text-[10px] text-text-muted/60 hover:text-text px-1"
                            >
                              ↺
                            </button>
                          )}
                          {chords.length === 0 && (
                            <span className="text-[10px] text-text-muted/40 italic">unassigned</span>
                          )}
                          {chords.map((chord) => {
                            const isRecording =
                              recording?.commandId === command.id &&
                              formatChord(recording.chord) === formatChord(chord);
                            return (
                              <button
                                key={formatChord(chord)}
                                onClick={() => {
                                  setError(null);
                                  setConflict(null);
                                  setRecording({ commandId: command.id, chord });
                                }}
                                title="Click to rebind"
                                className={`text-[10px] px-2 py-0.5 rounded border font-mono transition-colors ${
                                  isRecording
                                    ? "border-accent text-accent bg-accent/10 animate-pulse"
                                    : "border-border/50 bg-surface-hover text-text-muted/80 hover:border-accent/50 hover:text-text"
                                }`}
                              >
                                {isRecording ? "waiting…" : formatChord(chord)}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                {(NON_COMMAND_SHORTCUTS[title] ?? []).map((item) => (
                  <div key={item.keys} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="text-text-muted min-w-0 truncate">{item.action}</span>
                    <kbd className="text-[10px] text-text-muted/80 bg-surface-hover px-2 py-0.5 rounded border border-border/50 font-mono shrink-0">
                      {item.keys}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
