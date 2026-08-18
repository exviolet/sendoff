import { useCallback, useEffect, useState } from "react";
import { useEditorStore } from "../../store/editorStore";
import { useOnboardingStore } from "../../store/onboardingStore";
import { PROVIDERS } from "../../lib/terminalTargets";
import type { TerminalTarget } from "../../lib/terminalTargets";

// Первый запуск проверяет РОВНО один сценарий: увидеть таргет → привязать → написать →
// Ctrl+Enter → увидеть подтверждение отправки. Ни темы, ни шрифта, ни workspace, ни
// хоткеев здесь нет и быть не должно — всё это настраивается потом и из настроек.
//
// Экран не запирает редактор: «Continue without a target» доступен всегда, а Escape
// закрывает так же. Обязательный wizard на приложении, которое и без таргета остаётся
// рабочим редактором, был бы враньём про его возможности.

interface Row {
  target: TerminalTarget;
  providerLabel: string;
}

export function OnboardingOverlay({ onOpenDoctor }: { onOpenDoctor: () => void }) {
  const finish = useOnboardingStore((s) => s.finish);
  const [targets, setTargets] = useState<Row[] | null>(null);
  const [bound, setBound] = useState<string | null>(null);

  const load = useCallback(() => {
    void (async () => {
      // Через провайдеров напрямую, а не через диагностику: для привязки нужен полный
      // TerminalTarget с binding, диагностика же намеренно несёт только подпись и хендл.
      const found = await Promise.all(
        PROVIDERS.map(async (provider) => {
          try {
            return (await provider.listTargets()).map((target) => ({
              target,
              providerLabel: provider.label,
            }));
          } catch {
            // Почему именно не получилось — работа Doctor'а, здесь это лишний шум.
            return [] as Row[];
          }
        }),
      );
      setTargets(found.flat());
    })();
  }, []);

  // Сброс в «идёт поиск» — в обработчике «Try again», не в эффекте: синхронный setState
  // в теле эффекта запрещён линтером (каскадный ререндер).
  const scan = useCallback(() => {
    setTargets(null);
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Escape") {
        e.preventDefault();
        finish();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [finish]);

  function bind(row: Row) {
    const { activeTabId, setTabBinding } = useEditorStore.getState();
    if (activeTabId) setTabBinding(activeTabId, row.target.binding);
    setBound(`${row.providerLabel} · ${row.target.primary}`);
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="relative w-full max-w-md bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down">
        <div className="px-5 py-4 border-b border-border">
          <h2 className="text-sm font-medium text-text">Welcome to Sendoff</h2>
          <p className="mt-1 text-[11px] text-text-muted leading-relaxed">
            Write a prompt here, then send it to a terminal agent with one keystroke.
          </p>
        </div>

        <div className="px-5 py-4 text-[11px]">
          {bound ? (
            <div className="space-y-2">
              <div className="text-text">
                This tab is now bound to <span className="text-accent">{bound}</span>.
              </div>
              <div className="text-text-muted leading-relaxed">
                Type your prompt and press{" "}
                <kbd className="px-1 py-0.5 rounded bg-surface-hover text-text">Ctrl+Enter</kbd>. A
                toast will confirm what was sent and where.
              </div>
            </div>
          ) : targets === null ? (
            <div className="py-4 text-center text-text-muted">Looking for terminal agents…</div>
          ) : targets.length > 0 ? (
            <>
              <div className="text-text-muted">Pick the agent to send this tab to:</div>
              <div className="mt-2 space-y-1">
                {targets.map((row) => (
                  <button
                    key={row.target.key}
                    onClick={() => bind(row)}
                    className="w-full text-left px-2.5 py-2 rounded border border-border hover:border-accent hover:bg-surface-hover transition-colors"
                  >
                    <div className="text-text">{row.target.primary}</div>
                    <div className="text-[10px] text-text-muted">{row.providerLabel}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="text-text">No terminal agents found.</div>
              <div className="text-text-muted leading-relaxed">
                Sendoff looks for tmux, Herdr and Orca. Start one of them, or check what Sendoff
                actually sees.
              </div>
              <div className="flex gap-2">
                <button
                  onClick={scan}
                  className="px-2.5 py-1.5 rounded bg-surface-hover hover:bg-border text-text transition-colors"
                >
                  Try again
                </button>
                <button
                  onClick={onOpenDoctor}
                  className="px-2.5 py-1.5 rounded bg-surface-hover hover:bg-border text-text transition-colors"
                >
                  Open Doctor
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-border text-right">
          <button
            onClick={finish}
            className="text-[11px] text-text-muted hover:text-text transition-colors"
          >
            {bound ? "Got it" : "Continue without a target"}
          </button>
        </div>
      </div>
    </div>
  );
}
