import { useCallback, useState, type RefObject } from "react";
import { useEditorStore } from "../store/editorStore";
import { useSettingsStore } from "../store/settingsStore";
import { useHerdrSend, resolveHerdrBinding, type HerdrAgentTarget } from "./useHerdrSend";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";

export type HerdrPicker = null | { mode: "send" } | { mode: "bind"; tabId: string };

// Третий близнец getSendText (см. тот же комментарий в useOrcaActions). Общий util
// появится вместе с TerminalTarget-абстракцией — сейчас три копии по 6 строк дешевле,
// чем трогать обкатанный tmux-путь ради общего хелпера.
function readSendText(textarea: HTMLTextAreaElement | null, fallback: string): string {
  const hasSelection = textarea && textarea.selectionStart !== textarea.selectionEnd;
  return textarea
    ? hasSelection
      ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
      : textarea.value
    : fallback;
}

export function useHerdrActions(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  const [herdrPicker, setHerdrPicker] = useState<HerdrPicker>(null);
  const tmuxAutoSubmit = useSettingsStore((s) => s.tmuxAutoSubmit);
  const sendToHerdr = useHerdrSend();

  const getSendText = useCallback((): string | null => {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return null;
    return readSendText(textareaRef.current, tab.content);
  }, [textareaRef]);

  const handleHerdrSend = useCallback(async () => {
    const text = getSendText();
    if (text === null) return;

    if (!isTauri) {
      void sendToHerdr(text, { handle: "", submit: tmuxAutoSubmit });
      return;
    }

    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    const binding = tab?.herdrBinding;
    if (!tab || !binding) {
      setHerdrPicker({ mode: "send" });
      return;
    }

    const where = `${binding.workspace}/${binding.tab}`;
    const resolution = await resolveHerdrBinding(binding);

    if (resolution.kind === "ambiguous") {
      // Не угадываем: промпт чужому агенту хуже лишнего клика.
      toast(`Панелей «${where}» несколько (${resolution.count}) — выбери цель`, "info");
      setHerdrPicker({ mode: "send" });
      return;
    }

    if (resolution.kind === "not-found") {
      toast(`Herdr-панель «${where}» не найдена — выбери цель`, "info");
      setHerdrPicker({ mode: "send" });
      return;
    }

    // Резолв прошёл по лейблам, а номер панели сменился (её пересоздали) — подтягиваем
    // привязку, чтобы следующий раз был точным попаданием, а не fallback'ом.
    if (resolution.paneId !== binding.paneId) {
      useEditorStore.getState().setHerdrBinding(tab.id, { ...binding, paneId: resolution.paneId });
    }

    void sendToHerdr(text, { handle: resolution.paneId, submit: tmuxAutoSubmit });
  }, [getSendText, sendToHerdr, tmuxAutoSubmit]);

  const handleHerdrPick = useCallback((target: HerdrAgentTarget) => {
    const picker = herdrPicker;
    setHerdrPicker(null);
    if (!picker) return;

    if (picker.mode === "bind") {
      useEditorStore.getState().setHerdrBinding(picker.tabId, {
        paneId: target.paneId,
        workspace: target.workspace,
        tab: target.tab,
      });
      toast(`Таб привязан к Herdr «${target.workspace}/${target.tab}»`, "success");
      return;
    }

    const text = getSendText();
    if (text === null) return;
    void sendToHerdr(text, { handle: target.paneId, submit: tmuxAutoSubmit });
  }, [herdrPicker, getSendText, sendToHerdr, tmuxAutoSubmit]);

  const bindActiveTabHerdr = useCallback(() => {
    const id = useEditorStore.getState().activeTabId;
    if (id) setHerdrPicker({ mode: "bind", tabId: id });
  }, []);

  // Привязать конкретный таб (для контекстного меню TabBar).
  const openBindPickerHerdr = useCallback((tabId: string) => {
    setHerdrPicker({ mode: "bind", tabId });
  }, []);

  const unbindActiveTabHerdr = useCallback(() => {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    if (!tab.herdrBinding) {
      toast("Таб не привязан к Herdr", "info");
      return;
    }
    useEditorStore.getState().setHerdrBinding(tab.id, null);
    toast("Таб отвязан от Herdr", "success");
  }, []);

  return {
    herdrPicker,
    setHerdrPicker,
    handleHerdrSend,
    handleHerdrPick,
    bindActiveTabHerdr,
    openBindPickerHerdr,
    unbindActiveTabHerdr,
  };
}
