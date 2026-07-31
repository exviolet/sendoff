import { useCallback, useEffect, useMemo, useState } from "react";
import { listHerdrAgentTargets, type HerdrAgentTarget } from "../../hooks/useHerdrSend";
import { usePickerModal } from "../../hooks/usePickerModal";
import { PickerModal, PickerHeader, PickerHint } from "../PickerModal/PickerModal";

interface HerdrTargetPickerProps {
  onClose: () => void;
  onPick: (target: HerdrAgentTarget) => void;
  mode?: "send" | "bind";
}

// agent_status ∈ idle | working | blocked | done | unknown (herdr API protocol 17).
const STATUS_COLOR: Record<string, string> = {
  working: "bg-accent",
  blocked: "bg-dirty",
  idle: "bg-text-muted/50",
  done: "bg-text-muted/50",
};

export function HerdrTargetPicker({ onClose, onPick, mode = "send" }: HerdrTargetPickerProps) {
  const [targets, setTargets] = useState<HerdrAgentTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return targets;
    return targets.filter((t) =>
      `${t.workspace} ${t.tab} ${t.agentType} ${t.status} ${t.cwd} ${t.titleHint}`
        .toLowerCase()
        .includes(needle),
    );
  }, [targets, query]);

  const pick = useCallback(
    (row: HerdrAgentTarget | undefined) => {
      if (row) onPick(row);
    },
    [onPick],
  );

  const onEnter = useCallback((i: number) => pick(rows[i]), [pick, rows]);

  const { selectedIndex, setSelectedIndex, inputRef, listRef } = usePickerModal({
    count: rows.length,
    onEnter,
    onClose,
  });

  // Async-загрузка + преселект сфокусированного агента (после данных, поэтому не initialIndex).
  useEffect(() => {
    let cancelled = false;
    listHerdrAgentTargets()
      .then((result) => {
        if (cancelled) return;
        setTargets(result);
        const active = result.findIndex((r) => r.isActive);
        setSelectedIndex(active >= 0 ? active : 0);
        setLoading(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Не удалось получить список Herdr-агентов");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setSelectedIndex]);

  return (
    <PickerModal
      onClose={onClose}
      width="min(94vw, 640px)"
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
        onChange={(v) => {
          setQuery(v);
          setSelectedIndex(0);
        }}
        placeholder={mode === "bind" ? "Привязать таб к Herdr-агенту..." : "Выбрать Herdr-агента для отправки..."}
        prefix={<span className="text-[11px] font-mono text-accent shrink-0">herdr</span>}
        suffix={
          <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
            {loading ? "..." : `${rows.length}`}
          </span>
        }
      />

      <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1">
        {loading && (
          <div className="px-4 py-10 text-center text-xs text-text-muted/60">Загрузка Herdr-агентов...</div>
        )}

        {!loading && error && (
          <div className="px-4 py-10 text-center text-xs text-text-muted/60">
            Herdr недоступен
            <div className="mt-1 text-[10px] text-text-muted/40 break-words">{error}</div>
          </div>
        )}

        {!loading && !error && rows.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-text-muted/60">
            {query.trim() ? "Ничего не найдено" : "Нет запущенных Herdr-агентов"}
          </div>
        )}

        {!loading && !error && rows.map((row, index) => {
          const selected = index === selectedIndex;
          return (
            <button
              key={row.paneId}
              data-picker-index={index}
              onClick={() => pick(row)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`
                w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-left transition-colors duration-75
                ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
              `}
            >
              <span
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[row.status] ?? "bg-border"}`}
                title={row.status}
              />
              <span className="min-w-0 flex flex-col">
                <span className="min-w-0 flex items-center gap-2">
                  <span className="truncate text-[12px] text-text">{row.workspace}/{row.tab}</span>
                  <span className="shrink-0 text-[9px] uppercase tracking-wide text-accent/80">{row.agentType}</span>
                  {row.isActive && <span className="shrink-0 text-[9px] text-accent">focused</span>}
                </span>
                {row.titleHint && (
                  <span className="truncate text-[10px] text-text-muted/55">{row.titleHint}</span>
                )}
              </span>
              <span className="text-[10px] text-text-muted/45 truncate max-w-[140px]" title={row.cwd}>
                {row.cwd.split("/").pop()}
              </span>
            </button>
          );
        })}
      </div>
    </PickerModal>
  );
}
