import { useState, useEffect, useCallback, useRef } from "react";
import { TabBar } from "./components/TabBar/TabBar";
import { AppToolbar } from "./components/TabBar/AppToolbar";
import { Editor } from "./components/Editor/Editor";
import { FindReplacePanel } from "./components/FindReplace/FindReplacePanel";
import { PresetsPanel } from "./components/Presets/PresetsPanel";
import { TriggerPhrasePicker } from "./components/TriggerPhrase/TriggerPhrasePicker";
import { ReferencePanel } from "./components/ReferencePanel/ReferencePanel";
import { StatusBar } from "./components/StatusBar/StatusBar";
import { StorageErrorBanner } from "./components/StorageError/StorageErrorBanner";
import { CommandPalette } from "./components/CommandPalette/CommandPalette";
import { ShortcutsModal } from "./components/ShortcutsModal/ShortcutsModal";
import { DoctorModal } from "./components/Doctor/DoctorModal";
import { OnboardingOverlay } from "./components/Onboarding/OnboardingOverlay";
import { useOnboardingStore } from "./store/onboardingStore";
import { SettingsPanel } from "./components/Settings/SettingsPanel";
import { TabSwitcher } from "./components/TabSwitcher/TabSwitcher";
import { GlobalSearchPanel } from "./components/GlobalSearch/GlobalSearchPanel";
import { TargetPicker } from "./components/TargetPicker/TargetPicker";
import { WorkspaceSwitcher } from "./components/WorkspaceSwitcher/WorkspaceSwitcher";
import { TabGroupPicker } from "./components/TabGroupPicker/TabGroupPicker";
import type { MatchResult } from "./lib/replaceEngine";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useSessionPersistence, flushSession } from "./hooks/useSessionPersistence";
import { useFileIO } from "./hooks/useFileIO";
import { useTerminalActions } from "./hooks/useTerminalActions";
import { useCommands, type PanelMode, type SidePanel } from "./hooks/useCommands";
import { useImageAttachment } from "./hooks/useImageAttachment";
import { useEditorStore } from "./store/editorStore";
import { useThemeStore } from "./store/themeStore";
import { useSettingsStore } from "./store/settingsStore";
import { useReferenceStore } from "./store/referenceStore";
import { ToastContainer } from "./components/Toast/Toast";
import { ConfirmDialog } from "./components/ConfirmDialog/ConfirmDialog";
import { toast } from "./store/toastStore";

function App() {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);
  const [panelMode, setPanelMode] = useState<PanelMode>(null);
  const [sidePanel, setSidePanel] = useState<SidePanel>(null);
  const [highlights, setHighlights] = useState<{ index: number; length: number }[]>([]);
  const [activeHighlight, setActiveHighlight] = useState(0);
  const [distractionFree, setDistractionFree] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [doctorOpen, setDoctorOpen] = useState(false);
  const onboardingActive = useOnboardingStore((s) => s.active);
  const [tabSwitcherOpen, setTabSwitcherOpen] = useState(false);
  // null = закрыт; move хранит id таба, который переносим; editId открывает пикер
  // сразу на правке (палитра — над активным workspace).
  const [workspacePicker, setWorkspacePicker] = useState<
    null | { mode: "switch"; editId?: string } | { mode: "move"; tabId: string }
  >(null);
  // null = закрыт; иначе id таба, который кладём в группу.
  const [groupPickerTabId, setGroupPickerTabId] = useState<string | null>(null);
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
  // Один хук на все терминальные таргеты: диспетчер по tab.binding живёт внутри,
  // отдельной развилки в App больше нет.
  const {
    targetPicker, setTargetPicker, handleSend, handlePick,
    openBindPicker, bindActiveTab, unbindActiveTab,
  } = useTerminalActions(textareaRef);

  // Раньше здесь было предупреждение «есть несохранённые изменения». Оно потеряло
  // смысл вместе с ручным сохранением — и защищало-то максимум 500 мс набора.
  // Полезнее не спрашивать, а дожать отложенную запись: ждать её нельзя (beforeunload
  // синхронный), но начатая транзакция IndexedDB успевает завершиться.
  useEffect(() => {
    function handleBeforeUnload() {
      void flushSession();
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
    toast(n === 0 ? "No empty tabs" : `Empty tabs closed: ${n}`, n === 0 ? "info" : "success");
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

  // Тот же хук зовёт и Editor — колбэки без состояния, второй вызов ничего не дублирует.
  // Так же устроены ReferencePanel и TriggerPhrasePicker: каждый потребитель textareaRef
  // делает вставку сам, а не тянет её пропом сверху.
  const { pickImage } = useImageAttachment(textareaRef);

  const paletteCommands = useCommands({
    saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup,
    toggleDistractionFree, toggleSidePanel, setSidePanel, setPanelMode, setTheme,
    setTabSwitcherOpen, setGlobalSearchOpen, setTriggerPhrasesOpen, setShortcutsOpen, setMarkdownPreview,
    markdownPreview, focusEditor, cleanupEmptyTabs, toggleActivePin,
    handleSend, setTargetPicker, bindActiveTab, unbindActiveTab,
    insertImagePath: pickImage,
    openWorkspaceSwitcher: openWorkspaceSwitcher,
    moveActiveTabToWorkspace: moveActiveTabToWorkspace,
    // Обе команды ведут в одну панель правки — переименование и удаление живут там
    // вместе. Две записи в палитре сохранены ради поиска по слову «delete».
    renameActiveWorkspace: () =>
      setWorkspacePicker({ mode: "switch", editId: useEditorStore.getState().activeWorkspaceId }),
    deleteActiveWorkspace: () =>
      setWorkspacePicker({ mode: "switch", editId: useEditorStore.getState().activeWorkspaceId }),
    openDoctor: () => setDoctorOpen(true),
  });

  // Фокус-перехватывающие оверлеи: пока любой открыт, глобальные хоткеи гасятся
  // (см. isModalOpen в useKeyboardShortcuts). Доки-панели (panelMode/sidePanel) сюда НЕ
  // входят — редактор при них остаётся основным, Ctrl+W и прочее должны работать.
  const overlayOpen =
    commandPaletteOpen || doctorOpen || onboardingActive || tabSwitcherOpen ||
    globalSearchOpen || triggerPhrasesOpen || shortcutsOpen ||
    Boolean(targetPicker) || Boolean(workspacePicker) || Boolean(groupPickerTabId) ||
    Boolean(pendingClose);

  useKeyboardShortcuts({
    isModalOpen: () => overlayOpen,
    onFind: () => setPanelMode("find"),
    onFindReplace: () => setPanelMode("findReplace"),
    onClosePanels: () => {
      if (distractionFree) {
        setDistractionFree(false);
      } else if (commandPaletteOpen || shortcutsOpen || tabSwitcherOpen || globalSearchOpen || triggerPhrasesOpen || targetPicker || workspacePicker || groupPickerTabId) {
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
    onSendPrompt: handleSend,
    onTargetPicker: () => setTargetPicker((v) => (v ? null : { mode: "send" })),
    onBindTarget: bindActiveTab,
    onUnbindTarget: unbindActiveTab,
    onTabSwitcher: () => setTabSwitcherOpen((v) => !v),
    onReferencePanel: () => toggleSidePanel("reference"),
    onGlobalSearch: () => setGlobalSearchOpen((v) => !v),
    onWorkspaceSwitcher: () => setWorkspacePicker((v) => (v ? null : { mode: "switch" })),
    onTabGroupPicker: () => {
      const id = useEditorStore.getState().activeTabId;
      setGroupPickerTabId((v) => (v ? null : id));
    },
    onScrollActiveTab: () => {
      const activeTab = activeTabRef.current;
      if (!activeTab) return false;
      activeTab.scrollIntoView({ inline: "nearest", block: "nearest" });
      return true;
    },
  });

  return (
    <div className="flex flex-col h-full">
      {/* Вне !distractionFree намеренно: в distraction-free полоса табов скрыта, но
          сообщение «ничего не сохраняется» скрывать вместе с ней нельзя. */}
      <StorageErrorBanner />
      {!distractionFree && (
        <TabBar
          onCleanupEmptyTabs={cleanupEmptyTabs}
          onBindTarget={openBindPicker}
          onMoveTabToWorkspace={(tabId) => setWorkspacePicker({ mode: "move", tabId })}
          onGroupTab={(tabId) => setGroupPickerTabId(tabId)}
          activeTabRef={activeTabRef}
          toolbar={
            <AppToolbar
              sidePanel={sidePanel}
              onSidePanelToggle={toggleSidePanel}
              onDownloadTab={downloadCurrentTab}
              onExportAll={exportAll}
              onImportBackup={importBackup}
              theme={theme}
              onThemeToggle={toggleTheme}
              onTriggerPhrases={() => setTriggerPhrasesOpen(true)}
            />
          }
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
        {!distractionFree && sidePanel === "settings" && <SettingsPanel onOpenDoctor={() => setDoctorOpen(true)} onClose={() => setSidePanel(null)} />}
      </div>
      {!distractionFree && (
        <StatusBar
          onBindTarget={bindActiveTab}
          onWorkspaceSwitch={() => setWorkspacePicker({ mode: "switch" })}
        />
      )}

      {commandPaletteOpen && (
        <CommandPalette
          commands={paletteCommands}
          onClose={() => setCommandPaletteOpen(false)}
        />
      )}
      {doctorOpen && <DoctorModal onClose={() => setDoctorOpen(false)} />}
      {onboardingActive && <OnboardingOverlay onOpenDoctor={() => setDoctorOpen(true)} />}
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
      {targetPicker && (
        <TargetPicker
          mode={targetPicker.mode}
          onClose={() => setTargetPicker(null)}
          onPick={handlePick}
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
              // Пачка — только если перенос затеян с выделенного таба; иначе двигаем
              // ровно тот, по которому кликнули.
              const selected = store.selectedTabIds;
              const batch = selected.includes(picker.tabId) ? selected : [picker.tabId];
              store.moveTabsToWorkspace(batch, workspaceId);
              toast(
                batch.length > 1
                  ? `Tabs moved: ${batch.length}`
                  : "Tab moved to another workspace",
                "success",
              );
            } else {
              store.setActiveWorkspace(workspaceId);
            }
          }}
          initialEdit={workspacePicker.mode === "switch" ? workspacePicker.editId : undefined}
        />
      )}
      {groupPickerTabId && (
        <TabGroupPicker
          tabId={groupPickerTabId}
          onClose={() => setGroupPickerTabId(null)}
        />
      )}
      {shortcutsOpen && <ShortcutsModal onClose={() => setShortcutsOpen(false)} />}
      {pendingClose && (
        <ConfirmDialog
          title={`Close ${pendingClose.ids.length} tabs?`}
          // Спрашиваем не про потерю данных — архив закрытых переживает перезапуск.
          // Спрашиваем про масштаб: доставать десятки табов обратно по одному больно.
          message="Each one can be reopened with Ctrl+Shift+T — one at a time."
          confirmLabel="Close"
          cancelLabel="Cancel"
          danger
          onConfirm={() => {
            const n = confirmPendingClose();
            if (n > 0) toast(`Closed: ${n}`, "success");
          }}
          onCancel={cancelPendingClose}
        />
      )}
      <ToastContainer />
    </div>
  );
}

export default App;
