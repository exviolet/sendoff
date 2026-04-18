import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { usePresetsStore } from "../store/presetsStore";
import { usePromptTemplatesStore } from "../store/promptTemplatesStore";
import { useThemeStore } from "../store/themeStore";
import { useSettingsStore } from "../store/settingsStore";
import { loadSession, saveSession } from "../lib/db";

export function useSessionPersistence() {
  const hasRestored = useRef(false);

  // Restore on mount
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    loadSession().then(({ tabs, presets, promptTemplates, activeTabId, tabCounter, theme, fontSize, wordWrap }) => {
      if (tabs.length > 0) {
        useEditorStore.getState().hydrate(tabs, activeTabId, tabCounter);
      } else {
        useEditorStore.setState({ isHydrated: true });
      }
      if (presets.length > 0) {
        usePresetsStore.getState().hydrate(presets);
      }
      if (promptTemplates.length > 0) {
        usePromptTemplatesStore.getState().hydrate(promptTemplates);
      }
      if (theme === "light" || theme === "dark" || theme === "system") {
        useThemeStore.getState().hydrate(theme);
      }
      useSettingsStore.getState().hydrate({ fontSize, wordWrap });
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

    const unsubTemplates = usePromptTemplatesStore.subscribe(() => {
      if (!useEditorStore.getState().isHydrated) return;
      clearTimeout(timer);
      timer = setTimeout(persist, 500);
    });

    const unsubTheme = useThemeStore.subscribe(() => {
      if (!useEditorStore.getState().isHydrated) return;
      clearTimeout(timer);
      timer = setTimeout(persist, 500);
    });

    const unsubSettings = useSettingsStore.subscribe(() => {
      if (!useEditorStore.getState().isHydrated) return;
      clearTimeout(timer);
      timer = setTimeout(persist, 500);
    });

    function persist() {
      const { tabs, activeTabId, tabCounter } = useEditorStore.getState();
      const { presets } = usePresetsStore.getState();
      const { templates } = usePromptTemplatesStore.getState();
      const { theme } = useThemeStore.getState();
      const { fontSize, wordWrap } = useSettingsStore.getState();
      saveSession(tabs, activeTabId, tabCounter, presets, templates, theme, fontSize, wordWrap);
    }

    return () => {
      clearTimeout(timer);
      unsubEditor();
      unsubPresets();
      unsubTemplates();
      unsubTheme();
      unsubSettings();
    };
  }, []);
}
