import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";

interface ShortcutCallbacks {
  onFind?: () => void;
  onFindReplace?: () => void;
  onClosePanels?: () => void;
  onSave?: () => void;
  onOpen?: () => void;
  onAIPrompt?: () => void;
  onCommandPalette?: () => void;
  onDistractionFree?: () => void;
  onShortcutsHelp?: () => void;
  onToggleSidebar?: () => void;
  onToggleMarkdownPreview?: () => void;
  onSettings?: () => void;
}

export function useKeyboardShortcuts(callbacks?: ShortcutCallbacks) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      const code = e.code;

      if (ctrl && code === "KeyN") {
        e.preventDefault();
        useEditorStore.getState().createTab();
        return;
      }

      if (ctrl && code === "KeyW") {
        e.preventDefault();
        const { activeTabId, closeTab } = useEditorStore.getState();
        if (activeTabId) closeTab(activeTabId);
        return;
      }

      if (ctrl && (e.key === "Tab" || code === "PageDown" || code === "PageUp")) {
        e.preventDefault();
        const { tabs, activeTabId, setActiveTab } =
          useEditorStore.getState();
        if (tabs.length < 2) return;
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        const goBack = e.shiftKey || code === "PageUp";
        const nextIndex = goBack
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex].id);
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
        callbacks?.onAIPrompt?.();
        return;
      }

      if (ctrl && code === "KeyP") {
        e.preventDefault();
        callbacks?.onCommandPalette?.();
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

      if (ctrl && code === "KeyM") {
        e.preventDefault();
        callbacks?.onToggleMarkdownPreview?.();
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
