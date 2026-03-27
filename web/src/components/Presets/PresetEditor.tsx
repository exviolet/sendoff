import { useState } from "react";
import type { ReplacePair } from "../../lib/replaceEngine";
import type { ReplacePreset } from "../../store/presetsStore";

interface PresetEditorProps {
  preset?: ReplacePreset;
  onSave: (name: string, pairs: ReplacePair[]) => void;
  onCancel: () => void;
}

function emptyPair(): ReplacePair {
  return { from: "", to: "", caseSensitive: true, wholeWord: false };
}

export function PresetEditor({ preset, onSave, onCancel }: PresetEditorProps) {
  const [name, setName] = useState(preset?.name ?? "");
  const [pairs, setPairs] = useState<ReplacePair[]>(
    preset?.pairs.length ? preset.pairs : [emptyPair()]
  );

  function updatePair(index: number, field: keyof ReplacePair, value: string | boolean) {
    setPairs((p) => p.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair)));
  }

  function removePair(index: number) {
    setPairs((p) => p.filter((_, i) => i !== index));
  }

  function handleSave() {
    const validPairs = pairs.filter((p) => p.from.trim());
    if (!name.trim() || validPairs.length === 0) return;
    onSave(name.trim(), validPairs);
  }

  return (
    <div className="flex flex-col gap-2.5 p-3 bg-surface rounded-[4px] border border-border animate-slide-down">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Preset name..."
        className="h-7 px-2 bg-bg border border-border rounded-[4px] text-[11px] text-text placeholder:text-text-muted/40 outline-none focus:border-accent/50 transition-colors"
      />

      <div className="flex flex-col gap-1">
        {pairs.map((pair, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              value={pair.from}
              onChange={(e) => updatePair(i, "from", e.target.value)}
              placeholder="From"
              className="flex-1 h-6 px-2 bg-bg border border-border rounded-[3px] text-[10px] text-text placeholder:text-text-muted/40 outline-none focus:border-accent/50"
            />
            <span className="text-text-muted text-[10px]">{"\u2192"}</span>
            <input
              value={pair.to}
              onChange={(e) => updatePair(i, "to", e.target.value)}
              placeholder="To"
              className="flex-1 h-6 px-2 bg-bg border border-border rounded-[3px] text-[10px] text-text placeholder:text-text-muted/40 outline-none focus:border-accent/50"
            />
            <button
              onClick={() => updatePair(i, "caseSensitive", !pair.caseSensitive)}
              title="Case sensitive"
              className={`h-6 px-1.5 rounded-[3px] text-[9px] font-medium transition-colors ${
                pair.caseSensitive
                  ? "bg-accent/20 text-accent"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              Aa
            </button>
            <button
              onClick={() => updatePair(i, "wholeWord", !pair.wholeWord)}
              title="Whole word"
              className={`h-6 px-1.5 rounded-[3px] text-[9px] font-medium transition-colors ${
                pair.wholeWord
                  ? "bg-accent/20 text-accent"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              W
            </button>
            {pairs.length > 1 && (
              <button
                onClick={() => removePair(i)}
                className="flex items-center justify-center w-5 h-5 rounded-[3px] text-text-muted hover:text-danger hover:bg-danger/10 transition-colors"
              >
                <svg width="8" height="8" viewBox="0 0 8 8">
                  <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={() => setPairs((p) => [...p, emptyPair()])}
        className="h-6 text-[10px] text-text-muted hover:text-text hover:bg-surface-hover rounded-[3px] transition-colors"
      >
        + Add pair
      </button>

      <div className="flex gap-1.5 justify-end">
        <button
          onClick={onCancel}
          className="h-7 px-3 text-[10px] rounded-[4px] text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="h-7 px-3 text-[10px] rounded-[4px] bg-accent/15 text-accent hover:bg-accent/25 transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  );
}
