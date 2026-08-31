import { useEffect, useRef } from "react";
import { useEditorStore } from "../store/editorStore";
import { usePresetsStore } from "../store/presetsStore";
import { useTriggerPhrasesStore } from "../store/triggerPhrasesStore";
import { useThemeStore } from "../store/themeStore";
import { useSettingsStore } from "../store/settingsStore";
import { useReferenceStore } from "../store/referenceStore";
import { loadSession, saveSession, setOnboardingVersion } from "../lib/db";
import { decideOnboarding } from "../lib/onboarding";
import { useOnboardingStore } from "../store/onboardingStore";
import { describeError } from "../lib/terminalTargets";
import { toast } from "../store/toastStore";

export function useSessionPersistence() {
  const hasRestored = useRef(false);

  // Restore on mount
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    loadSession().then(({ tabs, closedTabs, presets, triggerPhrases, workspaces, tabGroups, activeTabId, activeWorkspaceId, tabCounter, theme, fontSize, wordWrap, tmuxAutoSubmit, fontFamily, phraseInsertMode, shortcutOverrides, referenceText, referenceWidth, onboardingVersion }) => {
      // hydrate зовём и при пустых табах: он поднимает workspaces и держит инвариант
      // «активный workspace непуст» (создаст свежий таб, если надо).
      if (tabs.length > 0 || workspaces.length > 0) {
        useEditorStore.getState().hydrate(tabs, activeTabId, tabCounter, workspaces, activeWorkspaceId, tabGroups, closedTabs);
      } else {
        useEditorStore.setState({ isHydrated: true });
      }
      if (presets.length > 0) {
        usePresetsStore.getState().hydrate(presets);
      }
      if (triggerPhrases.length > 0) {
        useTriggerPhrasesStore.getState().hydrate(triggerPhrases);
      }
      if (theme === "light" || theme === "dark" || theme === "system") {
        useThemeStore.getState().hydrate(theme);
      }
      useSettingsStore.getState().hydrate({ fontSize, wordWrap, tmuxAutoSubmit, fontFamily, phraseInsertMode, shortcutOverrides });
      useReferenceStore.getState().hydrate({
        text: referenceText,
        width: referenceWidth ?? useReferenceStore.getState().width,
      });

      // Решение принимается по ПЕРСИСТЕНТНЫМ данным, а не по состоянию после hydrate:
      // hydrate сам создаёт «Untitled 1» и workspace «Default», когда активного таба
      // нет, и по ним любой первый запуск выглядел бы как существующий пользователь.
      // storageError здесь всегда null — ветка отказа живёт в .catch ниже.
      const decision = decideOnboarding({
        storageError: null,
        onboardingVersion,
        data: { tabs, closedTabs, workspaces, tabGroups },
      });
      if (decision.kind === "show") {
        useOnboardingStore.getState().start();
      } else if (decision.kind === "backfill") {
        // База уже обжитая, а ключа нет — значит фича новее этой базы. Проставляем
        // тихо: показывать «добро пожаловать» человеку с накопленными табами нельзя.
        void setOnboardingVersion(decision.version).catch(() => {});
      }
    }).catch((error: unknown) => {
      // Leave isHydrated=false on purpose: blocks the persist effect below, so a
      // failed read can't clobber existing IndexedDB data with empty defaults.
      //
      // Причину ОБЯЗАТЕЛЬНО протаскиваем наружу. Раньше здесь стоял `.catch(() => …)`
      // без аргумента, и настоящая ошибка выбрасывалась: пользователь видел только
      // «Failed to load session from storage», за которым 2026-08-10 пряталась
      // несовместимость форматов IndexedDB между версиями WebKit (AppImage несёт
      // 2.50.4 и не читает базу, записанную хостовым 2.52.5). Тот же класс, что
      // gotcha #9 в web/CLAUDE.md — ошибка из движка не обязана быть Error.
      const reason = describeError(error);
      console.error("loadSession failed:", error);
      useEditorStore.setState({ storageError: reason });
      // Тост живёт 2.5с и уходит, а редактор остаётся пустым — это читается как
      // «данные пропали». Незатухающую правду показывает StorageErrorBanner.
      toast("Failed to load session from storage", "error");
    });
  }, []);

  // Persist on changes (debounced 500ms)
  useEffect(() => {
    const schedule = () => {
      if (!useEditorStore.getState().isHydrated) return;
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { void writeSession(); }, 500);
    };

    const unsubs = [
      useEditorStore.subscribe(schedule),
      usePresetsStore.subscribe(schedule),
      useTriggerPhrasesStore.subscribe(schedule),
      useThemeStore.subscribe(schedule),
      useSettingsStore.subscribe(schedule),
      useReferenceStore.subscribe(schedule),
    ];

    return () => {
      clearTimeout(saveTimer);
      unsubs.forEach((off) => off());
    };
  }, []);
}

let saveTimer: ReturnType<typeof setTimeout>;
let saveErrorShown = false;

// Записать прямо сейчас, не дожидаясь дебаунса. Ручного «сохранения» в редакторе нет:
// запись автоматическая, и это единственная честная работа, которая осталась для Ctrl+S.
// Зовётся ещё и при закрытии окна — там дебаунс мог не успеть догореть.
export function flushSession(): Promise<void> {
  clearTimeout(saveTimer);
  return writeSession();
}

function writeSession(): Promise<void> {
  if (!useEditorStore.getState().isHydrated) return Promise.resolve();

  const { tabs, closedTabs, activeTabId, tabCounter, workspaces, activeWorkspaceId, tabGroups } = useEditorStore.getState();
  const { presets } = usePresetsStore.getState();
  const { phrases } = useTriggerPhrasesStore.getState();
  const { theme } = useThemeStore.getState();
  const { fontSize, wordWrap, tmuxAutoSubmit, fontFamily, phraseInsertMode, shortcutOverrides } = useSettingsStore.getState();
  const { text: referenceText, width: referenceWidth } = useReferenceStore.getState();

  return saveSession({
    tabs, closedTabs, activeTabId, tabCounter, workspaces, activeWorkspaceId, tabGroups,
    presets, triggerPhrases: phrases, theme,
    fontSize, wordWrap, tmuxAutoSubmit, fontFamily, phraseInsertMode, shortcutOverrides, referenceText, referenceWidth,
  })
    .then(() => { saveErrorShown = false; })
    .catch(() => {
      // Throttle: one toast per failure streak, not every 500ms tick.
      if (!saveErrorShown) {
        saveErrorShown = true;
        toast("Failed to save session", "error");
      }
    });
}
