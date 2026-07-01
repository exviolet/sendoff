import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listOrcaAgentTargets, type OrcaAgentTarget } from "../../hooks/useOrcaSend";

interface OrcaTargetPickerProps {
  onClose: () => void;
  onPick: (target: OrcaAgentTarget) => void;
  mode?: "send" | "bind";
}

const STATE_COLOR: Record<string, string> = {
  working: "bg-accent",
  waiting: "bg-dirty",
  done: "bg-text-muted/50",
};

export function OrcaTargetPicker({ onClose, onPick, mode = "send" }: OrcaTargetPickerProps) {
  const [targets, setTargets] = useState<OrcaAgentTarget[]>([]);
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
    listOrcaAgentTargets()
      .then((result) => {
        if (cancelled) return;
        setTargets(result);
        const active = result.findIndex((r) => r.isActive);
        setSelectedIndex(active >= 0 ? active : 0);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Не удалось получить список Orca-агентов");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return targets;
    return targets.filter((t) =>
      `${t.displayName} ${t.title} ${t.agentType} ${t.state} ${t.promptPreview}`
        .toLowerCase()
        .includes(needle),
    );
  }, [targets, query]);

  const pick = useCallback(
    (row: OrcaAgentTarget | undefined) => {
      if (row) onPick(row);
    },
    [onPick],
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
    const item = listRef.current?.querySelector(
      `[data-row-index="${selectedIndex}"]`,
    ) as HTMLElement | null;
    item?.scrollIntoView({ block: "nearest" });
  }, [selectedIndex]);

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-[min(94vw,640px)] bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <span className="text-[11px] font-mono text-accent shrink-0">orca</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder={mode === "bind" ? "Привязать таб к Orca-агенту..." : "Выбрать Orca-агента для отправки..."}
            className="flex-1 bg-transparent text-text text-sm outline-none placeholder:text-text-muted/50"
          />
          <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
            {loading ? "..." : `${rows.length}`}
          </span>
        </div>

        <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1">
          {loading && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">Загрузка Orca-агентов...</div>
          )}

          {!loading && error && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">
              Orca недоступна
              <div className="mt-1 text-[10px] text-text-muted/40 break-words">{error}</div>
            </div>
          )}

          {!loading && !error && rows.length === 0 && (
            <div className="px-4 py-10 text-center text-xs text-text-muted/60">
              {query.trim() ? "Ничего не найдено" : "Нет запущенных Orca-агентов"}
            </div>
          )}

          {!loading && !error && rows.map((row, index) => {
            const selected = index === selectedIndex;
            return (
              <button
                key={row.handle}
                data-row-index={index}
                onClick={() => pick(row)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={`
                  w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-left transition-colors duration-75
                  ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
                `}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATE_COLOR[row.state] ?? "bg-border"}`}
                  title={row.state}
                />
                <span className="min-w-0 flex flex-col">
                  <span className="min-w-0 flex items-center gap-2">
                    <span className="truncate text-[12px] text-text">{row.title}</span>
                    <span className="shrink-0 text-[9px] uppercase tracking-wide text-accent/80">{row.agentType}</span>
                    {row.isActive && <span className="shrink-0 text-[9px] text-accent">active</span>}
                  </span>
                  {row.promptPreview && (
                    <span className="truncate text-[10px] text-text-muted/55">{row.promptPreview}</span>
                  )}
                </span>
                <span className="text-[10px] text-text-muted/45 truncate max-w-[140px]">{row.displayName}</span>
              </button>
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
