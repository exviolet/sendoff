import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { usePresetsStore } from "../store/presetsStore";
import { loadSession, saveSession } from "../lib/db";

export function useSessionPersistence() {
  const hasRestored = useRef(false);

  // Restore on mount
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    loadSession().then(({ tabs, presets, activeTabId, tabCounter }) => {
      if (tabs.length > 0) {
        useEditorStore.getState().hydrate(tabs, activeTabId, tabCounter);
      } else {
        useEditorStore.setState({ isHydrated: true });
      }
      if (presets.length > 0) {
        usePresetsStore.getState().hydrate(presets);
      }
    });
  }, []);

  // Persist on changes (debounced 500ms)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    const unsubEditor = useEditorStore.subscribe(() => {
      if (!useEditorStore.getState().isHydrated) return;
      clearTimeout(timer);
      timer = setTimeout(persist, 500);
    });

    const unsubPresets = usePresetsStore.subscribe(() => {
      if (!useEditorStore.getState().isHydrated) return;
      clearTimeout(timer);
      timer = setTimeout(persist, 500);
    });

    function persist() {
      const { tabs, activeTabId, tabCounter } = useEditorStore.getState();
      const { presets } = usePresetsStore.getState();
      saveSession(tabs, activeTabId, tabCounter, presets);
    }

    return () => {
      clearTimeout(timer);
      unsubEditor();
      unsubPresets();
    };
  }, []);
}
