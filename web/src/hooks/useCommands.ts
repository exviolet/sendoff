import { useMemo, type Dispatch, type SetStateAction } from "react";
import { type Command } from "../components/CommandPalette/CommandPalette";
import { useEditorStore } from "../store/editorStore";
import { toast } from "../store/toastStore";
import { type TargetPickerState } from "./useTerminalActions";
import {
  formatChord,
  shortcutCommands,
} from "../lib/shortcuts";

export type PanelMode = null | "find" | "findReplace";
export type SidePanel = null | "presets" | "settings" | "reference";

const SHORTCUTS_BY_ID = new Map<string, (typeof shortcutCommands)[number]>(
  shortcutCommands.map((command) => [command.id, command]),
);

function addRegistryShortcuts(commands: Command[]): Command[] {
  return commands.map((command) => {
    const registered = SHORTCUTS_BY_ID.get(command.id);
    return registered
      ? { ...command, shortcut: formatChord(registered.defaults[0]) }
      : command;
  });
}

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

  return useMemo(() => addRegistryShortcuts([
    { id: "new-tab", label: "Новый таб", action: () => useEditorStore.getState().createTab() },
    { id: "close-tab", label: "Закрыть таб", action: () => {
      const { activeTabId, closeTab } = useEditorStore.getState();
      if (activeTabId) closeTab(activeTabId);
    }},
    { id: "close-other-tabs", label: "Закрыть остальные табы", action: () => {
      const { activeTabId, closeOtherTabs } = useEditorStore.getState();
      if (!activeTabId) return;
      if (closeOtherTabs(activeTabId) === 0) toast("Нечего закрывать", "info");
    }},
    { id: "close-tabs-to-right", label: "Закрыть табы справа", action: () => {
      const { activeTabId, closeTabsToRight } = useEditorStore.getState();
      if (!activeTabId) return;
      if (closeTabsToRight(activeTabId) === 0) toast("Нечего закрывать", "info");
    }},
    { id: "workspace-switch", label: "Workspace: переключить / создать…", action: openWorkspaceSwitcher },
    { id: "workspace-move-tab", label: "Workspace: переместить таб…", action: moveActiveTabToWorkspace },
    { id: "workspace-rename", label: "Workspace: переименовать…", action: renameActiveWorkspace },
    { id: "workspace-delete", label: "Workspace: удалить…", action: deleteActiveWorkspace },
    { id: "toggle-pin", label: "Закрепить/открепить таб", action: toggleActivePin },
    { id: "cleanup-empty-tabs", label: "Очистить пустые табы", action: cleanupEmptyTabs },
    { id: "reopen-tab", label: "Восстановить закрытый таб", action: () => useEditorStore.getState().reopenTab() },
    { id: "tab-switcher", label: "Найти таб", action: () => setTabSwitcherOpen(true) },
    { id: "global-search", label: "Глобальный поиск по табам", action: () => setGlobalSearchOpen(true) },
    { id: "find", label: "Найти", action: () => setPanelMode("find") },
    { id: "find-replace", label: "Найти и заменить", action: () => setPanelMode("findReplace") },
    { id: "presets", label: "Пресеты замены", action: () => setSidePanel("presets") },
    { id: "reference", label: "Reference panel", action: () => toggleSidePanel("reference") },
    { id: "trigger-phrases", label: "Фразы-триггеры", action: () => setTriggerPhrasesOpen(true) },
    { id: "target-send", label: "Отправить промпт", action: handleSend },
    { id: "target-pick", label: "Отправить в терминал (выбрать цель)", action: () => setTargetPicker({ mode: "send" }) },
    { id: "target-bind", label: "Привязать таб к терминалу", action: bindActiveTab },
    { id: "target-unbind", label: "Отвязать таб от терминала", action: unbindActiveTab },
    { id: "save", label: "Записать сейчас (обычно само)", action: saveCurrentTab },
    { id: "open", label: "Открыть файл", action: openFile },
    { id: "download", label: "Скачать таб", action: downloadCurrentTab },
    { id: "export", label: "Экспорт бэкапа", action: exportAll },
    { id: "import", label: "Импорт бэкапа", action: importBackup },
    { id: "distraction-free", label: "Distraction-free режим", action: toggleDistractionFree },
    { id: "shortcuts", label: "Клавиатурные сокращения", action: () => setShortcutsOpen(true) },
    { id: "theme-dark", label: "Тема: Тёмная", action: () => setTheme("dark") },
    { id: "theme-light", label: "Тема: Светлая", action: () => setTheme("light") },
    { id: "theme-system", label: "Тема: Системная", action: () => setTheme("system") },
    { id: "toggle-sidebar", label: "Пресеты (sidebar)", action: () => toggleSidePanel("presets") },
    { id: "toggle-md-preview", label: markdownPreview ? "Редактор" : "Markdown превью", action: () => setMarkdownPreview((v) => !v) },
    { id: "settings", label: "Настройки", action: () => toggleSidePanel("settings") },
    { id: "focus-editor", label: "Фокус в редактор", action: focusEditor },
  ]), [saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup, toggleDistractionFree, toggleSidePanel, setSidePanel, setPanelMode, setTheme, setTabSwitcherOpen, setGlobalSearchOpen, setTriggerPhrasesOpen, setShortcutsOpen, setMarkdownPreview, markdownPreview, focusEditor, cleanupEmptyTabs, toggleActivePin, handleSend, setTargetPicker, bindActiveTab, unbindActiveTab, openWorkspaceSwitcher, moveActiveTabToWorkspace, renameActiveWorkspace, deleteActiveWorkspace]);
}
