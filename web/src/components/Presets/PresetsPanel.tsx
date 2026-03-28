import { useState, useEffect, useMemo } from "react";
import { usePresetsStore } from "../../store/presetsStore";
import type { ReplacePreset } from "../../store/presetsStore";
import type { ReplacePair } from "../../lib/replaceEngine";
import { previewReplacePairs, type DiffEntry } from "../../lib/replaceEngine";
import { useEditorStore } from "../../store/editorStore";
import { PresetEditor } from "./PresetEditor";

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
  const tab = useEditorStore((s) => s.tabs.find((t) => t.id === s.activeTabId));

  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [previewPresetId, setPreviewPresetId] = useState<string | null>(null);

  const previewData = useMemo(() => {
    if (!previewPresetId || !tab) return null;
    const preset = presets.find((p) => p.id === previewPresetId);
    if (!preset) return null;
    return previewReplacePairs(tab.content, preset.pairs);
  }, [previewPresetId, tab, presets]);

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
              className="group flex items-center gap-2 p-2 rounded-[4px] border border-border/50 hover:border-border hover:bg-surface-hover/30 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="text-[11px] text-text truncate">{preset.name}</div>
                <div className="text-[9px] text-text-muted">{preset.pairs.length} pairs</div>
              </div>

              <button
                onClick={() => handleApply(preset.id)}
                className="h-6 px-2 text-[10px] rounded-[3px] bg-accent/15 text-accent hover:bg-accent/25 transition-colors shrink-0"
              >
                Apply
              </button>

              <button
                onClick={() => setEditingId(preset.id)}
                className="flex items-center justify-center w-6 h-6 rounded-[3px] text-text-muted opacity-0 group-hover:opacity-100 hover:text-text hover:bg-surface-hover transition-all"
                title="Edit"
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path d="M7.5 1.5l1 1-5.5 5.5H2V7L7.5 1.5z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" />
                </svg>
              </button>

              <button
                onClick={() => deletePreset(preset.id)}
                className="flex items-center justify-center w-6 h-6 rounded-[3px] text-text-muted opacity-0 group-hover:opacity-100 hover:text-danger hover:bg-danger/10 transition-all"
                title="Delete"
              >
                <svg width="8" height="8" viewBox="0 0 8 8">
                  <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
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
        <div className="p-3 border-t border-border">
          <button
            onClick={() => setIsCreating(true)}
            className="w-full h-7 text-[10px] rounded-[4px] border border-dashed border-border text-text-muted hover:text-text hover:border-accent/30 transition-colors"
          >
            + New preset
          </button>
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
