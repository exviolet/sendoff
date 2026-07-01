import { useCallback, useState, type RefObject } from "react";
import { useEditorStore } from "../store/editorStore";
import { useSettingsStore } from "../store/settingsStore";
import { useOrcaSend, resolveOrcaBinding, type OrcaAgentTarget } from "./useOrcaSend";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";

export type OrcaPicker = null | { mode: "send" } | { mode: "bind"; tabId: string };

// Близнец getSendText из useTmuxActions. Держим локально (2 call-site, YAGNI —
// не выносим в shared-util, и не трогаем tmux-flow).
function readSendText(textarea: HTMLTextAreaElement | null, fallback: string): string {
  const hasSelection = textarea && textarea.selectionStart !== textarea.selectionEnd;
  return textarea
    ? hasSelection
      ? textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)
      : textarea.value
    : fallback;
}

export function useOrcaActions(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  const [orcaPicker, setOrcaPicker] = useState<OrcaPicker>(null);
  const tmuxAutoSubmit = useSettingsStore((s) => s.tmuxAutoSubmit);
  const sendToOrca = useOrcaSend();

  const getSendText = useCallback((): string | null => {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return null;
    return readSendText(textareaRef.current, tab.content);
  }, [textareaRef]);

  const handleOrcaSend = useCallback(async () => {
    const text = getSendText();
    if (text === null) return;

    if (!isTauri) {
      void sendToOrca(text, { handle: "", submit: tmuxAutoSubmit });
      return;
    }

    const { tabs, activeTabId } = useEditorStore.getState();
    const binding = tabs.find((t) => t.id === activeTabId)?.orcaBinding;
    if (!binding) {
      setOrcaPicker({ mode: "send" });
      return;
    }

    const handle = await resolveOrcaBinding(binding);
    if (handle) {
      void sendToOrca(text, { handle, submit: tmuxAutoSubmit });
    } else {
      toast(`Orca-агент «${binding.titleHint ?? binding.worktree}» не найден — выбери цель`, "info");
      setOrcaPicker({ mode: "send" });
    }
  }, [getSendText, sendToOrca, tmuxAutoSubmit]);

  const handleOrcaPick = useCallback((target: OrcaAgentTarget) => {
    const picker = orcaPicker;
    setOrcaPicker(null);
    if (!picker) return;

    if (picker.mode === "bind") {
      useEditorStore.getState().setOrcaBinding(picker.tabId, {
        worktree: target.worktreePath,
        titleHint: target.title,
      });
      toast(`Таб привязан к Orca «${target.displayName}·${target.title}»`, "success");
      return;
    }

    const text = getSendText();
    if (text === null) return;
    void sendToOrca(text, { handle: target.handle, submit: tmuxAutoSubmit });
  }, [orcaPicker, getSendText, sendToOrca, tmuxAutoSubmit]);

  const bindActiveTabOrca = useCallback(() => {
    const id = useEditorStore.getState().activeTabId;
    if (id) setOrcaPicker({ mode: "bind", tabId: id });
  }, []);

  const unbindActiveTabOrca = useCallback(() => {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    if (!tab.orcaBinding) {
      toast("Таб не привязан к Orca", "info");
      return;
    }
    useEditorStore.getState().setOrcaBinding(tab.id, null);
    toast("Таб отвязан от Orca", "success");
  }, []);

  return {
    orcaPicker,
    setOrcaPicker,
    handleOrcaSend,
    handleOrcaPick,
    bindActiveTabOrca,
    unbindActiveTabOrca,
  };
}
