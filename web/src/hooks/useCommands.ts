import { useMemo, type Dispatch, type SetStateAction } from "react";
import { type Command } from "../components/CommandPalette/CommandPalette";
import { useEditorStore } from "../store/editorStore";
import { toast } from "../store/toastStore";
import { type TargetPickerState } from "./useTerminalActions";

export type PanelMode = null | "find" | "findReplace";
export type SidePanel = null | "presets" | "settings" | "reference";

// All the app-level handlers the command catalog wires together. The catalog is
// the single hub that maps every action to a palette entry, so this surface is
// inherently wide — it mirrors App's action set rather than adding coupling.
export interface CommandDeps {
  saveCurrentTab: () => void;
  openFile: () => void;
  downloadCurrentTab: () => void;
  exportAll: () => void;
  importBackup: () => void;
  toggleDistractionFree: () => void;
  toggleSidePanel: (panel: SidePanel) => void;
  setSidePanel: Dispatch<SetStateAction<SidePanel>>;
  setPanelMode: Dispatch<SetStateAction<PanelMode>>;
  setTheme: (theme: "dark" | "light" | "system") => void;
  setTabSwitcherOpen: Dispatch<SetStateAction<boolean>>;
  setGlobalSearchOpen: Dispatch<SetStateAction<boolean>>;
  setTriggerPhrasesOpen: Dispatch<SetStateAction<boolean>>;
  setShortcutsOpen: Dispatch<SetStateAction<boolean>>;
  setMarkdownPreview: Dispatch<SetStateAction<boolean>>;
  markdownPreview: boolean;
  focusEditor: () => void;
  cleanupEmptyTabs: () => void;
  toggleActivePin: () => void;
  handleSend: () => void;
  setTargetPicker: Dispatch<SetStateAction<TargetPickerState>>;
  bindActiveTab: () => void;
  unbindActiveTab: () => void;
  openWorkspaceSwitcher: () => void;
  moveActiveTabToWorkspace: () => void;
  renameActiveWorkspace: () => void;
  deleteActiveWorkspace: () => void;
}

export function useCommands(deps: CommandDeps): Command[] {
  const {
    saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup,
    toggleDistractionFree, toggleSidePanel, setSidePanel, setPanelMode, setTheme,
    setTabSwitcherOpen, setGlobalSearchOpen, setTriggerPhrasesOpen, setShortcutsOpen, setMarkdownPreview,
    markdownPreview, focusEditor, cleanupEmptyTabs, toggleActivePin,
    handleSend, setTargetPicker, bindActiveTab, unbindActiveTab,
    openWorkspaceSwitcher, moveActiveTabToWorkspace, renameActiveWorkspace, deleteActiveWorkspace,
  } = deps;

  return useMemo(() => [
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
    { id: "workspace-switch", label: "Workspace: переключить / создать…", shortcut: "Ctrl+Shift+W", action: openWorkspaceSwitcher },
    { id: "workspace-move-tab", label: "Workspace: переместить таб…", action: moveActiveTabToWorkspace },
    { id: "workspace-rename", label: "Workspace: переименовать…", action: renameActiveWorkspace },
    { id: "workspace-delete", label: "Workspace: удалить…", action: deleteActiveWorkspace },
    { id: "toggle-pin", label: "Закрепить/открепить таб", shortcut: "Ctrl+P", action: toggleActivePin },
    { id: "cleanup-empty-tabs", label: "Очистить пустые табы", action: cleanupEmptyTabs },
    { id: "reopen-tab", label: "Восстановить закрытый таб", shortcut: "Ctrl+Shift+T", action: () => useEditorStore.getState().reopenTab() },
    { id: "tab-switcher", label: "Найти таб", shortcut: "Ctrl+T", action: () => setTabSwitcherOpen(true) },
    { id: "global-search", label: "Глобальный поиск по табам", shortcut: "Ctrl+Shift+D", action: () => setGlobalSearchOpen(true) },
    { id: "find", label: "Найти", shortcut: "Ctrl+F", action: () => setPanelMode("find") },
    { id: "find-replace", label: "Найти и заменить", shortcut: "Ctrl+H", action: () => setPanelMode("findReplace") },
    { id: "presets", label: "Пресеты замены", action: () => setSidePanel("presets") },
    { id: "reference", label: "Reference panel", shortcut: "Ctrl+R", action: () => toggleSidePanel("reference") },
    { id: "trigger-phrases", label: "Фразы-триггеры", shortcut: "Ctrl+K", action: () => setTriggerPhrasesOpen(true) },
    { id: "target-send", label: "Отправить промпт", shortcut: "Ctrl+Enter", action: handleSend },
    { id: "target-pick", label: "Отправить в терминал (выбрать цель)", shortcut: "Ctrl+Shift+Enter", action: () => setTargetPicker({ mode: "send" }) },
    { id: "target-bind", label: "Привязать таб к терминалу", shortcut: "Ctrl+Alt+B", action: bindActiveTab },
    { id: "target-unbind", label: "Отвязать таб от терминала", shortcut: "Ctrl+Alt+Shift+B", action: unbindActiveTab },
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
    { id: "toggle-md-preview", label: markdownPreview ? "Редактор" : "Markdown превью", shortcut: "Alt+M", action: () => setMarkdownPreview((v) => !v) },
    { id: "settings", label: "Настройки", shortcut: "Ctrl+,", action: () => toggleSidePanel("settings") },
    { id: "focus-editor", label: "Фокус в редактор", shortcut: "Ctrl+E", action: focusEditor },
  ], [saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup, toggleDistractionFree, toggleSidePanel, setSidePanel, setPanelMode, setTheme, setTabSwitcherOpen, setGlobalSearchOpen, setTriggerPhrasesOpen, setShortcutsOpen, setMarkdownPreview, markdownPreview, focusEditor, cleanupEmptyTabs, toggleActivePin, handleSend, setTargetPicker, bindActiveTab, unbindActiveTab, openWorkspaceSwitcher, moveActiveTabToWorkspace, renameActiveWorkspace, deleteActiveWorkspace]);
}
