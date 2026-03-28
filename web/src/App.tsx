import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TabBar } from "./components/TabBar/TabBar";
import { Editor } from "./components/Editor/Editor";
import { FindReplacePanel } from "./components/FindReplace/FindReplacePanel";
import { PresetsPanel } from "./components/Presets/PresetsPanel";
import { AIPromptPanel } from "./components/AIPrompt/AIPromptPanel";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { CommandPalette, type Command } from "./components/CommandPalette/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal/ShortcutsModal";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useFileIO } from "./hooks/useFileIO";
import { useEditorStore } from "./store/editorStore";
import { useThemeStore } from "./store/themeStore";
import { useSettingsStore } from "./store/settingsStore";

type PanelMode = null | "find" | "findReplace";

function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [aiPromptOpen, setAiPromptOpen] = useState(false);
  const [highlights, setHighlights] = useState<{ index: number; length: number }[]>([]);
  const [activeHighlight, setActiveHighlight] = useState(0);
  const [distractionFree, setDistractionFree] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);

  const fontSize = useSettingsStore((s) => s.fontSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);

  // Sync data-theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

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

  const toggleDistractionFree = useCallback(() => {
    setDistractionFree((v) => !v);
  }, []);

  const paletteCommands: Command[] = useMemo(() => [
    { id: "new-tab", label: "Новый таб", shortcut: "Ctrl+N", action: () => useEditorStore.getState().createTab() },
    { id: "close-tab", label: "Закрыть таб", shortcut: "Ctrl+W", action: () => {
      const { activeTabId, closeTab } = useEditorStore.getState();
      if (activeTabId) closeTab(activeTabId);
    }},
    { id: "find", label: "Найти", shortcut: "Ctrl+F", action: () => setPanelMode("find") },
    { id: "find-replace", label: "Найти и заменить", shortcut: "Ctrl+H", action: () => setPanelMode("findReplace") },
    { id: "presets", label: "Пресеты замены", action: () => { setPresetsOpen(true); setAiPromptOpen(false); } },
    { id: "ai-prompt", label: "AI Prompt", shortcut: "Ctrl+K", action: () => { setAiPromptOpen(true); setPresetsOpen(false); } },
    { id: "save", label: "Сохранить как .txt", shortcut: "Ctrl+S", action: saveCurrentTab },
    { id: "open", label: "Открыть файл", shortcut: "Ctrl+O", action: openFile },
    { id: "download", label: "Скачать таб", action: downloadCurrentTab },
    { id: "export", label: "Экспорт бэкапа", action: exportAll },
    { id: "import", label: "Импорт бэкапа", action: importBackup },
    { id: "distraction-free", label: "Distraction-free режим", shortcut: "Ctrl+Shift+F", action: toggleDistractionFree },
    { id: "shortcuts", label: "Клавиатурные сокращения", shortcut: "Ctrl+/", action: () => setShortcutsOpen(true) },
    { id: "toggle-theme", label: theme === "dark" ? "Светлая тема" : "Тёмная тема", action: toggleTheme },
    { id: "toggle-sidebar", label: "Пресеты (sidebar)", shortcut: "Ctrl+.", action: () => { setPresetsOpen((v) => !v); setAiPromptOpen(false); } },
    { id: "toggle-md-preview", label: markdownPreview ? "Редактор" : "Markdown превью", shortcut: "Ctrl+M", action: () => setMarkdownPreview((v) => !v) },
    { id: "settings", label: "Настройки", shortcut: "Ctrl+,", action: () => { setSettingsOpen((v) => !v); setPresetsOpen(false); setAiPromptOpen(false); } },
  ], [saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup, toggleDistractionFree, theme, toggleTheme, markdownPreview]);

  useKeyboardShortcuts({
    onFind: () => setPanelMode("find"),
    onFindReplace: () => setPanelMode("findReplace"),
    onClosePanels: () => {
      if (distractionFree) {
        setDistractionFree(false);
      } else if (commandPaletteOpen || shortcutsOpen) {
        // handled by their own listeners
      } else if (panelMode || presetsOpen || aiPromptOpen || settingsOpen) {
        closePanel();
        setPresetsOpen(false);
        setAiPromptOpen(false);
        setSettingsOpen(false);
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
    onCommandPalette: () => setCommandPaletteOpen((v) => !v),
    onDistractionFree: toggleDistractionFree,
    onShortcutsHelp: () => setShortcutsOpen((v) => !v),
    onToggleSidebar: () => {
      setPresetsOpen((v) => !v);
      setAiPromptOpen(false);
    },
    onToggleMarkdownPreview: () => setMarkdownPreview((v) => !v),
    onSettings: () => {
      setSettingsOpen((v) => !v);
      setPresetsOpen(false);
      setAiPromptOpen(false);
    },
  });

  return (
    <div className="flex flex-col h-full">
      {!distractionFree && (
        <TabBar
          onPresetsToggle={() => {
            setPresetsOpen((v) => !v);
            setAiPromptOpen(false);
            setSettingsOpen(false);
          }}
          presetsOpen={presetsOpen}
          onAIPromptToggle={() => {
            setAiPromptOpen((v) => !v);
            setPresetsOpen(false);
            setSettingsOpen(false);
          }}
          aiPromptOpen={aiPromptOpen}
          onSettingsToggle={() => {
            setSettingsOpen((v) => !v);
            setPresetsOpen(false);
            setAiPromptOpen(false);
          }}
          settingsOpen={settingsOpen}
          onDownloadTab={downloadCurrentTab}
          onExportAll={exportAll}
          onImportBackup={importBackup}
          theme={theme}
          onThemeToggle={toggleTheme}
        />
      )}
      {!distractionFree && panelMode && (
        <FindReplacePanel
          mode={panelMode}
          onClose={closePanel}
          onMatchesChange={handleMatchesChange}
        />
      )}
      <div className="flex-1 min-h-0 relative">
        <div className={distractionFree ? "h-full flex justify-center" : "h-full"}>
          <div className={distractionFree ? "w-full max-w-[780px]" : "w-full h-full"}>
            <Editor highlights={highlights} activeHighlight={activeHighlight} textareaRef={textareaRef} markdownPreview={markdownPreview} fontSize={fontSize} wordWrap={wordWrap} />
          </div>
        </div>
        {!distractionFree && presetsOpen && <PresetsPanel onClose={() => setPresetsOpen(false)} />}
        {!distractionFree && aiPromptOpen && <AIPromptPanel onClose={() => setAiPromptOpen(false)} textareaRef={textareaRef} />}
        {!distractionFree && settingsOpen && <SettingsPanel onClose={() => setSettingsOpen(false)} />}
      </div>
      {!distractionFree && <StatusBar />}

      {commandPaletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          onClose={() => setCommandPaletteOpen(false)}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
    </div>
  );
}

export default App;
