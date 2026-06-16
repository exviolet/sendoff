import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { TabBar } from "./components/TabBar/TabBar";
import { Editor } from "./components/Editor/Editor";
import { FindReplacePanel } from "./components/FindReplace/FindReplacePanel";
import { PresetsPanel } from "./components/Presets/PresetsPanel";
import { AIPromptPanel } from "./components/AIPrompt/AIPromptPanel";
import { ReferencePanel } from "./components/ReferencePanel/ReferencePanel";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { CommandPalette, type Command } from "./components/CommandPalette/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal/ShortcutsModal";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { TabSwitcher } from "./components/TabSwitcher/TabSwitcher";
import { GlobalSearchPanel } from "./components/GlobalSearch/GlobalSearchPanel";
import { TmuxTargetPicker } from "./components/TmuxPicker/TmuxTargetPicker";
import type { MatchResult } from "./lib/replaceEngine";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useFileIO } from "./hooks/useFileIO";
import { useTmuxActions } from "./hooks/useTmuxActions";
import { useEditorStore } from "./store/editorStore";
import { useThemeStore } from "./store/themeStore";
import { useSettingsStore } from "./store/settingsStore";
import { useReferenceStore } from "./store/referenceStore";
import { ToastContainer } from "./components/Toast/Toast";
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { toast } from "./store/toastStore";

type PanelMode = null | "find" | "findReplace";
type SidePanel = null | "presets" | "ai" | "settings" | "reference";

function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [highlights, setHighlights] = useState<{ index: number; length: number }[]>([]);
  const [activeHighlight, setActiveHighlight] = useState(0);
  const [distractionFree, setDistractionFree] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [markdownPreview, setMarkdownPreview] = useState(false);

  const theme = useThemeStore((s) => s.theme);
  const resolvedTheme = useThemeStore((s) => s.resolvedTheme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const setTheme = useThemeStore((s) => s.setTheme);

  const pendingClose = useEditorStore((s) => s.pendingClose);
  const confirmPendingClose = useEditorStore((s) => s.confirmPendingClose);
  const cancelPendingClose = useEditorStore((s) => s.cancelPendingClose);

  const referenceWidth = useReferenceStore((s) => s.width);

  const fontSize = useSettingsStore((s) => s.fontSize);
  const wordWrap = useSettingsStore((s) => s.wordWrap);

  // Sync data-theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  useSessionPersistence();
  const { saveCurrentTab, downloadCurrentTab, openFile, exportAll, importBackup } = useFileIO();
  const {
    tmuxPicker, setTmuxPicker, handleTmuxSend, handleTmuxPick,
    openBindPicker, bindActiveTab, unbindActiveTab,
  } = useTmuxActions(textareaRef);

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

  const toggleSidePanel = useCallback((panel: SidePanel) => {
    setSidePanel((v) => (v === panel ? null : panel));
  }, []);

  const toggleDistractionFree = useCallback(() => {
    setDistractionFree((v) => !v);
  }, []);

  const focusEditor = useCallback(() => {
    setPanelMode(null);
    setSidePanel(null);
    setCommandPaletteOpen(false);
    setTabSwitcherOpen(false);
    setGlobalSearchOpen(false);
    setShortcutsOpen(false);
    textareaRef.current?.focus();
  }, []);

  const cleanupEmptyTabs = useCallback(() => {
    const n = useEditorStore.getState().cleanupEmptyTabs();
    toast(n === 0 ? "Пустых табов нет" : `Закрыто пустых табов: ${n}`, n === 0 ? "info" : "success");
  }, []);

  const toggleActivePin = useCallback(() => {
    const id = useEditorStore.getState().activeTabId;
    if (id) useEditorStore.getState().togglePin(id);
  }, []);

  const openGlobalMatch = useCallback((tabId: string, match: MatchResult) => {
    useEditorStore.getState().setActiveTab(tabId);
    setPanelMode(null);
    setSidePanel(null);
    setHighlights([{ index: match.index, length: match.length }]);
    setActiveHighlight(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const paletteCommands: Command[] = useMemo(() => [
    { id: "new-tab", label: "Новый таб", shortcut: "Ctrl+N", action: () => useEditorStore.getState().createTab() },
    { id: "close-tab", label: "Закрыть таб", shortcut: "Ctrl+W", action: () => {
      const { activeTabId, closeTab } = useEditorStore.getState();
      if (activeTabId) closeTab(activeTabId);
    }},
    { id: "close-saved-tabs", label: "Закрыть все сохранённые табы", action: () => {
      const n = useEditorStore.getState().closeSavedTabs();
      toast(n === 0 ? "Нечего закрывать" : `Закрыто: ${n}`, n === 0 ? "info" : "success");
    }},
    { id: "close-other-tabs", label: "Закрыть остальные табы", action: () => {
      const { activeTabId, closeOtherTabs } = useEditorStore.getState();
      if (!activeTabId) return;
      const n = closeOtherTabs(activeTabId);
      toast(n === 0 ? "Нечего закрывать" : `Закрыто: ${n}`, n === 0 ? "info" : "success");
    }},
    { id: "close-tabs-to-right", label: "Закрыть табы справа", action: () => {
      const { activeTabId, closeTabsToRight } = useEditorStore.getState();
      if (!activeTabId) return;
      const n = closeTabsToRight(activeTabId);
      toast(n === 0 ? "Нечего закрывать" : `Закрыто: ${n}`, n === 0 ? "info" : "success");
    }},
    { id: "toggle-pin", label: "Закрепить/открепить таб", shortcut: "Ctrl+P", action: toggleActivePin },
    { id: "cleanup-empty-tabs", label: "Очистить пустые табы", action: cleanupEmptyTabs },
    { id: "reopen-tab", label: "Восстановить закрытый таб", shortcut: "Ctrl+Shift+T", action: () => useEditorStore.getState().reopenTab() },
    { id: "tab-switcher", label: "Найти таб", shortcut: "Ctrl+T", action: () => setTabSwitcherOpen(true) },
    { id: "global-search", label: "Глобальный поиск по табам", shortcut: "Ctrl+Shift+D", action: () => setGlobalSearchOpen(true) },
    { id: "find", label: "Найти", shortcut: "Ctrl+F", action: () => setPanelMode("find") },
    { id: "find-replace", label: "Найти и заменить", shortcut: "Ctrl+H", action: () => setPanelMode("findReplace") },
    { id: "presets", label: "Пресеты замены", action: () => setSidePanel("presets") },
    { id: "reference", label: "Reference panel", shortcut: "Ctrl+R", action: () => toggleSidePanel("reference") },
    { id: "ai-prompt", label: "AI Prompt", shortcut: "Ctrl+K", action: () => setSidePanel("ai") },
    { id: "tmux-send", label: "Отправить в tmux", shortcut: "Ctrl+Enter", action: handleTmuxSend },
    { id: "tmux-pick", label: "Отправить в tmux (выбрать окно)", shortcut: "Ctrl+Shift+Enter", action: () => setTmuxPicker({ mode: "send" }) },
    { id: "tmux-bind", label: "Привязать таб к tmux-окну", shortcut: "Ctrl+B", action: bindActiveTab },
    { id: "tmux-unbind", label: "Отвязать таб от tmux", shortcut: "Ctrl+Shift+B", action: unbindActiveTab },
    { id: "save", label: "Сохранить как .txt", shortcut: "Ctrl+S", action: saveCurrentTab },
    { id: "open", label: "Открыть файл", shortcut: "Ctrl+O", action: openFile },
    { id: "download", label: "Скачать таб", action: downloadCurrentTab },
    { id: "export", label: "Экспорт бэкапа", action: exportAll },
    { id: "import", label: "Импорт бэкапа", action: importBackup },
    { id: "distraction-free", label: "Distraction-free режим", shortcut: "Ctrl+Shift+F", action: toggleDistractionFree },
    { id: "shortcuts", label: "Клавиатурные сокращения", shortcut: "Ctrl+/", action: () => setShortcutsOpen(true) },
    { id: "theme-dark", label: "Тема: Тёмная", action: () => setTheme("dark") },
    { id: "theme-light", label: "Тема: Светлая", action: () => setTheme("light") },
    { id: "theme-system", label: "Тема: Системная", action: () => setTheme("system") },
    { id: "toggle-sidebar", label: "Пресеты (sidebar)", shortcut: "Ctrl+.", action: () => toggleSidePanel("presets") },
    { id: "toggle-md-preview", label: markdownPreview ? "Редактор" : "Markdown превью", shortcut: "Ctrl+M", action: () => setMarkdownPreview((v) => !v) },
    { id: "settings", label: "Настройки", shortcut: "Ctrl+,", action: () => toggleSidePanel("settings") },
    { id: "focus-editor", label: "Фокус в редактор", shortcut: "Ctrl+E", action: focusEditor },
  ], [saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup, toggleDistractionFree, toggleSidePanel, setTheme, markdownPreview, focusEditor, handleTmuxSend, cleanupEmptyTabs, bindActiveTab, unbindActiveTab, toggleActivePin, setTmuxPicker]);

  useKeyboardShortcuts({
    onFind: () => setPanelMode("find"),
    onFindReplace: () => setPanelMode("findReplace"),
    onClosePanels: () => {
      if (distractionFree) {
        setDistractionFree(false);
      } else if (commandPaletteOpen || shortcutsOpen || tabSwitcherOpen || globalSearchOpen || tmuxPicker) {
        // handled by their own listeners
      } else if (panelMode || sidePanel) {
        closePanel();
        setSidePanel(null);
      } else if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    },
    onSave: saveCurrentTab,
    onOpen: openFile,
    onAIPrompt: () => toggleSidePanel("ai"),
    onCommandPalette: () => setCommandPaletteOpen((v) => !v),
    onTogglePin: toggleActivePin,
    onDistractionFree: toggleDistractionFree,
    onShortcutsHelp: () => setShortcutsOpen((v) => !v),
    onToggleSidebar: () => toggleSidePanel("presets"),
    onToggleMarkdownPreview: () => setMarkdownPreview((v) => !v),
    onSettings: () => toggleSidePanel("settings"),
    onFocusEditor: focusEditor,
    onTmuxSend: handleTmuxSend,
    onTmuxPicker: () => setTmuxPicker((v) => (v ? null : { mode: "send" })),
    onTmuxBind: bindActiveTab,
    onTmuxUnbind: unbindActiveTab,
    onTabSwitcher: () => setTabSwitcherOpen((v) => !v),
    onReferencePanel: () => toggleSidePanel("reference"),
    onGlobalSearch: () => setGlobalSearchOpen((v) => !v),
  });

  return (
    <div className="flex flex-col h-full">
      {!distractionFree && (
        <TabBar
          sidePanel={sidePanel}
          onSidePanelToggle={toggleSidePanel}
          onDownloadTab={downloadCurrentTab}
          onExportAll={exportAll}
          onImportBackup={importBackup}
          theme={theme}
          onThemeToggle={toggleTheme}
          onCleanupEmptyTabs={cleanupEmptyTabs}
          onBindTmux={openBindPicker}
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
          <div
            className={distractionFree ? "w-full max-w-[780px]" : "w-full h-full"}
            style={
              !distractionFree && sidePanel === "reference"
                ? { paddingRight: `${referenceWidth}px` }
                : undefined
            }
          >
            <Editor highlights={highlights} activeHighlight={activeHighlight} textareaRef={textareaRef} markdownPreview={markdownPreview} fontSize={fontSize} wordWrap={wordWrap} />
          </div>
        </div>
        {!distractionFree && sidePanel === "presets" && <PresetsPanel onClose={() => setSidePanel(null)} />}
        {!distractionFree && sidePanel === "reference" && <ReferencePanel onClose={() => setSidePanel(null)} textareaRef={textareaRef} />}
        {!distractionFree && sidePanel === "ai" && <AIPromptPanel onClose={() => setSidePanel(null)} textareaRef={textareaRef} />}
        {!distractionFree && sidePanel === "settings" && <SettingsPanel onClose={() => setSidePanel(null)} />}
      </div>
      {!distractionFree && <StatusBar onBindTmux={bindActiveTab} />}

      {commandPaletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          onClose={() => setCommandPaletteOpen(false)}
        />
      )}
      {tabSwitcherOpen && (
        <TabSwitcher
          onClose={() => setTabSwitcherOpen(false)}
        />
      )}
      {globalSearchOpen && (
        <GlobalSearchPanel
          onClose={() => setGlobalSearchOpen(false)}
          onOpenMatch={openGlobalMatch}
        />
      )}
      {tmuxPicker && (
        <TmuxTargetPicker
          mode={tmuxPicker.mode}
          onClose={() => setTmuxPicker(null)}
          onPick={handleTmuxPick}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {pendingClose && (
        <ConfirmDialog
          title="Закрыть вкладку без сохранения?"
          message={`Несохранённые изменения в «${pendingClose.title}» будут потеряны.`}
          confirmLabel="Закрыть"
          cancelLabel="Отмена"
          danger
          onConfirm={confirmPendingClose}
          onCancel={cancelPendingClose}
        />
      )}
      <ToastContainer />
    </div>
  );
}

export default App;
