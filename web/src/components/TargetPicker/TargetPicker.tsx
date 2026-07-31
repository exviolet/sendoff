import { useCallback, useEffect, useMemo, useState } from "react";
import { usePickerModal } from "../../hooks/usePickerModal";
import { PickerModal, PickerHeader, PickerHint } from "../PickerModal/PickerModal";
import { useEditorStore } from "../../store/editorStore";
import { useLastTargetStore } from "../../store/lastTargetStore";
import { PROVIDERS, sameBinding, type TargetSource, type TerminalTarget } from "../../lib/terminalTargets";

interface TargetPickerProps {
  onClose: () => void;
  onPick: (target: TerminalTarget) => void;
  mode?: "send" | "bind";
}

// Статусы агентов у herdr (idle|working|blocked|done|unknown) и Orca (working|waiting|done)
// не совпадают — сводим к одной цветовой шкале. tmux статусов не отдаёт вовсе.
const STATUS_COLOR: Record<string, string> = {
  working: "bg-accent",
  blocked: "bg-dirty",
  waiting: "bg-dirty",
  idle: "bg-text-muted/50",
  done: "bg-text-muted/50",
};

interface Section {
  source: TargetSource;
  label: string;
  targets: TerminalTarget[];
}

export function TargetPicker({ onClose, onPick, mode = "send" }: TargetPickerProps) {
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  // Провайдеры опрашиваются параллельно и НЕЗАВИСИМО: отвалившийся источник (herdr-сервер
  // не запущен, Orca не установлена) просто не даёт секции — остальные работают.
  // Отдельного isAvailable() нет: это был бы второй вызов ради того же ответа.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled(PROVIDERS.map((p) => p.listTargets())).then((results) => {
      if (cancelled) return;
      const next: Section[] = [];
      results.forEach((result, i) => {
        const provider = PROVIDERS[i];
        if (result.status === "fulfilled" && result.value.length > 0) {
          next.push({ source: provider.source, label: provider.label, targets: result.value });
        }
      });
      setSections(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Плоский список — источник правды для курсора; секции рисуются поверх него.
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const flat: TerminalTarget[] = [];
    for (const section of sections) {
      for (const target of section.targets) {
        const haystack =
          `${section.label} ${target.primary} ${target.secondary ?? ""} ${target.meta ?? ""} ${target.status ?? ""}`.toLowerCase();
        if (!needle || haystack.includes(needle)) flat.push(target);
      }
    }
    return flat;
  }, [sections, query]);

  const pick = useCallback(
    (row: TerminalTarget | undefined) => {
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

  // Преселект после загрузки: привязка активного таба → последний выбранный таргет →
  // активная цель → первая строка. Ввод в поиск выделение НЕ сбрасывает (причуда
  // tmux-пикера, сохранена намеренно — при сужении списка курсор остаётся на цели).
  useEffect(() => {
    if (rows.length === 0) return;
    const { tabs, activeTabId } = useEditorStore.getState();
    const binding = tabs.find((t) => t.id === activeTabId)?.binding;
    const last = useLastTargetStore.getState().lastTarget;

    const byBinding = binding ? rows.findIndex((r) => sameBinding(binding, r.binding)) : -1;
    const byLast = last ? rows.findIndex((r) => r.source === last.source && r.handle === last.handle) : -1;
    const byActive = rows.findIndex((r) => r.isActive);

    const idx = [byBinding, byLast, byActive].find((i) => i >= 0) ?? 0;
    setSelectedIndex(idx);
  }, [rows, setSelectedIndex]);

  const visibleKeys = useMemo(() => new Set(rows.map((r) => r.key)), [rows]);

  let cursor = 0;

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
        onChange={setQuery}
        placeholder={mode === "bind" ? "Привязать таб к терминалу..." : "Выбрать цель для отправки..."}
        prefix={<span className="text-[11px] font-mono text-accent shrink-0">target</span>}
        suffix={
          <span className="text-[10px] text-text-muted/50 tabular-nums shrink-0">
            {loading ? "..." : `${rows.length}`}
          </span>
        }
      />

      <div ref={listRef} className="max-h-[58vh] overflow-y-auto py-1">
        {loading && (
          <div className="px-4 py-10 text-center text-xs text-text-muted/60">Опрос терминалов...</div>
        )}

        {!loading && rows.length === 0 && (
          <div className="px-4 py-10 text-center text-xs text-text-muted/60">
            {query.trim() ? "Ничего не найдено" : "Нет доступных целей"}
            {!query.trim() && (
              <div className="mt-1 text-[10px] text-text-muted/40">
                Ни herdr, ни Orca, ни tmux не отвечают
              </div>
            )}
          </div>
        )}

        {!loading && sections.map((section) => {
          const visible = section.targets.filter((t) => visibleKeys.has(t.key));
          if (visible.length === 0) return null;

          return (
            <section key={section.source} className="border-b border-border/40 last:border-b-0">
              <div className="sticky top-0 z-10 flex items-center gap-2 px-4 py-1.5 bg-surface/95 border-b border-border/30">
                <span className="text-[10px] uppercase tracking-widest text-accent">{section.label}</span>
                <span className="text-[10px] text-text-muted/40 tabular-nums">{visible.length}</span>
              </div>

              <div className="py-1">
                {visible.map((target) => {
                  // Плоский курсор сквозь секции — тот же счётчик, что индексирует rows.
                  const current = cursor++;
                  const selected = current === selectedIndex;

                  return (
                    <button
                      key={target.key}
                      data-picker-index={current}
                      onClick={() => pick(target)}
                      onMouseEnter={() => setSelectedIndex(current)}
                      className={`
                        w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2 text-left transition-colors duration-75
                        ${selected ? "bg-accent/10" : "hover:bg-surface-hover/50"}
                      `}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${target.status ? (STATUS_COLOR[target.status] ?? "bg-border") : "bg-border/40"}`}
                        title={target.status ?? ""}
                      />
                      <span className="min-w-0 flex flex-col">
                        <span className="min-w-0 flex items-center gap-2">
                          <span className="truncate text-[12px] text-text">{target.primary}</span>
                          {target.isActive && <span className="shrink-0 text-[9px] text-accent">active</span>}
                        </span>
                        {target.secondary && (
                          <span className="truncate text-[10px] text-text-muted/55">{target.secondary}</span>
                        )}
                      </span>
                      <span className="text-[10px] text-text-muted/45 font-mono truncate max-w-[140px]">
                        {target.meta}
                      </span>
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
