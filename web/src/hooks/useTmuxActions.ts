import { useCallback, useState, type RefObject } from "react";
import { useEditorStore } from "../store/editorStore";
import { useSettingsStore } from "../store/settingsStore";
import { useTmuxStore } from "../store/tmuxStore";
import { useTmuxSend, resolveTmuxBinding, type TmuxPickTarget } from "./useTmuxSend";
import { isTauri } from "../lib/platform";
import { toast } from "../store/toastStore";

export type TmuxPicker = null | { mode: "send" } | { mode: "bind"; tabId: string };

// Owns the tmux send/bind orchestration: resolve chain (Explicit → Last →
// Picker), the picker modal state, and per-tab binding shortcuts.
export function useTmuxActions(textareaRef: RefObject<HTMLTextAreaElement | null>) {
  const [tmuxPicker, setTmuxPicker] = useState<TmuxPicker>(null);
  const tmuxAutoSubmit = useSettingsStore((s) => s.tmuxAutoSubmit);
  const sendToTmux = useTmuxSend();

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

  // Ctrl+Enter — цепочка резолва: Explicit (binding) → Last → Fallback (picker).
  const handleTmuxSend = useCallback(async () => {
    const text = getSendText();
    if (text === null) return;

    // Браузер: shell недоступен, sendToTmux сам уйдёт в clipboard.
    if (!isTauri) {
      void sendToTmux(text, { target: { mode: "active" }, submit: tmuxAutoSubmit });
      return;
    }

    const { tabs, activeTabId } = useEditorStore.getState();
    const binding = tabs.find((t) => t.id === activeTabId)?.tmuxBinding;

    // 1. Explicit — таб привязан к окну.
    if (binding) {
      const res = await resolveTmuxBinding(binding);
      if (res.ok) {
        void sendToTmux(text, { target: { mode: "pane", pane: res.paneId }, submit: tmuxAutoSubmit });
      } else if (res.reason === "ambiguous" && activeTabId) {
        // Несколько окон с этим именем — не угадываем, куда слать. Зовём перепривязать:
        // новый binding запомнит window_id и станет однозначным.
        toast(`Несколько tmux-окон с именем «${binding.window}» — привяжи заново`, "error");
        setTmuxPicker({ mode: "bind", tabId: activeTabId });
      } else {
        toast(`tmux-окно «${binding.window}» не найдено — выбери цель`, "info");
        setTmuxPicker({ mode: "send" });
      }
      return;
    }

    // 2. Last — последний выбор в picker'е (in-memory).
    const last = useTmuxStore.getState().lastTarget;
    if (last) {
      void sendToTmux(text, { target: { mode: "pane", pane: last.pane }, submit: tmuxAutoSubmit });
      return;
    }

    // 3. Fallback — picker.
    setTmuxPicker({ mode: "send" });
  }, [getSendText, sendToTmux, tmuxAutoSubmit]);

  // Выбор в picker'е: отправить (send-режим) или привязать таб (bind-режим).
  const handleTmuxPick = useCallback((target: TmuxPickTarget) => {
    const picker = tmuxPicker;
    setTmuxPicker(null);
    if (!picker) return;

    if (picker.mode === "bind") {
      useEditorStore.getState().setTabBinding(picker.tabId, {
        session: target.session,
        window: target.window,
        windowId: target.windowId,
      });
      toast(`Таб привязан к tmux-окну «${target.label}»`, "success");
      return;
    }

    const text = getSendText();
    if (text === null) return;
    void sendToTmux(text, { target: { mode: "pane", pane: target.paneId }, submit: tmuxAutoSubmit });
    useTmuxStore.getState().setLastTarget({ pane: target.paneId, label: target.label });
  }, [tmuxPicker, getSendText, sendToTmux, tmuxAutoSubmit]);

  const openBindPicker = useCallback((tabId: string) => {
    setTmuxPicker({ mode: "bind", tabId });
  }, []);

  // Ctrl+B — привязать/перепривязать активный таб.
  const bindActiveTab = useCallback(() => {
    const id = useEditorStore.getState().activeTabId;
    if (id) setTmuxPicker({ mode: "bind", tabId: id });
  }, []);

  // Ctrl+Shift+B — отвязать активный таб.
  const unbindActiveTab = useCallback(() => {
    const { tabs, activeTabId } = useEditorStore.getState();
    const tab = tabs.find((t) => t.id === activeTabId);
    if (!tab) return;
    if (!tab.tmuxBinding) {
      toast("Таб не привязан к tmux", "info");
      return;
    }
    useEditorStore.getState().setTabBinding(tab.id, null);
    toast(`Таб отвязан от «${tab.tmuxBinding.window}»`, "success");
  }, []);

  return {
    tmuxPicker,
    setTmuxPicker,
    handleTmuxSend,
    handleTmuxPick,
    openBindPicker,
    bindActiveTab,
    unbindActiveTab,
  };
}
