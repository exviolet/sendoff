import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";
import { tabsOf } from "../lib/tabUtils";
import { matchShortcut } from "../lib/shortcuts";
import { useSettingsStore } from "../store/settingsStore";

interface ShortcutCallbacks {
  onFind?: () => void;
  onFindReplace?: () => void;
  onClosePanels?: () => void;
  onSave?: () => void;
  onOpen?: () => void;
  onTriggerPhrases?: () => void;
  onCommandPalette?: () => void;
  onTogglePin?: () => void;
  onDistractionFree?: () => void;
  onShortcutsHelp?: () => void;
  onToggleSidebar?: () => void;
  onToggleMarkdownPreview?: () => void;
  onSettings?: () => void;
  onFocusEditor?: () => void;
  onSendPrompt?: () => void;
  onTargetPicker?: () => void;
  onBindTarget?: () => void;
  onUnbindTarget?: () => void;
  onTabSwitcher?: () => void;
  onReferencePanel?: () => void;
  onGlobalSearch?: () => void;
  onWorkspaceSwitcher?: () => void;
  onTabGroupPicker?: () => void;
  onScrollActiveTab?: () => boolean;
  // Открыт ли фокус-перехватывающий оверлей (пикеры на usePickerModal, палитра, модалки,
  // confirm-диалог). Глобальные хоткеи не должны стрелять СКВОЗЬ него: usePickerModal
  // (capture-фаза) стопает только Escape, а Ctrl-combos утекают в этот bubble-listener —
  // Ctrl+W из открытого свитчера закрывал бы АКТИВНЫЙ таб (не тот, что под курсором), а
  // Ctrl+Shift+D стекал бы второй пикер поверх первого. Свои клавиши модалка ловит сама.
  isModalOpen?: () => boolean;
}

export function useKeyboardShortcuts(callbacks?: ShortcutCallbacks) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Оверлей открыт → глобальные хоткеи молчат. Escape и навигацию модалка обрабатывает
      // своим listener'ом в capture-фазе (usePickerModal и остальные), сюда они не доходят
      // или доходить не должны.
      if (callbacks?.isModalOpen?.()) return;
      const command = matchShortcut(
        e,
        "global",
        useSettingsStore.getState().shortcutOverrides,
      );
      if (command) {
        // Раньше listener Ctrl+Shift+A жил в TabBar и исчезал вместе с полосой.
        // В distraction-free сохраняем это поведение: без DOM-цели клавишу не глушим.
        if (command.id === "scroll-active-tab") {
          if (callbacks?.onScrollActiveTab?.()) e.preventDefault();
          return;
        }

        e.preventDefault();

        switch (command.id) {
          case "target-pick": callbacks?.onTargetPicker?.(); return;
          case "target-send": callbacks?.onSendPrompt?.(); return;
          case "tab-switcher": callbacks?.onTabSwitcher?.(); return;
          case "reference": callbacks?.onReferencePanel?.(); return;
          case "global-search": callbacks?.onGlobalSearch?.(); return;
          case "target-unbind": callbacks?.onUnbindTarget?.(); return;
          case "target-bind": callbacks?.onBindTarget?.(); return;
          case "new-tab": useEditorStore.getState().createTab(); return;
          case "workspace-switch": callbacks?.onWorkspaceSwitcher?.(); return;
          case "tab-group-picker": callbacks?.onTabGroupPicker?.(); return;
          case "close-tab": {
            const { activeTabId, closeTab } = useEditorStore.getState();
            if (activeTabId) closeTab(activeTabId);
            return;
          }
          case "reopen-tab": useEditorStore.getState().reopenTab(); return;
          case "move-tab-left":
          case "move-tab-right": {
            const { activeTabId, moveTabStep } = useEditorStore.getState();
            if (activeTabId) moveTabStep(activeTabId, command.id === "move-tab-left" ? -1 : 1);
            return;
          }
          case "next-tab":
          case "previous-tab": {
            const { tabs, activeTabId, activeWorkspaceId, setActiveTab } =
              useEditorStore.getState();
            // Циклим только внутри активного workspace (изоляция).
            const visible = tabsOf(tabs, activeWorkspaceId);
            if (visible.length < 2) return;
            const currentIndex = visible.findIndex((tab) => tab.id === activeTabId);
            const delta = command.id === "previous-tab" ? -1 : 1;
            const nextIndex = (currentIndex + delta + visible.length) % visible.length;
            setActiveTab(visible[nextIndex].id);
            return;
          }
          case "find": callbacks?.onFind?.(); return;
          case "find-replace": callbacks?.onFindReplace?.(); return;
          case "trigger-phrases": callbacks?.onTriggerPhrases?.(); return;
          case "command-palette": callbacks?.onCommandPalette?.(); return;
          case "toggle-pin": callbacks?.onTogglePin?.(); return;
          case "distraction-free": callbacks?.onDistractionFree?.(); return;
          case "shortcuts": callbacks?.onShortcutsHelp?.(); return;
          case "settings": callbacks?.onSettings?.(); return;
          case "toggle-sidebar": callbacks?.onToggleSidebar?.(); return;
          case "toggle-md-preview": callbacks?.onToggleMarkdownPreview?.(); return;
          case "focus-editor": callbacks?.onFocusEditor?.(); return;
          case "save": callbacks?.onSave?.(); return;
          case "open": callbacks?.onOpen?.(); return;
          case "undo":
          case "redo": {
            const { activeTabId, undo, redo } = useEditorStore.getState();
            if (!activeTabId) return;
            if (command.id === "redo") redo(activeTabId);
            else undo(activeTabId);
            return;
          }
        }
      }

      if (e.key === "Escape") {
        callbacks?.onClosePanels?.();
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [callbacks]);
}
