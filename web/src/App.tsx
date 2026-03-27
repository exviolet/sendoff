import { useState, useCallback } from "react";
import { TabBar } from "./components/TabBar/TabBar";
import { Editor } from "./components/Editor/Editor";
import { FindReplacePanel } from "./components/FindReplace/FindReplacePanel";
import { PresetsPanel } from "./components/Presets/PresetsPanel";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";

type PanelMode = null | "find" | "findReplace";

function App() {
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [highlights, setHighlights] = useState<{ index: number; length: number }[]>([]);
  const [activeHighlight, setActiveHighlight] = useState(0);

  const handleMatchesChange = useCallback(
    (matches: { index: number; length: number }[], currentIndex: number) => {
      setHighlights(matches);
      setActiveHighlight(currentIndex);
    },
    []
  );

  function closePanel() {
    setPanelMode(null);
    setHighlights([]);
    setActiveHighlight(0);
  }

  useKeyboardShortcuts({
    onFind: () => setPanelMode("find"),
    onFindReplace: () => setPanelMode("findReplace"),
    onClosePanels: () => {
      closePanel();
      setPresetsOpen(false);
    },
  });

  return (
    <div className="flex flex-col h-full">
      <TabBar
        onPresetsToggle={() => setPresetsOpen((v) => !v)}
        presetsOpen={presetsOpen}
      />
      {panelMode && (
        <FindReplacePanel
          mode={panelMode}
          onClose={closePanel}
          onMatchesChange={handleMatchesChange}
        />
      )}
      <div className="flex-1 min-h-0 relative">
        <Editor highlights={highlights} activeHighlight={activeHighlight} />
        {presetsOpen && <PresetsPanel onClose={() => setPresetsOpen(false)} />}
      </div>
    </div>
  );
}

export default App;
