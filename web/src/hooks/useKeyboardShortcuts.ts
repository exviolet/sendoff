import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";
import { tabsOf } from "../lib/tabUtils";

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
}

export function useKeyboardShortcuts(callbacks?: ShortcutCallbacks) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const code = e.code;

      if (ctrl && e.shiftKey && code === "Enter") {
        e.preventDefault();
        callbacks?.onTargetPicker?.();
        return;
      }

      if (ctrl && code === "Enter") {
        e.preventDefault();
        callbacks?.onSendPrompt?.();
        return;
      }

      if (ctrl && !e.shiftKey && code === "KeyT") {
        e.preventDefault();
        callbacks?.onTabSwitcher?.();
        return;
      }

      if (ctrl && !e.shiftKey && code === "KeyR") {
        e.preventDefault();
        callbacks?.onReferencePanel?.();
        return;
      }

      if (ctrl && e.shiftKey && code === "KeyD") {
        e.preventDefault();
        callbacks?.onGlobalSearch?.();
        return;
      }

      // Привязка к tmux живёт на Ctrl+Alt+B: Ctrl+B/Ctrl+I отданы markdown-обёрткам
      // в редакторе (общемировая мышечная память, жест частый), а привязка делается
      // один раз на таб и остаётся доступна в палитре и в ПКМ по табу.
      if (ctrl && e.altKey && e.shiftKey && code === "KeyB") {
        e.preventDefault();
        callbacks?.onUnbindTarget?.();
        return;
      }

      if (ctrl && e.altKey && !e.shiftKey && code === "KeyB") {
        e.preventDefault();
        callbacks?.onBindTarget?.();
        return;
      }

      if (ctrl && code === "KeyN") {
        e.preventDefault();
        useEditorStore.getState().createTab();
        return;
      }

      if (ctrl && e.shiftKey && code === "KeyW") {
        e.preventDefault();
        callbacks?.onWorkspaceSwitcher?.();
        return;
      }

      // Ctrl+G — положить активный таб в группу (пикер со строкой создания).
      // Сворачивание остаётся на клике по чипу: пока не видно, что этот жест
      // повторяется чаще (tasks/14, решение 6). Ctrl+Shift+G оставлен свободным.
      if (ctrl && !e.shiftKey && code === "KeyG") {
        e.preventDefault();
        callbacks?.onTabGroupPicker?.();
        return;
      }

      // !e.shiftKey обязателен: иначе эта ветка перехватит Ctrl+Shift+W и закроет таб
      // вместо открытия свитчера workspace.
      if (ctrl && !e.shiftKey && code === "KeyW") {
        e.preventDefault();
        const { activeTabId, closeTab } = useEditorStore.getState();
        if (activeTabId) closeTab(activeTabId);
        return;
      }

      if (ctrl && e.shiftKey && code === "KeyT") {
        e.preventDefault();
        useEditorStore.getState().reopenTab();
        return;
      }

      // Ctrl+Shift+PgUp/PgDn — двигать сам таб по полосе. Проверяется ДО переключения:
      // иначе ветка ниже съела бы Shift как «предыдущий таб». Ctrl+Shift+Tab не трогаем —
      // это общесистемный жест «предыдущий», сдвиг на него вешать нельзя.
      if (ctrl && e.shiftKey && (code === "PageUp" || code === "PageDown")) {
        e.preventDefault();
        const { activeTabId, moveTabStep } = useEditorStore.getState();
        if (activeTabId) moveTabStep(activeTabId, code === "PageUp" ? -1 : 1);
        return;
      }

      if (ctrl && (e.key === "Tab" || code === "PageDown" || code === "PageUp")) {
        e.preventDefault();
        const { tabs, activeTabId, activeWorkspaceId, setActiveTab } =
          useEditorStore.getState();
        // Циклим только внутри активного workspace (изоляция).
        const visible = tabsOf(tabs, activeWorkspaceId);
        if (visible.length < 2) return;
        const currentIndex = visible.findIndex((t) => t.id === activeTabId);
        const goBack = e.shiftKey || code === "PageUp";
        const nextIndex = goBack
          ? (currentIndex - 1 + visible.length) % visible.length
          : (currentIndex + 1) % visible.length;
        setActiveTab(visible[nextIndex].id);
        return;
      }

      if (ctrl && code === "KeyF" && !e.shiftKey) {
        e.preventDefault();
        callbacks?.onFind?.();
        return;
      }

      if (ctrl && code === "KeyH") {
        e.preventDefault();
        callbacks?.onFindReplace?.();
        return;
      }

      if (ctrl && code === "KeyK") {
        e.preventDefault();
        callbacks?.onTriggerPhrases?.();
        return;
      }

      if (ctrl && e.shiftKey && code === "KeyP") {
        e.preventDefault();
        callbacks?.onCommandPalette?.();
        return;
      }

      if (ctrl && !e.shiftKey && code === "KeyP") {
        e.preventDefault();
        callbacks?.onTogglePin?.();
        return;
      }

      if (ctrl && e.shiftKey && code === "KeyF") {
        e.preventDefault();
        callbacks?.onDistractionFree?.();
        return;
      }

      if (ctrl && code === "Slash") {
        e.preventDefault();
        callbacks?.onShortcutsHelp?.();
        return;
      }

      if (ctrl && code === "Comma") {
        e.preventDefault();
        callbacks?.onSettings?.();
        return;
      }

      if (ctrl && code === "Period") {
        e.preventDefault();
        callbacks?.onToggleSidebar?.();
        return;
      }

      // Alt+M, а не Ctrl+M: Ctrl+M/Ctrl+Shift+M отданы редактору под инлайн-код и блок
      // кода — жесты набора, а превью переключают куда реже.
      if (!ctrl && e.altKey && code === "KeyM") {
        e.preventDefault();
        callbacks?.onToggleMarkdownPreview?.();
        return;
      }

      if (ctrl && code === "KeyE") {
        e.preventDefault();
        callbacks?.onFocusEditor?.();
        return;
      }

      if (ctrl && code === "KeyS") {
        e.preventDefault();
        callbacks?.onSave?.();
        return;
      }

      if (ctrl && code === "KeyO") {
        e.preventDefault();
        callbacks?.onOpen?.();
        return;
      }

      if (ctrl && code === "KeyZ") {
        e.preventDefault();
        const { activeTabId } = useEditorStore.getState();
        if (!activeTabId) return;
        if (e.shiftKey) {
          useEditorStore.getState().redo(activeTabId);
        } else {
          useEditorStore.getState().undo(activeTabId);
        }
        return;
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
