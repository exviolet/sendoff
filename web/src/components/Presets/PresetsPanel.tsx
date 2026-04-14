import { useState, useEffect, useMemo, useCallback } from "react";
import { usePresetsStore } from "../../store/presetsStore";
import type { ReplacePreset } from "../../store/presetsStore";
import type { ReplacePair } from "../../lib/replaceEngine";
import { previewReplacePairs, type DiffEntry } from "../../lib/replaceEngine";
import { useEditorStore } from "../../store/editorStore";
import { PresetEditor } from "./PresetEditor";
import { isTauri } from "../../lib/platform";
import { toast } from "../../store/toastStore";

function isValidPreset(data: unknown): data is { name: string; pairs: ReplacePair[] } {
  if (typeof data !== "object" || data === null) return false;
  const obj = data as Record<string, unknown>;
  if (typeof obj.name !== "string" || !obj.name.trim()) return false;
  if (!Array.isArray(obj.pairs) || obj.pairs.length === 0) return false;
  return obj.pairs.every((p: unknown) => {
    if (typeof p !== "object" || p === null) return false;
    const pair = p as Record<string, unknown>;
    return typeof pair.from === "string" && typeof pair.to === "string";
  });
}

async function exportPreset(preset: ReplacePreset) {
  const json = JSON.stringify({ name: preset.name, pairs: preset.pairs }, null, 2);
  const fileName = `${preset.name.replace(/[^a-zA-Zа-яА-ЯёЁ0-9_-]/g, "_")}.json`;

  if (isTauri) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const path = await save({
      filters: [{ name: "JSON", extensions: ["json"] }],
      defaultPath: fileName,
    });
    if (path) {
      await writeTextFile(path, json);
      toast(`Пресет экспортирован: ${preset.name}`, "success");
    }
    return;
  }

  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  toast(`Пресет экспортирован: ${preset.name}`, "success");
}

interface PresetsPanelProps {
  onClose: () => void;
}

export function PresetsPanel({ onClose }: PresetsPanelProps) {
  const presets = usePresetsStore((s) => s.presets);
  const addPreset = usePresetsStore((s) => s.addPreset);
  const updatePreset = usePresetsStore((s) => s.updatePreset);
  const deletePreset = usePresetsStore((s) => s.deletePreset);
  const lastApplyResult = usePresetsStore((s) => s.lastApplyResult);
  const clearLastResult = usePresetsStore((s) => s.clearLastResult);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const updateContent = useEditorStore((s) => s.updateContent);
  const tabContent = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.content ?? "");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [previewPresetId, setPreviewPresetId] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleImportPreset = useCallback(async () => {
    function processPresetData(raw: string) {
      const data: unknown = JSON.parse(raw);
      if (!isValidPreset(data)) {
        setImportError("Неверный формат пресета");
        return;
      }
      const preset: ReplacePreset = {
        id: crypto.randomUUID(),
        name: data.name,
        pairs: data.pairs.map((p) => ({
          from: p.from,
          to: p.to,
          caseSensitive: p.caseSensitive ?? true,
          wholeWord: p.wholeWord ?? false,
        })),
      };
      addPreset(preset);
      setImportError(null);
      toast(`Пресет импортирован: ${data.name}`, "success");
    }

    if (isTauri) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const { readTextFile } = await import("@tauri-apps/plugin-fs");
        const path = await open({
          filters: [{ name: "JSON", extensions: ["json"] }],
        });
        if (!path) return;
        const raw = await readTextFile(path);
        processPresetData(raw);
      } catch {
        setImportError("Ошибка чтения файла");
      }
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          processPresetData(reader.result as string);
        } catch {
          setImportError("Ошибка чтения файла");
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }, [addPreset]);

  const previewData = useMemo(() => {
    if (!previewPresetId || !tabContent) return null;
    const preset = presets.find((p) => p.id === previewPresetId);
    if (!preset) return null;
    return previewReplacePairs(tabContent, preset.pairs);
  }, [previewPresetId, tabContent, presets]);

  useEffect(() => {
    if (lastApplyResult) {
      const timer = setTimeout(clearLastResult, 2500);
      return () => clearTimeout(timer);
    }
  }, [lastApplyResult, clearLastResult]);

  function handleApply(presetId: string) {
    if (!activeTabId) return;
    setPreviewPresetId(presetId);
  }

  function confirmApply() {
    if (!activeTabId || !previewData) return;
    updateContent(activeTabId, previewData.result);
    usePresetsStore.setState({
      lastApplyResult: {
        presetName: presets.find((p) => p.id === previewPresetId)?.name ?? "",
        count: previewData.totalCount,
      },
    });
    setPreviewPresetId(null);
  }

  function handleCreateSave(name: string, pairs: ReplacePair[]) {
    const preset: ReplacePreset = {
      id: crypto.randomUUID(),
      name,
      pairs,
    };
    addPreset(preset);
    setIsCreating(false);
  }

  function handleEditSave(name: string, pairs: ReplacePair[]) {
    if (!editingId) return;
    updatePreset(editingId, { name, pairs });
    setEditingId(null);
  }

  return (
    <div className="absolute right-0 top-0 bottom-0 w-80 bg-surface border-l border-border flex flex-col z-10 animate-slide-left">
      {/* Header */}
      <div className="flex items-center justify-between h-10 px-3 border-b border-border shrink-0">
        <span className="text-[11px] text-text-muted tracking-wide uppercase">Presets</span>
        <button
          onClick={onClose}
          className="flex items-center justify-center w-6 h-6 rounded-[3px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Toast */}
      {lastApplyResult && (
        <div className="mx-3 mt-2 px-2.5 py-1.5 bg-accent/10 border border-accent/20 rounded-[4px] text-[10px] text-accent animate-slide-down">
          {lastApplyResult.count > 0
            ? `Replaced ${lastApplyResult.count} occurrences`
            : "No matches found"}
        </div>
      )}

      {/* Diff preview */}
      {previewPresetId && previewData && (
        <DiffPreviewPanel
          entries={previewData.entries}
          totalCount={previewData.totalCount}
          onConfirm={confirmApply}
          onCancel={() => setPreviewPresetId(null)}
        />
      )}

      {/* Preset list */}
      <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2">
        {presets.map((preset) =>
          editingId === preset.id ? (
            <PresetEditor
              key={preset.id}
              preset={preset}
              onSave={handleEditSave}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div
              key={preset.id}
              className={`rounded-[4px] border transition-colors ${
                expandedId === preset.id
                  ? "border-border bg-surface-hover/20"
                  : "border-border/50 hover:border-border hover:bg-surface-hover/30"
              }`}
            >
              {/* Compact row */}
              <div
                className="flex items-center gap-2 p-2 cursor-pointer"
                onClick={() => setExpandedId(expandedId === preset.id ? null : preset.id)}
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-text truncate">{preset.name}</div>
                  <div className="text-[9px] text-text-muted">{preset.pairs.length} pairs</div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); handleApply(preset.id); }}
                  className="h-6 px-2 text-[10px] rounded-[3px] bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0"
                >
                  Apply
                </button>
              </div>

              {/* Expanded details */}
              {expandedId === preset.id && (
                <div className="px-2 pb-2 flex flex-col gap-1.5 animate-slide-down">
                  <div className="max-h-24 overflow-y-auto space-y-0.5">
                    {preset.pairs.map((pair, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-[10px]">
                        <span className="text-text-muted truncate">{pair.from}</span>
                        <span className="text-text-muted/50 shrink-0">→</span>
                        <span className="text-text truncate">{pair.to}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 pt-1 border-t border-border/30">
                    <button
                      onClick={() => exportPreset(preset)}
                      className="flex items-center justify-center w-6 h-6 rounded-[3px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                      title="Export"
                    >
                      <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                        <path d="M6 2v6M3.5 5.5L6 8l2.5-2.5M2 10h8" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => { setEditingId(preset.id); setExpandedId(null); }}
                      className="flex items-center justify-center w-6 h-6 rounded-[3px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                      title="Edit"
                    >
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                        <path d="M7.5 1.5l1 1-5.5 5.5H2V7L7.5 1.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                      </svg>
                    </button>
                    <button
                      onClick={() => deletePreset(preset.id)}
                      className="flex items-center justify-center w-6 h-6 rounded-[3px] text-text-muted hover:text-danger hover:bg-danger/10 transition-colors ml-auto"
                      title="Delete"
                    >
                      <svg width="8" height="8" viewBox="0 0 8 8">
                        <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        )}

        {isCreating && (
          <PresetEditor
            onSave={handleCreateSave}
            onCancel={() => setIsCreating(false)}
          />
        )}
      </div>

      {/* Footer */}
      {!isCreating && (
        <div className="p-3 border-t border-border flex flex-col gap-1.5">
          {importError && (
            <div className="px-2.5 py-1.5 bg-danger/10 border border-danger/20 rounded-[4px] text-[10px] text-danger">
              {importError}
            </div>
          )}
          <div className="flex gap-1.5">
            <button
              onClick={() => setIsCreating(true)}
              className="flex-1 h-7 text-[10px] rounded-[4px] border border-dashed border-border text-text-muted hover:text-text hover:border-accent/30 transition-colors"
            >
              + New preset
            </button>
            <button
              onClick={handleImportPreset}
              className="h-7 px-3 text-[10px] rounded-[4px] border border-dashed border-border text-text-muted hover:text-text hover:border-accent/30 transition-colors"
              title="Импорт пресета из .json"
            >
              Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function DiffPreviewPanel({ entries, totalCount, onConfirm, onCancel }: {
  entries: DiffEntry[];
  totalCount: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mx-3 mt-2 border border-accent/20 rounded-[4px] bg-bg/50 animate-slide-down">
      <div className="px-2.5 py-1.5 border-b border-border/50">
        <span className="text-[10px] text-text-muted tracking-wide">
          {totalCount > 0 ? `${totalCount} замен` : "Совпадений нет"}
        </span>
      </div>

      {entries.length > 0 && (
        <div className="max-h-32 overflow-y-auto px-2.5 py-1.5 space-y-1">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-center gap-1.5 text-[10px]">
              <span className="text-danger/80 line-through">{entry.from}</span>
              <span className="text-text-muted">→</span>
              <span className="text-green-400">{entry.to}</span>
              <span className="text-text-muted/50 ml-auto">×{entry.count}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 px-2.5 py-1.5 border-t border-border/50">
        <button
          onClick={onConfirm}
          disabled={totalCount === 0}
          className="flex-1 h-6 text-[10px] rounded-[3px] bg-accent/15 text-accent hover:bg-accent/25 disabled:opacity-30 disabled:pointer-events-none transition-colors"
        >
          Применить
        </button>
        <button
          onClick={onCancel}
          className="flex-1 h-6 text-[10px] rounded-[3px] bg-surface-hover text-text-muted hover:text-text transition-colors"
        >
          Отмена
        </button>
      </div>
    </div>
  );
}
