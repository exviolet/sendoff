import { useMemo, type Dispatch, type SetStateAction } from "react";
import { type Command } from "../components/CommandPalette/CommandPalette";
import { useEditorStore } from "../store/editorStore";
import { toast } from "../store/toastStore";
import { type TargetPickerState } from "./useTerminalActions";
import {
  effectiveChords,
  formatChord,
  shortcutCommands,
  type ShortcutOverrides,
} from "../lib/shortcuts";
import { useSettingsStore } from "../store/settingsStore";

export type PanelMode = null | "find" | "findReplace";
export type SidePanel = null | "presets" | "settings" | "reference";

const SHORTCUTS_BY_ID = new Map<string, (typeof shortcutCommands)[number]>(
  shortcutCommands.map((command) => [command.id, command]),
);

function addRegistryShortcuts(
  commands: Command[],
  overrides: ShortcutOverrides,
): Command[] {
  return commands.map((command) => {
    const registered = SHORTCUTS_BY_ID.get(command.id);
    if (!registered) return command;
    const firstChord = effectiveChords(registered.id, overrides)[0];
    return firstChord ? { ...command, shortcut: formatChord(firstChord) } : command;
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
  const shortcutOverrides = useSettingsStore((state) => state.shortcutOverrides);
  const {
    saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup,
    toggleDistractionFree, toggleSidePanel, setSidePanel, setPanelMode, setTheme,
    setTabSwitcherOpen, setGlobalSearchOpen, setTriggerPhrasesOpen, setShortcutsOpen, setMarkdownPreview,
    markdownPreview, focusEditor, cleanupEmptyTabs, toggleActivePin,
    handleSend, setTargetPicker, bindActiveTab, unbindActiveTab,
    openWorkspaceSwitcher, moveActiveTabToWorkspace, renameActiveWorkspace, deleteActiveWorkspace,
  } = deps;

  return useMemo(() => addRegistryShortcuts([
    { id: "new-tab", label: "New tab", action: () => useEditorStore.getState().createTab() },
    { id: "close-tab", label: "Close tab", action: () => {
      const { activeTabId, closeTab } = useEditorStore.getState();
      if (activeTabId) closeTab(activeTabId);
    }},
    { id: "close-other-tabs", label: "Close other tabs", action: () => {
      const { activeTabId, closeOtherTabs } = useEditorStore.getState();
      if (!activeTabId) return;
      if (closeOtherTabs(activeTabId) === 0) toast("Nothing to close", "info");
    }},
    { id: "close-tabs-to-right", label: "Close tabs to the right", action: () => {
      const { activeTabId, closeTabsToRight } = useEditorStore.getState();
      if (!activeTabId) return;
      if (closeTabsToRight(activeTabId) === 0) toast("Nothing to close", "info");
    }},
    { id: "workspace-switch", label: "Workspace: switch / create…", action: openWorkspaceSwitcher },
    { id: "workspace-move-tab", label: "Workspace: move tab…", action: moveActiveTabToWorkspace },
    { id: "workspace-rename", label: "Workspace: rename…", action: renameActiveWorkspace },
    { id: "workspace-delete", label: "Workspace: delete…", action: deleteActiveWorkspace },
    { id: "toggle-pin", label: "Pin / unpin tab", action: toggleActivePin },
    { id: "cleanup-empty-tabs", label: "Clean up empty tabs", action: cleanupEmptyTabs },
    { id: "reopen-tab", label: "Reopen closed tab", action: () => useEditorStore.getState().reopenTab() },
    { id: "tab-switcher", label: "Find tab", action: () => setTabSwitcherOpen(true) },
    { id: "global-search", label: "Search across all tabs", action: () => setGlobalSearchOpen(true) },
    { id: "find", label: "Find", action: () => setPanelMode("find") },
    { id: "find-replace", label: "Find and replace", action: () => setPanelMode("findReplace") },
    { id: "presets", label: "Replace presets", action: () => setSidePanel("presets") },
    { id: "reference", label: "Reference panel", action: () => toggleSidePanel("reference") },
    { id: "trigger-phrases", label: "Trigger phrases", action: () => setTriggerPhrasesOpen(true) },
    { id: "target-send", label: "Send prompt", action: handleSend },
    { id: "target-pick", label: "Send to terminal (pick target)", action: () => setTargetPicker({ mode: "send" }) },
    { id: "target-bind", label: "Bind tab to terminal", action: bindActiveTab },
    { id: "target-unbind", label: "Unbind tab from terminal", action: unbindActiveTab },
    { id: "save", label: "Write now (usually automatic)", action: saveCurrentTab },
    { id: "open", label: "Open file", action: openFile },
    { id: "download", label: "Download tab", action: downloadCurrentTab },
    { id: "export", label: "Export backup", action: exportAll },
    { id: "import", label: "Import backup", action: importBackup },
    { id: "distraction-free", label: "Distraction-free mode", action: toggleDistractionFree },
    { id: "shortcuts", label: "Keyboard shortcuts", action: () => setShortcutsOpen(true) },
    { id: "theme-dark", label: "Theme: Dark", action: () => setTheme("dark") },
    { id: "theme-light", label: "Theme: Light", action: () => setTheme("light") },
    { id: "theme-system", label: "Theme: System", action: () => setTheme("system") },
    { id: "toggle-sidebar", label: "Presets (sidebar)", action: () => toggleSidePanel("presets") },
    { id: "toggle-md-preview", label: markdownPreview ? "Editor" : "Markdown preview", action: () => setMarkdownPreview((v) => !v) },
    { id: "settings", label: "Settings", action: () => toggleSidePanel("settings") },
    { id: "focus-editor", label: "Focus editor", action: focusEditor },
  ], shortcutOverrides), [saveCurrentTab, openFile, downloadCurrentTab, exportAll, importBackup, toggleDistractionFree, toggleSidePanel, setSidePanel, setPanelMode, setTheme, setTabSwitcherOpen, setGlobalSearchOpen, setTriggerPhrasesOpen, setShortcutsOpen, setMarkdownPreview, markdownPreview, focusEditor, cleanupEmptyTabs, toggleActivePin, handleSend, setTargetPicker, bindActiveTab, unbindActiveTab, openWorkspaceSwitcher, moveActiveTabToWorkspace, renameActiveWorkspace, deleteActiveWorkspace, shortcutOverrides]);
}
