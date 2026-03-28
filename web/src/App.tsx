import { useState, useEffect, useCallback, useRef } from "react";
import { TabBar } from "./components/TabBar/TabBar";
import { Editor } from "./components/Editor/Editor";
import { FindReplacePanel } from "./components/FindReplace/FindReplacePanel";
import { PresetsPanel } from "./components/Presets/PresetsPanel";
import { AIPromptPanel } from "./components/AIPrompt/AIPromptPanel";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useFileIO } from "./hooks/useFileIO";
import { useEditorStore } from "./store/editorStore";

type PanelMode = null | "find" | "findReplace";

function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [highlights, setHighlights] = useState<{ index: number; length: number }[]>([]);
  const [activeHighlight, setActiveHighlight] = useState(0);

  useSessionPersistence();
  const { saveCurrentTab, downloadCurrentTab, openFile, exportAll, importBackup } = useFileIO();

  // Warn on browser close if dirty tabs exist
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      const hasDirty = useEditorStore.getState().tabs.some((t) => t.isDirty);
      if (hasDirty) {
        e.preventDefault();
      }
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

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
      if (panelMode || presetsOpen || aiPromptOpen) {
        closePanel();
        setPresetsOpen(false);
        setAiPromptOpen(false);
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    onSave: saveCurrentTab,
    onOpen: openFile,
    onAIPrompt: () => {
      setAiPromptOpen((v) => !v);
      setPresetsOpen(false);
    },
  });

  return (
    <div className="flex flex-col h-full">
      <TabBar
        onPresetsToggle={() => {
          setPresetsOpen((v) => !v);
          setAiPromptOpen(false);
        }}
        presetsOpen={presetsOpen}
        onAIPromptToggle={() => {
          setAiPromptOpen((v) => !v);
          setPresetsOpen(false);
        }}
        aiPromptOpen={aiPromptOpen}
        onDownloadTab={downloadCurrentTab}
        onExportAll={exportAll}
        onImportBackup={importBackup}
      />
      {panelMode && (
        <FindReplacePanel
          mode={panelMode}
          onClose={closePanel}
          onMatchesChange={handleMatchesChange}
        />
      )}
      <div className="flex-1 min-h-0 relative">
        <Editor highlights={highlights} activeHighlight={activeHighlight} textareaRef={textareaRef} />
        {presetsOpen && <PresetsPanel onClose={() => setPresetsOpen(false)} />}
        {aiPromptOpen && <AIPromptPanel onClose={() => setAiPromptOpen(false)} textareaRef={textareaRef} />}
      </div>
      <StatusBar />
    </div>
  );
}

export default App;
