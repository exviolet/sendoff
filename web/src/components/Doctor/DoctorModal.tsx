import { useCallback, useEffect, useState } from "react";
import { collectDiagnostics } from "../../lib/diagnostics/collect";
import { formatReport } from "../../lib/diagnostics/report";
import type { Diagnostics, ProviderDiagnostic } from "../../lib/diagnostics/types";

// Doctor ничего не чинит и ничего не настраивает — только показывает и даёт скопировать.
// Кнопки «установить», «выдать permission», «перезапустить провайдера» здесь появиться
// не должны: это уже конфигуратор, а не диагностика.

const STATUS_MARK: Record<ProviderDiagnostic["status"], { glyph: string; className: string }> = {
  ready: { glyph: "✓", className: "text-accent" },
  error: { glyph: "!", className: "text-danger" },
  "not-found": { glyph: "○", className: "text-text-muted" },
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2 leading-relaxed">
      <span className="w-24 shrink-0 text-text-muted">{label}</span>
      <span className="min-w-0 break-all text-text">{value}</span>
    </div>
  );
}

function ProviderBlock({ provider }: { provider: ProviderDiagnostic }) {
  const mark = STATUS_MARK[provider.status];

  return (
    <div className="py-2.5 border-b border-border/60 last:border-b-0">
      <div className="flex items-center gap-2">
        <span className={`w-3 text-center ${mark.className}`}>{mark.glyph}</span>
        <span className="text-text">{provider.label}</span>
      </div>

      <div className="mt-1 pl-5 text-[11px] text-text-muted leading-relaxed">
        {provider.location.kind === "found" ? (
          <div className="break-all">
            Executable: {provider.location.path ?? `${provider.executable} (path unknown)`}
          </div>
        ) : (
          // Формулировка про PATH, а не про систему: у GUI-запуска PATH урезанный, и
          // «не найден» честно означает лишь «не виден Sendoff», а не «не установлен».
          <div>Executable {provider.executable} not found in Sendoff PATH</div>
        )}

        {/* Короткая форма, а не сырой конверт: провайдеры отвечают JSON'ом на десятки
            строк, и в дампе тонет сама причина. Полный вывод живёт в отчёте — он для
            отладки по чужому репорту, а этот экран человек читает глазами. */}
        {provider.failure && (
          <div className="mt-1">
            <div className="text-danger/90">Target discovery failed</div>
            {provider.failure.code && (
              <div className="mt-0.5 font-mono text-[10px] text-danger/70">
                {provider.failure.code}
              </div>
            )}
            <div className="mt-0.5 text-danger/70 leading-relaxed whitespace-pre-wrap break-words">
              {provider.failure.summary}
            </div>
          </div>
        )}

        {provider.status === "ready" &&
          (provider.targets.length === 0 ? (
            <div className="mt-1">No targets found</div>
          ) : (
            <div className="mt-1 space-y-1">
              {provider.targets.map((target) => (
                <div key={`${target.handle}:${target.primary}`}>
                  <div className="text-text/90">{target.primary}</div>
                  {/* Хендл — то, что проверяют валидаторы send-пути в манифесте.
                      Видимый формат ловит класс отказа, при котором discovery зелёный,
                      а отправка молча запрещена. */}
                  <div className="font-mono text-[10px] break-all">handle: {target.handle}</div>
                </div>
              ))}
            </div>
          ))}
      </div>
    </div>
  );
}

export function DoctorModal({ onClose }: { onClose: () => void }) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // collectDiagnostics гасит отказы внутри и не отклоняется: Doctor обязан открыться
  // именно тогда, когда всё сломано.
  const load = useCallback(() => {
    void collectDiagnostics().then((result) => {
      setDiagnostics(result);
      setLoading(false);
    });
  }, []);

  // Сброс в «загрузку» живёт в обработчике кнопки, а не в эффекте: синхронный setState
  // в теле эффекта даёт каскадный ререндер (react-hooks/set-state-in-effect).
  const refresh = useCallback(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.code === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  async function copyReport() {
    if (!diagnostics) return;
    await navigator.clipboard.writeText(formatReport(diagnostics));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div
        className="relative w-full max-w-lg bg-surface border border-border rounded-lg shadow-2xl overflow-hidden animate-slide-down"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h2 className="text-sm font-medium text-text">Sendoff Doctor</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className="text-[10px] text-text-muted hover:text-text px-2 py-1 rounded hover:bg-surface-hover transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="flex items-center justify-center w-6 h-6 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            >
              <svg width="10" height="10" viewBox="0 0 8 8" fill="none">
                <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-3 text-[11px]">
          {loading && !diagnostics ? (
            <div className="py-6 text-center text-text-muted">Collecting diagnostics…</div>
          ) : diagnostics ? (
            <>
              <div className="text-text-muted uppercase tracking-wide text-[10px]">Application</div>
              <div className="mt-1.5 space-y-0.5">
                <Row label="Sendoff" value={`${diagnostics.app.version} (${diagnostics.app.identifier})`} />
                <Row label="Tauri" value={diagnostics.app.tauriVersion} />
                <Row label="WebKitGTK" value={diagnostics.app.webkitVersion ?? "unknown"} />
                <Row label="Data" value={diagnostics.app.dataDir ?? "unknown"} />
              </div>

              <div className="mt-4 text-text-muted uppercase tracking-wide text-[10px]">
                Terminal providers
              </div>
              <div className="mt-0.5">
                {diagnostics.providers.map((provider) => (
                  <ProviderBlock key={provider.source} provider={provider} />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="flex items-center justify-end px-5 py-3 border-t border-border">
          <button
            onClick={copyReport}
            disabled={!diagnostics}
            className="text-[11px] px-3 py-1.5 rounded bg-surface-hover hover:bg-border text-text transition-colors disabled:opacity-50"
          >
            {copied ? "Copied" : "Copy diagnostic report"}
          </button>
        </div>
      </div>
    </div>
  );
}
