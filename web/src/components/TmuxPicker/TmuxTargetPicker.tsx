import { useCallback, useEffect, useMemo, useState } from "react";
import { listTmuxTargets, type TmuxSessionInfo, type TmuxPickTarget } from "../../hooks/useTmuxSend";
import { usePickerModal } from "../../hooks/usePickerModal";
import { PickerModal, PickerHeader, PickerHint } from "../PickerModal/PickerModal";
import { useTmuxStore } from "../../store/tmuxStore";

interface TmuxTargetPickerProps {
  onClose: () => void;
  onPick: (target: TmuxPickTarget) => void;
  mode?: "send" | "bind";
}

interface TargetRow {
  session: string;
  windowIndex: string;
  windowId: string;
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
          windowId: w.id,
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

  const pick = useCallback(
    (row: TargetRow | undefined) => {
      if (!row) return;
      onPick({
        paneId: row.paneId,
        session: row.session,
        window: row.windowName,
        windowId: row.windowId,
        label: rowLabel(row, multiSession),
      });
    },
    [multiSession, onPick]
  );

  const onEnter = useCallback((i: number) => pick(rows[i]), [pick, rows]);

  const { selectedIndex, setSelectedIndex, inputRef, listRef } = usePickerModal({
    count: rows.length,
    onEnter,
    onClose,
  });

  // Пре-выделить последний выбранный таргет, если он ещё существует. Отсюда же —
  // единственный сброс выделения: на ввод в инпут его НЕ сбрасываем (причуда пикера).
  useEffect(() => {
    if (rows.length === 0) return;
    const last = useTmuxStore.getState().lastTarget;
    const idx = last ? rows.findIndex((r) => r.paneId === last.pane) : -1;
    setSelectedIndex(idx >= 0 ? idx : 0);
  }, [rows, setSelectedIndex]);

  let cursor = 0;

  return (
    <PickerModal
      onClose={onClose}
      footer={
        <PickerHint>
          <span>↑↓ навигация</span>
          <span>↵ {mode === "bind" ? "привязать" : "отправить"}</span>
          <span>Esc закрыть</span>
        </PickerHint>
      }
    >
      <PickerHeader
        inputRef={inputRef}
        value={query}
        onChange={setQuery}
        placeholder={mode === "bind" ? "Привязать таб к окну / pane..." : "Выбрать окно / pane для отправки..."}
        prefix={<span className="text-[11px] font-mono text-accent shrink-0">tmux</span>}
        suffix={
          <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
            {loading ? "..." : `${rows.length}`}
          </span>
        }
      />

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
                <span className="text-[10px] uppercase tracking-widest text-accent">{session.name}</span>
              </div>

              <div className="py-1">
                {visible.map(({ window, pane }) => {
                  // Плоский курсор сквозь секции — тот же счётчик, что индексирует rows.
                  const current = cursor++;
                  const selected = current === selectedIndex;
                  const label = window.name || `window ${window.index}`;

                  return (
                    <button
                      key={pane.paneId}
                      data-picker-index={current}
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
    </PickerModal>
  );
}
