import { useEffect } from "react";
import { useEditorStore } from "../store/editorStore";

interface ShortcutCallbacks {
  onFind?: () => void;
  onFindReplace?: () => void;
  onClosePanels?: () => void;
}

export function useKeyboardShortcuts(callbacks?: ShortcutCallbacks) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;

      if (ctrl && e.key === "n") {
        e.preventDefault();
        useEditorStore.getState().createTab();
        return;
      }

      if (ctrl && e.key === "w") {
        e.preventDefault();
        const { activeTabId, closeTab } = useEditorStore.getState();
        if (activeTabId) closeTab(activeTabId);
        return;
      }

      if (ctrl && e.key === "Tab") {
        e.preventDefault();
        const { tabs, activeTabId, setActiveTab } =
          useEditorStore.getState();
        if (tabs.length < 2) return;
        const currentIndex = tabs.findIndex((t) => t.id === activeTabId);
        const nextIndex = e.shiftKey
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : (currentIndex + 1) % tabs.length;
        setActiveTab(tabs[nextIndex].id);
        return;
      }

      if (ctrl && e.key === "f" && !e.shiftKey) {
        e.preventDefault();
        callbacks?.onFind?.();
        return;
      }

      if (ctrl && e.key === "h") {
        e.preventDefault();
        callbacks?.onFindReplace?.();
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
