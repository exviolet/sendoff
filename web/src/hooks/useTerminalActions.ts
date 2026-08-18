import { useCallback, useState, type RefObject } from "react";
import { useEditorStore } from "../store/editorStore";
import { useSettingsStore } from "../store/settingsStore";
import { useLastTargetStore } from "../store/lastTargetStore";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";
import { useOnboardingStore } from "../store/onboardingStore";
import {
  describeBinding,
  describeError,
  providerBySource,
  providerFor,
  type TargetSource,
  type TerminalTarget,
} from "../lib/terminalTargets";

export type TargetPickerState = null | { mode: "send" } | { mode: "bind"; tabId: string };

// Владеет отправкой и привязкой для ВСЕХ терминальных таргетов. Раньше это были три
// почти одинаковых хука (useTmuxActions / useOrcaActions / useHerdrActions), которые
// расходились в мелочах — три копии цепочки резолва и три набора тостов.
export function useTerminalActions(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  const [targetPicker, setTargetPicker] = useState<TargetPickerState>(null);
  const autoSubmit = useSettingsStore((s) => s.tmuxAutoSubmit);

  // Текст для отправки: выделение, если есть, иначе весь буфер активного таба.
  const getSendText = useCallback((): string | null => {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return null;

    const textarea = textareaRef.current;
    const hasSelection = textarea && textarea.selectionStart !== textarea.selectionEnd;
    return textarea
      ? hasSelection
        ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
        : textarea.value
      : tab.content;
  }, [textareaRef]);

  // Единственная точка отправки: тосты успеха/ошибки и clipboard-фолбэк живут здесь,
  // провайдеры только делают дело и бросают.
  const sendVia = useCallback(
    async (source: TargetSource, handle: string, text: string) => {
      const provider = providerBySource(source);
      try {
        const where = await provider.send(handle, text, autoSubmit);
        toast(`Sent to ${provider.label}: ${where} (${text.length} chars)`, "success");
        // Первый запуск закрывается ровно здесь — по факту успешно отработавшего
        // send-пути. Это максимум, что Sendoff вправе утверждать: что агент прочитал
        // промпт, он не знает (capture-pane отклонён 2026-06-16). Вне онбординга
        // вызов — no-op.
        useOnboardingStore.getState().finish();
      } catch (error) {
        // describeError, а не `instanceof Error`: у не-Error тут была заглушка
        // «Неизвестная ошибка», и настоящая причина сбоя терялась (см. коммент
        // у самой функции). Формулировки провайдеров (`herdr error: …`) приходят
        // Error'ом и выглядят как раньше.
        toast(`${provider.label}: ${describeError(error)}`, "error");
        console.error(`[${provider.label}] send failed`, error);
      }
    },
    [autoSubmit],
  );

  // Ctrl+Enter — цепочка резолва: Explicit (привязка) → Last (последний выбор) → Modal.
  const handleSend = useCallback(async () => {
    const text = getSendText();
    if (text === null) return;

    if (!text) {
      toast("Nothing to send", "info");
      return;
    }

    // Браузер: shell недоступен — единый clipboard-фолбэк вместо трёх копий.
    if (!isTauri) {
      await navigator.clipboard.writeText(text);
      toast(`Copied: ${text.length} chars`, "success");
      return;
    }

    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    const binding = tab?.binding;

    // 1. Explicit.
    if (tab && binding) {
      const provider = providerFor(binding);
      const where = provider.describe(binding);
      const resolution = await provider.resolve(binding);

      if (resolution.kind === "ambiguous") {
        // Не угадываем: промпт чужому агенту хуже лишнего клика. Зовём перепривязать —
        // новая привязка запомнит уникальный ключ и станет однозначной.
        toast(`${provider.label}: several targets named “${where}” (${resolution.count}) — rebind the tab`, "error");
        setTargetPicker({ mode: "bind", tabId: tab.id });
        return;
      }

      if (resolution.kind === "not-found") {
        toast(`${provider.label}: target “${where}” not found — pick another`, "info");
        setTargetPicker({ mode: "send" });
        return;
      }

      // Резолв прошёл по запасному признаку, а хендл сменился — подтягиваем привязку,
      // чтобы следующий раз был точным попаданием, а не fallback'ом.
      if (binding.source === "herdr" && resolution.handle !== binding.paneId) {
        useEditorStore.getState().setTabBinding(tab.id, { ...binding, paneId: resolution.handle });
      }

      await sendVia(binding.source, resolution.handle, text);
      return;
    }

    // 2. Last — последний выбор в пикере (in-memory).
    const last = useLastTargetStore.getState().lastTarget;
    if (last) {
      await sendVia(last.source, last.handle, text);
      return;
    }

    // 3. Modal.
    setTargetPicker({ mode: "send" });
  }, [getSendText, sendVia]);

  // Выбор в пикере: привязать таб (bind) или отправить (send).
  const handlePick = useCallback(
    (target: TerminalTarget) => {
      const picker = targetPicker;
      setTargetPicker(null);
      if (!picker) return;

      if (picker.mode === "bind") {
        useEditorStore.getState().setTabBinding(picker.tabId, target.binding);
        toast(`Tab bound: ${describeBinding(target.binding)}`, "success");
        return;
      }

      const text = getSendText();
      if (text === null) return;
      useLastTargetStore.getState().setLastTarget({
        source: target.source,
        handle: target.handle,
        label: target.primary,
      });
      void sendVia(target.source, target.handle, text);
    },
    [targetPicker, getSendText, sendVia],
  );

  const openBindPicker = useCallback((tabId: string) => {
    setTargetPicker({ mode: "bind", tabId });
  }, []);

  const bindActiveTab = useCallback(() => {
    const id = useEditorStore.getState().activeTabId;
    if (id) setTargetPicker({ mode: "bind", tabId: id });
  }, []);

  const unbindActiveTab = useCallback(() => {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    if (!tab.binding) {
      toast("Tab is not bound to a terminal", "info");
      return;
    }
    const where = describeBinding(tab.binding);
    useEditorStore.getState().setTabBinding(tab.id, null);
    toast(`Tab unbound: ${where}`, "success");
  }, []);

  return {
    targetPicker,
    setTargetPicker,
    handleSend,
    handlePick,
    openBindPicker,
    bindActiveTab,
    unbindActiveTab,
  };
}
