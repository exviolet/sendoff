import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listTmuxTargets, type TmuxSessionInfo, type TmuxPickTarget } from "../../hooks/useTmuxSend";
import { useTmuxStore } from "../../store/tmuxStore";

interface TmuxTargetPickerProps {
  onClose: () => void;
  onPick: (target: TmuxPickTarget) => void;
  mode?: "send" | "bind";
}

interface TargetRow {
  session: string;
  windowIndex: string;
  windowName: string;
  windowActive: boolean;
  paneId: string;
  command: string;
  paneActive: boolean;
}

function flatten(sessions: TmuxSessionInfo[]): TargetRow[] {
  const rows: TargetRow[] = [];
  for (const s of sessions) {
    for (const w of s.windows) {
      for (const p of w.panes) {
        rows.push({
          session: s.name,
          windowIndex: w.index,
          windowName: w.name,
          windowActive: w.windowActive,
          paneId: p.paneId,
          command: p.command,
          paneActive: p.paneActive,
        });
      }
    }
  }
  return rows;
}

function rowLabel(row: TargetRow, multiSession: boolean): string {
  const win = row.windowName || `window ${row.windowIndex}`;
  return multiSession ? `${row.session}:${win}` : win;
}

export function TmuxTargetPicker({ onClose, onPick, mode = "send" }: TmuxTargetPickerProps) {
  const [sessions, setSessions] = useState<TmuxSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    listTmuxTargets()
      .then((result) => {
        if (cancelled) return;
        setSessions(result);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Не удалось получить список tmux-таргетов");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const multiSession = sessions.length > 1;

  const rows = useMemo(() => {
    const all = flatten(sessions);
    const needle = query.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((r) =>
      `${r.session} ${r.windowIndex} ${r.windowName} ${r.command} ${r.paneId}`
        .toLowerCase()
        .includes(needle)
    );
  }, [sessions, query]);

  // Пре-выделить последний выбранный таргет, если он ещё существует.
  useEffect(() => {
    if (rows.length === 0) return;
    const last = useTmuxStore.getState().lastTarget;
    const idx = last ? rows.findIndex((r) => r.paneId === last.pane) : -1;
    setSelectedIndex(idx >= 0 ? idx : 0);
  }, [rows]);

  const pick = useCallback(
    (row: TargetRow | undefined) => {
      if (!row) return;
      onPick({
        paneId: row.paneId,
        session: row.session,
        window: row.windowName,
        label: rowLabel(row, multiSession),
      });
    },
    [multiSession, onPick]
  );

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
        if (rows.length > 0) setSelectedIndex((i) => Math.min(i + 1, rows.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        pick(rows[selectedIndex]);
      }
    }
    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose, pick, rows, selectedIndex]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const item = list.querySelector(`[data-row-index="${selectedIndex}"]`) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  let cursor = 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-[min(94vw,640px)] bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-[11px] font-mono text-accent shrink-0">tmux</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === "bind" ? "Привязать таб к окну / pane..." : "Выбрать окно / pane для отправки..."}
            className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-muted/50"
          />
          <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
            {loading ? "..." : `${rows.length}`}
          </span>
        </div>

        <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1">
          {loading && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">Загрузка топологии tmux...</div>
          )}

          {!loading && error && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">
              tmux недоступен
              <div className="mt-1 text-[10px] text-text-muted/40 break-words">{error}</div>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">
              {query.trim() ? "Ничего не найдено" : "Нет доступных tmux-окон"}
            </div>
          )}

          {!loading && !error && sessions.map((session) => {
            const sessionRows = session.windows.flatMap((w) =>
              w.panes.map((p) => ({ window: w, pane: p }))
            );
            const visible = sessionRows.filter(({ window, pane }) =>
              rows.some((r) => r.paneId === pane.paneId && r.windowIndex === window.index)
            );
            if (visible.length === 0) return null;

            return (
              <section key={session.name} className="border-b border-border/40 last:border-b-0">
                <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-surface/95 border-b border-border/30">
                  <span className="text-[10px] uppercase tracking-widest text-text-muted/55">{session.name}</span>
                </div>

                <div className="py-1">
                  {visible.map(({ window, pane }) => {
                    const current = cursor++;
                    const selected = current === selectedIndex;
                    const label = window.name || `window ${window.index}`;

                    return (
                      <button
                        key={pane.paneId}
                        data-row-index={current}
                        onClick={() => pick(rows[current])}
                        onMouseEnter={() => setSelectedIndex(current)}
                        className={`
                          w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-left transition-colors duration-75
                          ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
                        `}
                      >
                        <span className="text-[10px] text-text-muted/45 tabular-nums w-6">{window.index}:</span>
                        <span className="min-w-0 flex items-center gap-2">
                          <span className="truncate text-[12px] text-text">{label}</span>
                          <span className="truncate text-[10px] text-text-muted/55 font-mono">{pane.command}</span>
                          {pane.paneActive && window.windowActive && (
                            <span className="text-[9px] text-accent shrink-0">active</span>
                          )}
                        </span>
                        <span className="text-[10px] text-text-muted/40 font-mono tabular-nums shrink-0">{pane.paneId}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-text-muted/50">
          <span>↑↓ навигация</span>
          <span>↵ {mode === "bind" ? "привязать" : "отправить"}</span>
          <span>Esc закрыть</span>
        </div>
      </div>
    </div>
  );
}
