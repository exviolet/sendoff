import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { usePresetsStore } from "../store/presetsStore";
import { usePromptTemplatesStore } from "../store/promptTemplatesStore";
import { useThemeStore } from "../store/themeStore";
import { useSettingsStore } from "../store/settingsStore";
import { useReferenceStore } from "../store/referenceStore";
import { loadSession, saveSession } from "../lib/db";
import { toast } from "../store/toastStore";

export function useSessionPersistence() {
  const hasRestored = useRef(false);

  // Restore on mount
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    loadSession().then(({ tabs, presets, promptTemplates, activeTabId, tabCounter, theme, fontSize, wordWrap, tmuxAutoSubmit, referenceText, referenceWidth }) => {
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
      useSettingsStore.getState().hydrate({ fontSize, wordWrap, tmuxAutoSubmit });
      useReferenceStore.getState().hydrate({
        text: referenceText,
        width: referenceWidth ?? useReferenceStore.getState().width,
      });
    }).catch(() => {
      // Leave isHydrated=false on purpose: blocks the persist effect below, so a
      // failed read can't clobber existing IndexedDB data with empty defaults.
      toast("Не удалось загрузить сессию из хранилища", "error");
    });
  }, []);

  // Persist on changes (debounced 500ms)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let saveErrorShown = false;

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

    const unsubReference = useReferenceStore.subscribe(() => {
      if (!useEditorStore.getState().isHydrated) return;
      clearTimeout(timer);
      timer = setTimeout(persist, 500);
    });

    function persist() {
      const { tabs, activeTabId, tabCounter } = useEditorStore.getState();
      const { presets } = usePresetsStore.getState();
      const { templates } = usePromptTemplatesStore.getState();
      const { theme } = useThemeStore.getState();
      const { fontSize, wordWrap, tmuxAutoSubmit } = useSettingsStore.getState();
      const { text: referenceText, width: referenceWidth } = useReferenceStore.getState();
      saveSession(tabs, activeTabId, tabCounter, presets, templates, theme, fontSize, wordWrap, tmuxAutoSubmit, referenceText, referenceWidth)
        .then(() => { saveErrorShown = false; })
        .catch(() => {
          // Throttle: one toast per failure streak, not every 500ms tick.
          if (!saveErrorShown) {
            saveErrorShown = true;
            toast("Не удалось сохранить сессию", "error");
          }
        });
    }

    return () => {
      clearTimeout(timer);
      unsubEditor();
      unsubPresets();
      unsubTemplates();
      unsubTheme();
      unsubSettings();
      unsubReference();
    };
  }, []);
}
