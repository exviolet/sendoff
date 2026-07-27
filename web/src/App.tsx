import { useState, useEffect, useCallback, useRef } from "react";
import { TabBar } from "./components/TabBar/TabBar";
import { Editor } from "./components/Editor/Editor";
import { FindReplacePanel } from "./components/FindReplace/FindReplacePanel";
import { PresetsPanel } from "./components/Presets/PresetsPanel";
import { TriggerPhrasePicker } from "./components/TriggerPhrase/TriggerPhrasePicker";
import { ReferencePanel } from "./components/ReferencePanel/ReferencePanel";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal/ShortcutsModal";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { TabSwitcher } from "./components/TabSwitcher/TabSwitcher";
import { GlobalSearchPanel } from "./components/GlobalSearch/GlobalSearchPanel";
import { TmuxTargetPicker } from "./components/TmuxPicker/TmuxTargetPicker";
import { OrcaTargetPicker } from "./components/OrcaPicker/OrcaTargetPicker";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher/WorkspaceSwitcher";
import type { MatchResult } from "./lib/replaceEngine";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSessionPersistence } from "./hooks/useSessionPersistence";
import { useFileIO } from "./hooks/useFileIO";
import { useTmuxActions } from "./hooks/useTmuxActions";
import { useOrcaActions } from "./hooks/useOrcaActions";
import { useCommands, type PanelMode, type SidePanel } from "./hooks/useCommands";
import { useEditorStore } from "./store/editorStore";
import { useThemeStore } from "./store/themeStore";
import { useSettingsStore } from "./store/settingsStore";
import { useReferenceStore } from "./store/referenceStore";
import { ToastContainer } from "./components/Toast/Toast";
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { toast } from "./store/toastStore";

function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [highlights, setHighlights] = useState<{ index: number; length: number }[]>([]);
  const [activeHighlight, setActiveHighlight] = useState(0);
  const [distractionFree, setDistractionFree] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  // null = закрыт; move хранит id таба, который переносим.
  const [workspacePicker, setWorkspacePicker] = useState<
    null | { mode: "switch" } | { mode: "move"; tabId: string }
  >(null);
  const [workspaceDialog, setWorkspaceDialog] = useState<null | "rename" | "delete">(null);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [triggerPhrasesOpen, setTriggerPhrasesOpen] = useState(false);
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
  const fontFamily = useSettingsStore((s) => s.fontFamily);

  // Sync data-theme attribute on <html>
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
  }, [resolvedTheme]);

  // Override --font-mono с выбранным шрифтом (пусто = дефолтный стек из index.css).
  // Санитизация: имя семейства не должно ломать CSS-значение (кавычки/точка с запятой/скобки).
  useEffect(() => {
    const el = document.documentElement;
    const name = fontFamily.replace(/["'\\;{}]/g, "").trim();
    if (name) {
      el.style.setProperty("--font-mono", `"${name}", "JetBrains Mono", ui-monospace, monospace`);
    } else {
      el.style.removeProperty("--font-mono");
    }
  }, [fontFamily]);

  // Размер шрифта — как CSS-переменная, чтобы за настройкой следовали ВСЕ поверхности с
  // текстом документа, а не только редактор: markdown-превью (CSS-класс) и reference-панель.
  // Раньше они были прибиты к 13px/12px и при fontSize=18 выглядели чужеродно.
  useEffect(() => {
    document.documentElement.style.setProperty("--editor-font-size", `${fontSize}px`);
  }, [fontSize]);

  useSessionPersistence();
  const { saveCurrentTab, downloadCurrentTab, openFile, exportAll, importBackup } = useFileIO();
  const {
    tmuxPicker, setTmuxPicker, handleTmuxSend, handleTmuxPick,
    openBindPicker, bindActiveTab, unbindActiveTab,
  } = useTmuxActions(textareaRef);
  const {
    orcaPicker, setOrcaPicker, handleOrcaSend, handleOrcaPick,
    bindActiveTabOrca, openBindPickerOrca, unbindActiveTabOrca,
  } = useOrcaActions(textareaRef);

  // Ctrl+Enter диспетчер: таб с orca-привязкой → Orca, иначе существующий tmux-flow.
  const handleSend = useCallback(() => {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (tab?.orcaBinding) void handleOrcaSend();
    else void handleTmuxSend();
  }, [handleOrcaSend, handleTmuxSend]);

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
    setTriggerPhrasesOpen(false);
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

  const openWorkspaceSwitcher = useCallback(() => setWorkspacePicker({ mode: "switch" }), []);

  const moveActiveTabToWorkspace = useCallback(() => {
    const id = useEditorStore.getState().activeTabId;
    if (id) setWorkspacePicker({ mode: "move", tabId: id });
  }, []);

  const openGlobalMatch = useCallback((tabId: string, match: MatchResult) => {
    useEditorStore.getState().setActiveTab(tabId);
    setPanelMode(null);
    setSidePanel(null);
    setHighlights([{ index: match.index, length: match.length }]);
    setActiveHighlight(0);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, []);

  const paletteCommands = useCommands({
    saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup,
    toggleDistractionFree, toggleSidePanel, setSidePanel, setPanelMode, setTheme,
    setTabSwitcherOpen, setGlobalSearchOpen, setTriggerPhrasesOpen, setShortcutsOpen, setMarkdownPreview,
    markdownPreview, focusEditor, cleanupEmptyTabs, toggleActivePin,
    handleTmuxSend: handleSend, setTmuxPicker, bindActiveTab, unbindActiveTab,
    setOrcaPicker, bindActiveTabOrca, unbindActiveTabOrca,
    openWorkspaceSwitcher: openWorkspaceSwitcher,
    moveActiveTabToWorkspace: moveActiveTabToWorkspace,
    renameActiveWorkspace: () => setWorkspaceDialog("rename"),
    deleteActiveWorkspace: () => setWorkspaceDialog("delete"),
  });

  useKeyboardShortcuts({
    onFind: () => setPanelMode("find"),
    onFindReplace: () => setPanelMode("findReplace"),
    onClosePanels: () => {
      if (distractionFree) {
        setDistractionFree(false);
      } else if (commandPaletteOpen || shortcutsOpen || tabSwitcherOpen || globalSearchOpen || triggerPhrasesOpen || tmuxPicker || orcaPicker || workspacePicker) {
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
    onTriggerPhrases: () => setTriggerPhrasesOpen((v) => !v),
    onCommandPalette: () => setCommandPaletteOpen((v) => !v),
    onTogglePin: toggleActivePin,
    onDistractionFree: toggleDistractionFree,
    onShortcutsHelp: () => setShortcutsOpen((v) => !v),
    onToggleSidebar: () => toggleSidePanel("presets"),
    onToggleMarkdownPreview: () => setMarkdownPreview((v) => !v),
    onSettings: () => toggleSidePanel("settings"),
    onFocusEditor: focusEditor,
    onTmuxSend: handleSend,
    onTmuxPicker: () => setTmuxPicker((v) => (v ? null : { mode: "send" })),
    onTmuxBind: bindActiveTab,
    onTmuxUnbind: unbindActiveTab,
    onTabSwitcher: () => setTabSwitcherOpen((v) => !v),
    onReferencePanel: () => toggleSidePanel("reference"),
    onGlobalSearch: () => setGlobalSearchOpen((v) => !v),
    onWorkspaceSwitcher: () => setWorkspacePicker((v) => (v ? null : { mode: "switch" })),
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
          onBindOrca={openBindPickerOrca}
          onMoveTabToWorkspace={(tabId) => setWorkspacePicker({ mode: "move", tabId })}
          onTriggerPhrases={() => setTriggerPhrasesOpen(true)}
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
        {!distractionFree && sidePanel === "settings" && <SettingsPanel onClose={() => setSidePanel(null)} />}
      </div>
      {!distractionFree && (
        <StatusBar
          onBindTmux={bindActiveTab}
          onBindOrca={bindActiveTabOrca}
          onWorkspaceSwitch={() => setWorkspacePicker({ mode: "switch" })}
        />
      )}

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
      {triggerPhrasesOpen && (
        <TriggerPhrasePicker
          onClose={() => setTriggerPhrasesOpen(false)}
          textareaRef={textareaRef}
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
      {orcaPicker && (
        <OrcaTargetPicker
          mode={orcaPicker.mode}
          onClose={() => setOrcaPicker(null)}
          onPick={handleOrcaPick}
        />
      )}
      {workspacePicker && (
        <WorkspaceSwitcher
          mode={workspacePicker.mode}
          onClose={() => setWorkspacePicker(null)}
          onPick={(workspaceId) => {
            const picker = workspacePicker;
            setWorkspacePicker(null);
            const store = useEditorStore.getState();
            if (picker.mode === "move") {
              store.moveTabToWorkspace(picker.tabId, workspaceId);
              toast("Таб перемещён в другой workspace", "success");
            } else {
              store.setActiveWorkspace(workspaceId);
            }
          }}
        />
      )}
      {workspaceDialog === "rename" && (() => {
        const s = useEditorStore.getState();
        const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
        return (
          <ConfirmDialog
            title="Переименовать workspace"
            message="Новое имя активного workspace."
            confirmLabel="Переименовать"
            inputDefault={ws?.name ?? ""}
            inputPlaceholder="Имя workspace"
            onConfirm={(value) => {
              if (ws) useEditorStore.getState().renameWorkspace(ws.id, value);
              setWorkspaceDialog(null);
            }}
            onCancel={() => setWorkspaceDialog(null)}
          />
        );
      })()}
      {workspaceDialog === "delete" && (() => {
        const s = useEditorStore.getState();
        const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId);
        const target = s.workspaces.find((w) => w.id !== s.activeWorkspaceId);
        const count = s.tabs.filter((t) => t.workspaceId === s.activeWorkspaceId).length;
        return (
          <ConfirmDialog
            title={`Удалить workspace «${ws?.name ?? ""}»?`}
            message={
              target
                ? `${count} таб(ов) переедут в «${target.name}» — ничего не будет удалено.`
                : "Нельзя удалить единственный workspace."
            }
            confirmLabel="Удалить"
            danger
            onConfirm={() => {
              if (ws && target) useEditorStore.getState().deleteWorkspace(ws.id);
              setWorkspaceDialog(null);
            }}
            onCancel={() => setWorkspaceDialog(null)}
          />
        );
      })()}
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
